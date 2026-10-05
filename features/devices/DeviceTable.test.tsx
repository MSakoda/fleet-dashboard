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

function renderTable(onSelectDevice = vi.fn()) {
  return renderWithClient(<DeviceTable selectedDeviceId={null} onSelectDevice={onSelectDevice} />);
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
  it('labels its filters visibly and marks the sorted column with aria-sort', async () => {
    renderTable();
    await waitForRows();

    // Real <label> elements, so the text is on screen, not just in the a11y tree.
    expect(screen.getByLabelText('Search hostname')).toBeVisible();
    expect(screen.getByLabelText('Status')).toBeVisible();

    expect(screen.getByRole('columnheader', { name: 'Hostname' })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: 'CPU %' })).not.toHaveAttribute('aria-sort');
  });

  it('sorts and selects with the keyboard alone', async () => {
    const onSelectDevice = vi.fn();
    const user = userEvent.setup();
    renderTable(onSelectDevice);
    await waitForRows();

    // Tab order: search, status, then the sortable headers left to right.
    // Headers and rows are real buttons, reachable by Tab and activated by Enter.
    await user.tab();
    expect(screen.getByLabelText('Search hostname')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Status')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Hostname/ })).toHaveFocus();
    await user.tab(); // OS
    await user.tab(); // Status
    await user.tab(); // CPU %
    expect(screen.getByRole('button', { name: /CPU %/ })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: 'CPU %' })).toHaveAttribute('aria-sort', 'ascending'),
    );
    expect(screen.getByRole('columnheader', { name: 'Hostname' })).not.toHaveAttribute('aria-sort');

    const firstRowButton = within(dataRows()[0]).getByRole('button');
    firstRowButton.focus();
    await user.keyboard('{Enter}');
    expect(onSelectDevice).toHaveBeenCalledTimes(1);
    expect(onSelectDevice).toHaveBeenCalledWith(
      getDeviceStore().find((d) => d.hostname === firstRowButton.textContent)!.id,
    );
  });

  it('filtering by status replaces the rows with only matching devices', async () => {
    const user = userEvent.setup();
    renderTable();
    await waitForRows();
    expect(screen.getByText(/200 devices total/)).toBeInTheDocument();

    const offlineCount = getDeviceStore().filter((d) => d.status === 'offline').length;
    expect(offlineCount).toBeGreaterThan(0);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'offline');

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

    await user.click(screen.getByRole('button', { name: /Hostname/ }));
    await waitFor(() => expect(hostnames()).toEqual(descending));
    expect(screen.getByRole('columnheader', { name: 'Hostname' })).toHaveAttribute('aria-sort', 'descending');

    await user.click(screen.getByRole('button', { name: /Hostname/ }));
    await waitFor(() => expect(hostnames()).toEqual(ascending));
  });

  it('sorting by a numeric column orders by value, not by text', async () => {
    const user = userEvent.setup();
    renderTable();
    await waitForRows();

    await user.click(screen.getByRole('button', { name: /CPU %/ }));
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: 'CPU %' })).toHaveAttribute('aria-sort', 'ascending'),
    );
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

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'offline');
    await waitFor(() => expect(screen.getByText(/Page 1 of/)).toBeInTheDocument());
  });
});
