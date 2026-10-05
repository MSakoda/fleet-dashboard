import { describe, expect, it, vi } from 'vitest';
import { http } from 'msw';
import { NextRequest } from 'next/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GET as getDevices } from '@/app/api/devices/route';
import { getDeviceStore } from '@/lib/seed';
import { renderWithClient } from '@/test/render-with-client';
import { server } from '@/test/msw/server';
import { DeviceTable } from './DeviceTable';

const PAGE_SIZE = 20;

function renderTable() {
  return renderWithClient(<DeviceTable selectedDeviceId={null} onSelectDevice={vi.fn()} />);
}

// Data rows only: skeleton rows and the "No devices match" row have no
// hostname-shaped first cell.
function dataRows() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .filter((row) => /-\d{4}$/.test(within(row).getAllByRole('cell')[0].textContent ?? ''));
}

function columnValues(index: number): string[] {
  return dataRows().map((row) => within(row).getAllByRole('cell')[index].textContent ?? '');
}

const hostnames = () => columnValues(0);

async function waitForRows() {
  await waitFor(() => expect(dataRows().length).toBeGreaterThan(0));
}

describe('DeviceTable', () => {
  it('filtering by status replaces the rows with only matching devices', async () => {
    const user = userEvent.setup();
    renderTable();
    await waitForRows();
    expect(screen.getByText(/200 devices total/)).toBeInTheDocument();

    const offlineCount = getDeviceStore().filter((d) => d.status === 'offline').length;
    expect(offlineCount).toBeGreaterThan(0);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'offline');

    await waitFor(() =>
      expect(screen.getByText(new RegExp(`${offlineCount} devices total`))).toBeInTheDocument(),
    );
    await waitFor(() => expect(columnValues(2).every((s) => s === 'offline')).toBe(true));
    expect(dataRows()).toHaveLength(Math.min(PAGE_SIZE, offlineCount));
  });

  it('clicking a column header sorts ascending, and clicking again reverses it', async () => {
    const user = userEvent.setup();
    renderTable();
    await waitForRows();

    // Sorting is server-side across the whole fleet, so page 1 descending is
    // the top of the full descending order, not page 1 reversed.
    const all = getDeviceStore()
      .map((d) => d.hostname)
      .sort((a, b) => a.localeCompare(b));
    const ascending = all.slice(0, PAGE_SIZE);
    const descending = [...all].reverse().slice(0, PAGE_SIZE);
    expect(hostnames()).toEqual(ascending);

    await user.click(screen.getByRole('columnheader', { name: /Hostname/ }));
    await waitFor(() => expect(hostnames()).toEqual(descending));
    expect(screen.getByRole('columnheader', { name: /Hostname ▼/ })).toBeInTheDocument();

    await user.click(screen.getByRole('columnheader', { name: /Hostname/ }));
    await waitFor(() => expect(hostnames()).toEqual(ascending));
  });

  it('sorting by a numeric column orders by value, not by text', async () => {
    const user = userEvent.setup();
    renderTable();
    await waitForRows();

    await user.click(screen.getByRole('columnheader', { name: /CPU %/ }));
    await waitFor(() => expect(screen.getByRole('columnheader', { name: /CPU % ▲/ })).toBeInTheDocument());
    await waitFor(() => {
      const cpu = columnValues(3).map((v) => parseInt(v, 10));
      expect(cpu).toEqual([...cpu].sort((a, b) => a - b));
      // 5-90% spans single and double digits, so a text sort would fail.
      expect(new Set(cpu).size).toBeGreaterThan(1);
    });
  });

  it('keeps the previous page visible until the next one arrives', async () => {
    const user = userEvent.setup();
    renderTable();
    await waitForRows();
    const pageOne = hostnames();
    expect(screen.getByText(/Page 1 of 10/)).toBeInTheDocument();

    // Hold page 2's response open so the in-between state is observable.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get('/api/devices', async ({ request }) => {
        if (new URL(request.url).searchParams.get('page') === '2') await gate;
        return getDevices(new NextRequest(request));
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Page 2 is requested but unresolved: old rows stay, no skeleton flash.
    expect(await screen.findByText('refreshing...')).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 10/)).toBeInTheDocument();
    expect(hostnames()).toEqual(pageOne);

    release();

    await waitFor(() => expect(screen.queryByText('refreshing...')).not.toBeInTheDocument());
    const pageTwo = hostnames();
    expect(pageTwo).toHaveLength(PAGE_SIZE);
    expect(pageTwo).not.toEqual(pageOne);
    expect(pageTwo.some((name) => pageOne.includes(name))).toBe(false);
  });

  it('changing the filter resets to page 1', async () => {
    const user = userEvent.setup();
    renderTable();
    await waitForRows();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByText(/Page 2 of/)).toBeInTheDocument());

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'offline');
    await waitFor(() => expect(screen.getByText(/Page 1 of/)).toBeInTheDocument());
  });
});
