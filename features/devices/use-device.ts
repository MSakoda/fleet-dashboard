'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchDevice } from '@/lib/api-client';

// Exported so the row-hover prefetch call in DeviceTable uses the exact
// same staleTime - otherwise a prefetch right after a real fetch (or vice
// versa) would refetch redundantly instead of treating the cache as fresh.
export const DEVICE_DETAIL_STALE_TIME = 10_000;

// Nested under the same 'devices' prefix as the list query (use-devices.ts)
// and the alerts query below, so invalidateQueries({queryKey: ['devices']})
// reaches all three, and ['devices', 'detail', id] reaches just this device.
export function useDevice(id: string | null) {
  return useQuery({
    queryKey: ['devices', 'detail', id],
    // enabled below guarantees id is non-null whenever this actually runs,
    // but TanStack doesn't narrow the type for us, hence the assertion.
    queryFn: ({ signal }) => fetchDevice(id as string, signal),
    enabled: id !== null,
    staleTime: DEVICE_DETAIL_STALE_TIME,
    gcTime: 2 * 60_000,
  });
}
