'use client';

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDevices } from './use-devices';
import { DEVICE_DETAIL_STALE_TIME } from './use-device';
import { fetchDevice } from '@/lib/api-client';
import { DEVICE_SORT_FIELDS, type DeviceSortField, type DeviceStatus, type SortDirection } from '@/lib/types';

const PAGE_SIZE = 20;

// Prefetch only fires once the cursor has rested on a row for this long,
// not on every row the cursor happens to cross while moving toward a
// different one - each row is a distinct queryKey, so unlike the search
// input's requests, there's no cancellation covering wasted ones here.
const HOVER_PREFETCH_DELAY_MS = 150;

const STATUS_STYLES: Record<DeviceStatus, string> = {
  online: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  offline: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
  rebooting: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
};

const COLUMN_LABELS: Record<DeviceSortField, string> = {
  hostname: 'Hostname',
  os: 'OS',
  status: 'Status',
  cpuPercent: 'CPU %',
  memoryPercent: 'Memory %',
  diskPercent: 'Disk %',
  lastCheckIn: 'Last Check-in',
};

interface DeviceTableProps {
  selectedDeviceId: string | null;
  onSelectDevice: (id: string) => void;
}

export function DeviceTable({ selectedDeviceId, onSelectDevice }: DeviceTableProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DeviceStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<DeviceSortField>('hostname');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const queryClient = useQueryClient();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isPending, isError, isPlaceholderData, refetch } = useDevices({
    page,
    pageSize: PAGE_SIZE,
    search,
    status,
    sortBy,
    sortDir,
  });

  // Warms the cache for this device's detail query before the user has
  // even clicked. If they do click, useDevice's queryKey
  // (['devices', 'detail', id]) matches this prefetched entry exactly, so
  // the panel renders from cache instead of waiting out another round trip.
  function prefetchDevice(id: string) {
    queryClient.prefetchQuery({
      queryKey: ['devices', 'detail', id],
      queryFn: ({ signal }) => fetchDevice(id, signal),
      staleTime: DEVICE_DETAIL_STALE_TIME,
    });
  }

  function handleRowEnter(id: string) {
    hoverTimer.current = setTimeout(() => prefetchDevice(id), HOVER_PREFETCH_DELAY_MS);
  }

  function handleRowLeave() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  function toggleSort(column: DeviceSortField) {
    if (column === sortBy) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
  }

  // A new search or status filter can shrink the result set out from under
  // whatever page you were on, so start over at page 1 rather than landing
  // on a page that may no longer exist for the new filter.
  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStatus(value: DeviceStatus | 'all') {
    setStatus(value);
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search hostname..."
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <select
          value={status}
          onChange={(e) => updateStatus(e.target.value as DeviceStatus | 'all')}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="all">All statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="rebooting">Rebooting</option>
        </select>
        {isPlaceholderData && <span className="text-xs text-zinc-400">refreshing...</span>}
      </div>

      {isError && (
        <p className="text-sm text-red-500">
          Failed to load devices.{' '}
          <button onClick={() => refetch()} className="underline">
            Retry
          </button>
        </p>
      )}

      <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left dark:bg-zinc-900">
            <tr>
              {DEVICE_SORT_FIELDS.map((column) => (
                <th
                  key={column}
                  onClick={() => toggleSort(column)}
                  className="cursor-pointer select-none px-3 py-2 font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {COLUMN_LABELS[column]}
                  {sortBy === column && (sortDir === 'asc' ? ' ▲' : ' ▼')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isPending &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="animate-pulse border-t border-zinc-100 dark:border-zinc-800">
                  {DEVICE_SORT_FIELDS.map((column) => (
                    <td key={column} className="px-3 py-2">
                      <div className="h-3 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
                    </td>
                  ))}
                </tr>
              ))}
            {!isPending &&
              data?.devices.map((device) => (
                <tr
                  key={device.id}
                  onMouseEnter={() => handleRowEnter(device.id)}
                  onMouseLeave={handleRowLeave}
                  onClick={() => onSelectDevice(device.id)}
                  className={`cursor-pointer border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50 ${
                    device.id === selectedDeviceId ? 'bg-blue-50 dark:bg-blue-950/30' : ''
                  }`}
                >
                  <td className="px-3 py-2 font-mono">{device.hostname}</td>
                  <td className="px-3 py-2">{device.os}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[device.status]}`}>
                      {device.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{device.cpuPercent}%</td>
                  <td className="px-3 py-2">{device.memoryPercent}%</td>
                  <td className="px-3 py-2">{device.diskPercent}%</td>
                  <td className="px-3 py-2 text-zinc-500">{new Date(device.lastCheckIn).toLocaleTimeString()}</td>
                </tr>
              ))}
            {!isPending && data?.devices.length === 0 && (
              <tr>
                <td colSpan={DEVICE_SORT_FIELDS.length} className="px-3 py-6 text-center text-zinc-400">
                  No devices match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          Page {page} of {totalPages} ({data?.total ?? 0} devices total)
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40 dark:border-zinc-700"
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-40 dark:border-zinc-700"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
