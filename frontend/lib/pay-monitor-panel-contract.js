/**
 * Pure contract logic for the PayMonitorPanel boundary (Issue #163).
 *
 * Defines and normalizes monitor states, interval timings, degradation fallbacks,
 * and recovery retry metadata without DOM dependencies.
 */

const DEFAULT_POLL_INTERVAL_MS = 3000;
const MIN_POLL_INTERVAL_MS = 1000;
const MAX_POLL_INTERVAL_MS = 60000;

/**
 * Normalizes polling interval in milliseconds to a safe positive integer.
 *
 * Time Complexity:  O(1)
 * Space Complexity: O(1)
 *
 * @param {any} intervalMs
 * @param {number} [defaultIntervalMs=3000]
 * @returns {number}
 */
function normalizeIntervalMs(intervalMs, defaultIntervalMs = DEFAULT_POLL_INTERVAL_MS) {
  const parsed = typeof intervalMs === 'string' ? parseFloat(intervalMs) : intervalMs;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultIntervalMs;
  }
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, Math.round(parsed)));
}

/**
 * Resolves the view model and presentation state for PayMonitorPanel.
 *
 * Time Complexity:  O(1)
 * Space Complexity: O(1)
 *
 * @param {any} [props]
 * @returns {{
 *   active: boolean;
 *   status: 'listening' | 'paused' | 'reconnecting' | 'degraded' | 'error';
 *   title: string;
 *   description: string;
 *   intervalSeconds: number;
 *   intervalText: string | null;
 *   isDegraded: boolean;
 *   hasError: boolean;
 *   retryable: boolean;
 * }}
 */
function resolvePayMonitorViewModel(props) {
  const safeProps = props && typeof props === 'object' ? props : {};
  const active = Boolean(safeProps.active);
  const intervalMs = normalizeIntervalMs(safeProps.intervalMs);
  const intervalSeconds = Math.round(intervalMs / 1000);

  let rawStatus = typeof safeProps.status === 'string' ? safeProps.status.toLowerCase().trim() : null;
  if (!rawStatus) {
    if (safeProps.error) {
      rawStatus = 'error';
    } else {
      rawStatus = active ? 'listening' : 'paused';
    }
  }

  let status = 'paused';
  let title = 'Payment monitoring stopped';
  let description = 'Manual verification remains available.';
  let intervalText = null;
  let isDegraded = false;
  let hasError = false;
  let retryable = false;

  switch (rawStatus) {
    case 'listening': {
      status = 'listening';
      title = 'Listening for payment';
      description = 'The invoice status updates automatically after confirmation.';
      intervalText = `Checking every ${intervalSeconds} seconds.`;
      break;
    }
    case 'reconnecting': {
      status = 'reconnecting';
      title = 'Reconnecting payment monitor';
      description = 'Connection interrupted. Re-establishing payment stream...';
      isDegraded = true;
      retryable = true;
      break;
    }
    case 'degraded': {
      status = 'degraded';
      title = 'Payment monitoring degraded';
      description = 'Network delays detected. Background polling is reduced; manual verification is recommended.';
      isDegraded = true;
      retryable = true;
      break;
    }
    case 'error': {
      status = 'error';
      title = 'Payment monitor unavailable';
      const errMsg = safeProps.error instanceof Error ? safeProps.error.message : typeof safeProps.error === 'string' ? safeProps.error : null;
      description = errMsg ? `Error: ${errMsg}. Manual verification remains available.` : 'Failed to poll payment status. Manual verification remains available.';
      hasError = true;
      retryable = true;
      break;
    }
    case 'paused':
    default: {
      status = 'paused';
      title = 'Payment monitoring stopped';
      description = 'Manual verification remains available.';
      break;
    }
  }

  return {
    active: status === 'listening',
    status,
    title,
    description,
    intervalSeconds,
    intervalText,
    isDegraded,
    hasError,
    retryable,
  };
}

module.exports = {
  DEFAULT_POLL_INTERVAL_MS,
  MIN_POLL_INTERVAL_MS,
  MAX_POLL_INTERVAL_MS,
  normalizeIntervalMs,
  resolvePayMonitorViewModel,
  validateMonitorStatus,
  formatMonitorInterval,
};

/**
 * Validates a status string and returns the normalized MonitorStatus.
 *
 * Time Complexity:  O(1)
 * Space Complexity: O(1)
 *
 * @param {string} status
 * @returns {MonitorStatus}
 */
function validateMonitorStatus(status) {
  const lower = (status || '').toLowerCase().trim();
  const validStatuses = ['listening', 'paused', 'reconnecting', 'degraded', 'error'];
  if (validStatuses.includes(lower)) {
    return lower as MonitorStatus;
  }
  return 'paused';
}

/**
 * Formats a polling interval in milliseconds to a human-readable string.
 *
 * Time Complexity:  O(1)
 * Space Complexity: O(1)
 *
 * @param {number} intervalMs
 * @returns {string}
 */
function formatMonitorInterval(intervalMs) {
  const seconds = Math.round(intervalMs / 1000);
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
  return `${seconds}s`;
}

