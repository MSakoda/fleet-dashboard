'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchDeviceAlerts } from '@/lib/api-client';

// The dependent query: only runs once a device is selected. enabled: false
// keeps it idle - no fetch, no cache entry - for every device that isn't
// currently open. Nested under the same ['devices', 'detail', id, ...]
// prefix as use-device.ts, so invalidateQueries({queryKey: ['devices',
// 'detail', id]}) reaches both this and the device's own detail query,
// and invalidateQueries({queryKey: ['devices']}) reaches everything.
export function useDeviceAlerts(id: string | null) {
  return useQuery({
    queryKey: ['devices', 'detail', id, 'alerts'],
    queryFn: ({ signal }) => fetchDeviceAlerts(id as string, signal),
    enabled: id !== null,
    staleTime: 10_000,
    gcTime: 2 * 60_000,
  });
}
