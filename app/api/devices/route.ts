import { NextRequest, NextResponse } from 'next/server';
import { delay, randomLatencyMs } from '@/lib/delay';
import { driftDevices, getDeviceStore } from '@/lib/seed';
import {
  DEVICE_SORT_FIELDS,
  type Device,
  type DeviceListResponse,
  type DeviceSortField,
  type DeviceStatus,
} from '@/lib/types';

function isDeviceSortField(value: string | null): value is DeviceSortField {
  return !!value && (DEVICE_SORT_FIELDS as readonly string[]).includes(value);
}

function getSortValue(device: Device, field: DeviceSortField): string | number {
  return device[field];
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize')) || 20));
  const search = params.get('search')?.trim().toLowerCase() ?? '';
  const statusParam = params.get('status') as DeviceStatus | 'all' | null;
  const sortByParam = params.get('sortBy');
  const sortBy: DeviceSortField = isDeviceSortField(sortByParam) ? sortByParam : 'hostname';
  const sortDir = params.get('sortDir') === 'desc' ? 'desc' : 'asc';

  try {
    await delay(randomLatencyMs(), request.signal);
  } catch {
    // The client (TanStack Query) already cancelled this request, most
    // often because the queryKey changed again before the first one
    // resolved. Stop here instead of filtering/sorting 200 devices for a
    // response nobody will read.
    console.log('[GET /api/devices] aborted by client, skipping work');
    return new NextResponse(null, { status: 499 });
  }

  const store = getDeviceStore();
  driftDevices(store);

  let filtered = store;
  if (search) {
    filtered = filtered.filter((device) => device.hostname.toLowerCase().includes(search));
  }
  if (statusParam && statusParam !== 'all') {
    filtered = filtered.filter((device) => device.status === statusParam);
  }

  const sorted = [...filtered].sort((a, b) => {
    const aVal = getSortValue(a, sortBy);
    const bVal = getSortValue(b, sortBy);
    const result =
      typeof aVal === 'string' && typeof bVal === 'string'
        ? aVal.localeCompare(bVal)
        : Number(aVal) - Number(bVal);
    return sortDir === 'desc' ? -result : result;
  });

  const total = sorted.length;
  const start = (page - 1) * pageSize;
  const devices = sorted.slice(start, start + pageSize);

  const body: DeviceListResponse = { devices, total, page, pageSize };
  return NextResponse.json(body);
}
