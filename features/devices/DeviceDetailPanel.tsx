'use client';

import { useEffect, useId, useRef } from 'react';
import { useDevice } from './use-device';
import { useDeviceAlerts } from './use-device-alerts';
import { useRebootDevice } from './use-reboot-device';

interface DeviceDetailPanelProps {
  deviceId: string | null;
  onClose: () => void;
}

export function DeviceDetailPanel({ deviceId, onClose }: DeviceDetailPanelProps) {
  const {
    data: device,
    isPending: isDevicePending,
    isError: isDeviceError,
    refetch: refetchDevice,
  } = useDevice(deviceId);
  const {
    data: alertsData,
    isPending: isAlertsPending,
    isError: isAlertsError,
    refetch: refetchAlerts,
  } = useDeviceAlerts(deviceId);
  const rebootMutation = useRebootDevice();
  const panelRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  // Opening the panel (or switching to another device while it's open) puts
  // focus inside it, so a keyboard or screen reader user lands on the new
  // content instead of staying on the table row behind it. Returning focus
  // to the row on close is the table's job, since it owns the rows.
  useEffect(() => {
    if (deviceId) panelRef.current?.focus();
  }, [deviceId]);

  if (!deviceId) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby={headingId}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-zinc-200 bg-white p-6 shadow-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex items-center justify-between">
        <h2 id={headingId} className="text-lg font-semibold text-black dark:text-zinc-50">
          Device Detail
        </h2>
        <button onClick={onClose} className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200">
          Close
        </button>
      </div>

      {isDevicePending && <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">loading device...</p>}
      {isDeviceError && (
        <p className="mt-4 text-sm text-red-700 dark:text-red-400">
          Failed to load device.{' '}
          <button onClick={() => refetchDevice()} className="underline">
            Retry
          </button>
        </p>
      )}

      {device && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-600 dark:text-zinc-400">Hostname</dt>
          <dd className="font-mono">{device.hostname}</dd>
          <dt className="text-zinc-600 dark:text-zinc-400">OS</dt>
          <dd>{device.os}</dd>
          <dt className="text-zinc-600 dark:text-zinc-400">Status</dt>
          <dd>{device.status}</dd>
          <dt className="text-zinc-600 dark:text-zinc-400">CPU</dt>
          <dd>{device.cpuPercent}%</dd>
          <dt className="text-zinc-600 dark:text-zinc-400">Memory</dt>
          <dd>{device.memoryPercent}%</dd>
          <dt className="text-zinc-600 dark:text-zinc-400">Disk</dt>
          <dd>{device.diskPercent}%</dd>
          <dt className="text-zinc-600 dark:text-zinc-400">Last check-in</dt>
          <dd>{new Date(device.lastCheckIn).toLocaleTimeString()}</dd>
        </dl>
      )}

      {device && (
        <button
          onClick={() => rebootMutation.mutate(device.id)}
          disabled={device.status === 'rebooting' || rebootMutation.isPending}
          className="mt-4 rounded border border-zinc-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-zinc-700"
        >
          {device.status === 'rebooting' ? 'Rebooting...' : 'Reboot device'}
        </button>
      )}

      <h3 className="mt-6 text-sm font-semibold text-zinc-600 dark:text-zinc-400">Alert History</h3>
      {isAlertsPending && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">loading alert history...</p>}
      {isAlertsError && (
        <p className="mt-2 text-sm text-red-700 dark:text-red-400">
          Failed to load alert history.{' '}
          <button onClick={() => refetchAlerts()} className="underline">
            Retry
          </button>
        </p>
      )}
      {alertsData && alertsData.alerts.length === 0 && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">No alert history for this device.</p>
      )}
      {!!alertsData?.alerts.length && (
        <ul className="mt-2 flex flex-col gap-2">
          {alertsData.alerts.map((alert) => (
            <li key={alert.id} className="rounded border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{alert.severity}</span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{new Date(alert.createdAt).toLocaleTimeString()}</span>
              </div>
              <p>{alert.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
