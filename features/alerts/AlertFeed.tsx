'use client';

import { useState } from 'react';
import { useAlertFeed } from './use-alert-feed';
import { useAcknowledgeAlert } from './use-acknowledge-alert';
import { useUnacknowledgedAlertCount } from './use-unacknowledged-count';
import type { Alert, AlertListResponse, AlertSeverity } from '@/lib/types';

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  critical: 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
  warning:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  info: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
};

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

// One sentence for a screen reader. Names the most severe new alert, and
// ends with its timestamp so two back-to-back announcements are never
// identical text (an unchanged live region is not re-read).
function describeNewAlerts(newAlerts: Alert[]): string {
  const top = [...newAlerts].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.createdAt < b.createdAt ? 1 : -1),
  )[0];
  const time = new Date(top.createdAt).toLocaleTimeString();
  const lead = newAlerts.length === 1 ? 'New alert' : `${newAlerts.length} new alerts, most severe`;
  return `${lead}: ${top.severity}, ${top.message} on ${top.hostname}, at ${time}`;
}

export function AlertFeed() {
  const { data, isPending, isError, refetch } = useAlertFeed();

  // Announce alerts that weren't in the previous data. The 5s poll rewrites
  // the whole list, so putting aria-live on the list itself would re-read
  // everything every time; only genuinely new ids are worth interrupting for.
  // Acknowledge toggles and their rollbacks keep the same ids, so stay quiet.
  // Adjusting state while rendering (not in an effect) avoids a second pass.
  const [previousData, setPreviousData] = useState<AlertListResponse | undefined>(undefined);
  const [announcement, setAnnouncement] = useState('');
  if (data !== previousData) {
    setPreviousData(data);
    if (data && previousData) {
      const knownIds = new Set(previousData.alerts.map((alert) => alert.id));
      const newAlerts = data.alerts.filter((alert) => !knownIds.has(alert.id));
      if (newAlerts.length > 0) setAnnouncement(describeNewAlerts(newAlerts));
    }
  }
  const { data: unacknowledgedCount } = useUnacknowledgedAlertCount();
  const acknowledgeMutation = useAcknowledgeAlert();
  const [simulateFailure, setSimulateFailure] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
          Recent Alerts
          {!!unacknowledgedCount && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-normal text-red-700 dark:bg-red-950/60 dark:text-red-300">
              {unacknowledgedCount} unacknowledged
            </span>
          )}
        </h2>
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={simulateFailure}
            onChange={(e) => setSimulateFailure(e.target.checked)}
          />
          simulate failures
        </label>
      </div>

      {/* Always mounted: a live region that appears together with its text is often not announced. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {isPending && <p className="text-sm text-zinc-600 dark:text-zinc-400">loading alerts...</p>}
      {isError && (
        <p className="text-sm text-red-700 dark:text-red-400">
          Failed to load alerts.{' '}
          <button onClick={() => refetch()} className="underline">
            Retry
          </button>
        </p>
      )}

      {data && data.alerts.length === 0 && <p className="text-sm text-zinc-600 dark:text-zinc-400">No recent alerts.</p>}
      {!!data?.alerts.length && (
        <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
          {data.alerts.map((alert) => {
            const isThisAlert = acknowledgeMutation.variables?.id === alert.id;
            const isMutating = acknowledgeMutation.isPending && isThisAlert;
            const justFailed = acknowledgeMutation.isError && isThisAlert;

            return (
              <li
                key={alert.id}
                className={`rounded border px-3 py-2 text-sm ${SEVERITY_STYLES[alert.severity]} ${
                  alert.acknowledged ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">{alert.hostname}</span>
                  <span className="text-xs uppercase tracking-wide">{alert.severity}</span>
                </div>
                <p>{alert.message}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">{new Date(alert.createdAt).toLocaleTimeString()}</span>
                  <button
                    onClick={() => acknowledgeMutation.mutate({ id: alert.id, fail: simulateFailure })}
                    disabled={isMutating}
                    className="text-xs underline disabled:opacity-40"
                  >
                    {isMutating ? 'saving...' : alert.acknowledged ? 'unacknowledge' : 'acknowledge'}
                  </button>
                </div>
                {justFailed && <p className="mt-1 text-xs text-red-700 dark:text-red-400">Failed to save, change rolled back.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
