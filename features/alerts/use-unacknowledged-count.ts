'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAlerts } from '@/lib/api-client';

// Same queryKey as useAlertFeed, so this shares that query's cache entry
// instead of firing its own fetch. select re-derives a count from the
// existing data, and only causes a re-render here when the count itself
// changes, not on every alert-feed update (e.g. a message field changing
// wouldn't re-render whatever reads this hook, only an acknowledged flag
// flipping would). Relies on useAlertFeed (called alongside this in
// AlertFeed.tsx) to actually keep the underlying data polling and fresh -
// this hook alone declares no refetchInterval of its own.
export function useUnacknowledgedAlertCount() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: ({ signal }) => fetchAlerts(signal),
    select: (data) => data.alerts.filter((alert) => !alert.acknowledged).length,
  });
}
