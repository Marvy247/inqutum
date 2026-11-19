/**
 * In-memory implementation of the IdempotencyStore (Issue #358, #360).
 *
 * Provides atomic in-memory locking and replay capabilities with bounded memory
 * footprint and O(1) operational complexity.
 */

import type { IdempotencyStore, BeginOptions, IdempotencyDecision, StoredResponse } from './store';

interface StoredIdempotencyRecord {
  scope: string;
  key: string;
  fingerprint: string;
  state: 'in_progress' | 'completed';
  lockExpiresAt: number;
  expiresAt: number;
  response?: StoredResponse;
  completedAt?: Date;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, StoredIdempotencyRecord>();
  private readonly maxRecords: number;

  constructor(maxRecords = 10_000) {
    this.maxRecords = maxRecords;
  }

  private compositeKey(scope: string, key: string): string {
    return `${scope}:${key}`;
  }

  /**
   * Begins an idempotent operation.
   *
   * Time Complexity:  O(1) Map lookup and conditional insertion
   * Space Complexity: O(1) per record
   */
  async begin(options: BeginOptions): Promise<IdempotencyDecision> {
    const { scope, key, fingerprint, now, ttlMs, lockMs } = options;
    const ck = this.compositeKey(scope, key);
    const nowMs = now.getTime();

    const existing = this.records.get(ck);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return { kind: 'conflict' };
      }

      if (existing.expiresAt <= nowMs) {
        return { kind: 'expired' };
      }

      if (existing.state === 'completed') {
        return {
          kind: 'replay',
          response: existing.response ?? { status: 200, body: null },
        };
      }

      if (existing.state === 'in_progress') {
        if (existing.lockExpiresAt > nowMs) {
          return { kind: 'in_progress' };
        }
        // Lock expired; renew lock for recovery
        existing.lockExpiresAt = nowMs + lockMs;
        existing.expiresAt = nowMs + ttlMs;
        return { kind: 'new' };
      }
    }

    // Enforce bound on memory map if capacity reached
    if (this.records.size >= this.maxRecords) {
      const firstKey = this.records.keys().next().value;
      if (firstKey !== undefined) {
        this.records.delete(firstKey);
      }
    }

    this.records.set(ck, {
      scope,
      key,
      fingerprint,
      state: 'in_progress',
      lockExpiresAt: nowMs + lockMs,
      expiresAt: nowMs + ttlMs,
    });

    return { kind: 'new' };
  }

  /**
   * Completes an operation and caches its response.
   *
   * Time Complexity:  O(1)
   * Space Complexity: O(1)
   */
  async complete(scope: string, key: string, response: StoredResponse, now: Date): Promise<void> {
    const ck = this.compositeKey(scope, key);
    const record = this.records.get(ck);
    if (record) {
      record.state = 'completed';
      record.response = response;
      record.completedAt = now;
    }
  }

  /**
   * Releases an in-progress lock so subsequent retries can proceed.
   *
   * Time Complexity:  O(1)
   * Space Complexity: O(1)
   */
  async release(scope: string, key: string): Promise<void> {
    const ck = this.compositeKey(scope, key);
    const record = this.records.get(ck);
    if (record && record.state === 'in_progress') {
      this.records.delete(ck);
    }
  }

  /**
   * Marks a key as stale so it can be refreshed/reprocessed.
   * Useful for recovery when a previously in-progress operation needs to be
   * re-attempted after a system restart or reset.
   *
   * Time Complexity:  O(1)
   * Space Complexity: O(1)
   */
  async markStale(scope: string, key: string): Promise<void> {
    const ck = this.compositeKey(scope, key);
    const record = this.records.get(ck);
    if (record && record.state === 'in_progress') {
      record.state = 'stale';
    }
  }

  /**
   * Helper to inspect internal count in tests.
   */
  size(): number {
    return this.records.size;
  }

  /**
   * Helper to clear store in tests.
   */
  clear(): void {
    this.records.clear();
  }
}

