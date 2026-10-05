import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { getDeviceStore } from '@/lib/seed';
import { renderWithClient } from '@/test/render-with-client';
import { server } from '@/test/msw/server';

const ALERT_HISTORY = /^\/api\/devices\/[^/]+\/alerts$/;
const DEVICE_DETAIL = /^\/api\/devices\/[^/]+$/;

// Observes real requests as they leave the app, without replacing any
// handler, so the count reflects what the page actually asked the network for.
function recordRequests() {
  const paths: string[] = [];
  server.events.on('request:start', ({ request }) => {
    paths.push(new URL(request.url).pathname);
  });
  return {
    matching: (pattern: RegExp) => paths.filter((path) => pattern.test(path)),
  };
}

afterEach(() => {
  server.events.removeAllListeners();
});

const idOfRow = (row: HTMLElement) => {
  const hostname = within(row).getAllByRole('cell')[0].textContent;
  return getDeviceStore().find((device) => device.hostname === hostname)!.id;
};

async function renderLoadedPage() {
  renderWithClient(<Home />);
  const firstRow = await waitFor(() => {
    const row = screen.getAllByRole('row')[1];
    expect(within(row).getAllByRole('cell')[0].textContent).toMatch(/-\d{4}$/);
    return row;
  });
  return { rows: () => screen.getAllByRole('row').slice(1), firstRow };
}

describe('device alert history (selection-gated query)', () => {
  it('is not requested until a device is selected', async () => {
    const requests = recordRequests();
    const user = userEvent.setup();
    const { rows, firstRow } = await renderLoadedPage();

    // The table is up and the page has settled, yet nothing asked for history.
    expect(screen.queryByRole('heading', { name: 'Alert History' })).not.toBeInTheDocument();
    expect(requests.matching(ALERT_HISTORY)).toHaveLength(0);

    // Hovering a row warms the device's detail query, never its alert history.
    await user.hover(firstRow);
    await waitFor(() => expect(requests.matching(DEVICE_DETAIL)).toHaveLength(1));
    expect(requests.matching(ALERT_HISTORY)).toHaveLength(0);

    await user.click(rows()[0]);

    expect(await screen.findByRole('heading', { name: 'Alert History' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('loading alert history...')).not.toBeInTheDocument(),
    );
    expect(requests.matching(ALERT_HISTORY)).toEqual([`/api/devices/${idOfRow(rows()[0])}/alerts`]);
  });

  it('requests history only for the selected device, one device at a time', async () => {
    const requests = recordRequests();
    const user = userEvent.setup();
    const { rows } = await renderLoadedPage();
    const [firstId, secondId] = [idOfRow(rows()[0]), idOfRow(rows()[1])];

    await user.click(rows()[0]);
    await screen.findByRole('heading', { name: 'Alert History' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('heading', { name: 'Alert History' })).not.toBeInTheDocument();

    await user.click(rows()[1]);
    await screen.findByRole('heading', { name: 'Alert History' });
    await waitFor(() => expect(requests.matching(ALERT_HISTORY)).toHaveLength(2));

    expect(requests.matching(ALERT_HISTORY)).toEqual([
      `/api/devices/${firstId}/alerts`,
      `/api/devices/${secondId}/alerts`,
    ]);
  });
});
