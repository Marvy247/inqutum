export type MonitorStatus = 'listening' | 'paused' | 'reconnecting' | 'degraded' | 'error';

export interface PayMonitorPanelProps {
  active?: boolean | null | undefined;
  intervalMs?: number | string | null | undefined;
  status?: MonitorStatus | string | null | undefined;
  error?: string | Error | null | undefined;
  onRetry?: () => void;
}

export interface PayMonitorViewModel {
  active: boolean;
  status: MonitorStatus;
  title: string;
  description: string;
  intervalSeconds: number;
  intervalText: string | null;
  isDegraded: boolean;
  hasError: boolean;
  retryable: boolean;
}export function normalizeIntervalMs(intervalMs: any, defaultIntervalMs?: number): number;
export function resolvePayMonitorViewModel(props?: PayMonitorPanelProps | null): PayMonitorViewModel;

export function validateMonitorStatus(status: string): MonitorStatus;
export function formatMonitorInterval(intervalMs: number): string;


