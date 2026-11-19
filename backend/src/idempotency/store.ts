/**
 * Core interface and types for the Idempotency Store (Issue #358, #360).
 *
 * Provides safe duplicate suppression, concurrency locking, and idempotent
 * replay for webhooks and background jobs.
 */

export interface BeginOptions {
  scope: string;
  key: string;
  fingerprint: string;
  now: Date;
  ttlMs: number;
  lockMs: number;
}

export interface StoredResponse {
  status: number;
  body?: unknown;
}

export type IdempotencyDecision =
  | { kind: 'new' }
  | { kind: 'replay'; response: StoredResponse }
  | { kind: 'in_progress' }
  | { kind: 'conflict' }
  | { kind: 'expired' }
  | { kind: 'stale' };

export interface IdempotencyStore {
  /**
   * Attempts to begin processing an idempotent operation under a scoped key.
   * Acquires a transient lock if the key is new or timed out.
   */
  begin(options: BeginOptions): Promise<IdempotencyDecision>;

  /**
   * Commits the operation result and transitions state from in_progress to completed.
   */
  complete(scope: string, key: string, response: StoredResponse, now: Date): Promise<void>;

  /**
   * Releases an in-progress lock on failure so subsequent retries can proceed.
   */
  release(scope: string, key: string): Promise<void>;

  /**
   * Marks a key as stale so it can be refreshed/reprocessed.
   * Useful for recovery when a previously in-progress operation needs to be
   * re-attempted after a system restart or reset.
   */
  markStale(scope: string, key: string): Promise<void>;
}

