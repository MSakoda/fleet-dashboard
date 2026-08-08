'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAlerts } from '@/lib/api-client';

const POLL_INTERVAL_MS = 5_000;

export function useAlertFeed() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: ({ signal }) => fetchAlerts(signal),
    refetchInterval: POLL_INTERVAL_MS,
    // Don't keep polling a tab nobody is looking at. TanStack's focus
    // manager picks polling back up automatically on refocus, so this only
    // costs freshness while the tab is hidden, not after it comes back.
    refetchIntervalInBackground: false,
    // The interval is what keeps this "live," not staleTime. 0 here is
    // deliberate: a refocus or remount should also refetch immediately
    // rather than waiting out the rest of the interval.
    staleTime: 0,
    // The default (3 retries with exponential backoff) would stack extra
    // delay on top of a poll cycle that's already going to try again in a
    // few seconds regardless. One retry is enough to shrug off a single
    // blip without holding up the next scheduled poll.
    retry: 1,
  });
}
