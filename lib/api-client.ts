import type { Alert, AlertListResponse, Device, DeviceListParams, DeviceListResponse, RebootResponse } from './types';

export async function fetchDevices(
  params: Partial<DeviceListParams>,
  signal?: AbortSignal,
): Promise<DeviceListResponse> {
  const query = new URLSearchParams();
  if (params.page != null) query.set('page', String(params.page));
  if (params.pageSize != null) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.sortBy) query.set('sortBy', params.sortBy);
  if (params.sortDir) query.set('sortDir', params.sortDir);

  const res = await fetch(`/api/devices?${query.toString()}`, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load devices (${res.status})`);
  }
  return res.json();
}

export async function fetchAlerts(signal?: AbortSignal): Promise<AlertListResponse> {
  const res = await fetch('/api/alerts', { signal });
  if (!res.ok) {
    throw new Error(`Failed to load alerts (${res.status})`);
  }
  return res.json();
}

export async function fetchDevice(id: string, signal?: AbortSignal): Promise<Device> {
  const res = await fetch(`/api/devices/${id}`, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load device (${res.status})`);
  }
  return res.json();
}

export async function fetchDeviceAlerts(id: string, signal?: AbortSignal): Promise<AlertListResponse> {
  const res = await fetch(`/api/devices/${id}/alerts`, { signal });
  if (!res.ok) {
    throw new Error(`Failed to load device alerts (${res.status})`);
  }
  return res.json();
}

export async function acknowledgeAlert(id: string, fail: boolean, signal?: AbortSignal): Promise<Alert> {
  const query = fail ? '?fail=1' : '';
  const res = await fetch(`/api/alerts/${id}/acknowledge${query}`, { method: 'POST', signal });
  if (!res.ok) {
    throw new Error(`Failed to acknowledge alert (${res.status})`);
  }
  return res.json();
}

export async function rebootDevice(id: string, signal?: AbortSignal): Promise<RebootResponse> {
  const res = await fetch(`/api/devices/${id}/reboot`, { method: 'POST', signal });
  if (!res.ok) {
    throw new Error(`Failed to reboot device (${res.status})`);
  }
  return res.json();
}
