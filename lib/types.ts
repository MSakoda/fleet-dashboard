export type DeviceStatus = 'online' | 'offline' | 'rebooting';
export type DeviceOS = 'Windows' | 'macOS' | 'Linux';

export interface Device {
  id: string;
  hostname: string;
  os: DeviceOS;
  status: DeviceStatus;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  lastCheckIn: string; // ISO timestamp
}

export const DEVICE_SORT_FIELDS = [
  'hostname',
  'os',
  'status',
  'cpuPercent',
  'memoryPercent',
  'diskPercent',
  'lastCheckIn',
] as const;

export type DeviceSortField = (typeof DEVICE_SORT_FIELDS)[number];
export type SortDirection = 'asc' | 'desc';

export interface DeviceListParams {
  page: number;
  pageSize: number;
  search: string;
  status: DeviceStatus | 'all';
  sortBy: DeviceSortField;
  sortDir: SortDirection;
}

export interface DeviceListResponse {
  devices: Device[];
  total: number;
  page: number;
  pageSize: number;
}

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface Alert {
  id: string;
  deviceId: string;
  hostname: string;
  severity: AlertSeverity;
  message: string;
  acknowledged: boolean;
  createdAt: string; // ISO timestamp
}

export interface AlertListResponse {
  alerts: Alert[];
}

export interface RebootResponse {
  device: Device;
  rebootDurationMs: number;
}
