'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { fetchDevices } from '@/lib/api-client';
import type { DeviceSortField, DeviceStatus, SortDirection } from '@/lib/types';

interface UseDevicesArgs {
  page: number;
  pageSize: number;
  search: string;
  status: DeviceStatus | 'all';
  sortBy: DeviceSortField;
  sortDir: SortDirection;
}

// Every filter/sort/pagination input lives in the queryKey, so a new search
// term or a new status filter is just a new cache entry, fetched from the
// server rather than sliced out of whatever page happened to be cached.
//
// 'devices' is the shared namespace for every device-related query (see
// use-device.ts, use-device-alerts.ts) so invalidateQueries({queryKey:
// ['devices']}) can reach all of them at once. 'list' distinguishes this
// from the singular detail/alerts queries nested under the same prefix.
export function useDevices(args: UseDevicesArgs) {
  return useQuery({
    queryKey: ['devices', 'list', args],
    queryFn: ({ signal }) => fetchDevices(args, signal),
    placeholderData: keepPreviousData,
    // Metrics drift server-side on every read, so nothing is ever truly
    // "fresh." 10s just keeps the table from refetching on every re-render
    // or refocus while still catching drift within a reasonable window.
    staleTime: 10_000,
    // Long enough that paging back to a recently-viewed page is instant
    // from cache, short enough that a long-running demo session doesn't
    // accumulate an unbounded number of cached pages.
    gcTime: 2 * 60_000,
  });
}
