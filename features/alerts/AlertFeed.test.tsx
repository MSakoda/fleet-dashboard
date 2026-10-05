import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { NextRequest } from 'next/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GET as getAlerts } from '@/app/api/alerts/route';
import { POST as acknowledgeRoute } from '@/app/api/alerts/[id]/acknowledge/route';
import type { AlertListResponse } from '@/lib/types';
import { renderWithClient } from '@/test/render-with-client';
import { server } from '@/test/msw/server';
import { AlertFeed } from './AlertFeed';

const FEED_SIZE = 20;

// Holds the acknowledge response open so the optimistic window - after the
// click, before the server answers - is something a test can stand in.
function gateAcknowledge(respond: (request: Request, id: string) => Promise<Response>) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = { responded: false };

  server.use(
    http.post('/api/alerts/:id/acknowledge', async ({ request, params }) => {
      await gate;
      state.responded = true;
      return respond(request, String(params.id));
    }),
  );

  return { release, state };
}

async function renderFeed() {
  const view = renderWithClient(<AlertFeed />);
  await screen.findByText(`${FEED_SIZE} unacknowledged`);
  const firstAlert = screen.getAllByRole('listitem')[0];
  return { ...view, firstAlert };
}

const cachedAlerts = (view: Awaited<ReturnType<typeof renderFeed>>) =>
  view.queryClient.getQueryData<AlertListResponse>(['alerts'])!.alerts;

describe('AlertFeed optimistic acknowledge', () => {
  it('updates the alert immediately, before the server responds', async () => {
    const user = userEvent.setup();
    const view = await renderFeed();
    const { release, state } = gateAcknowledge((request, id) =>
      acknowledgeRoute(new NextRequest(request), { params: Promise.resolve({ id }) }),
    );

    await user.click(within(view.firstAlert).getByRole('button', { name: 'acknowledge' }));

    // The request is still held open, yet the UI and cache already changed.
    expect(await screen.findByText(`${FEED_SIZE - 1} unacknowledged`)).toBeInTheDocument();
    expect(state.responded).toBe(false);
    expect(cachedAlerts(view)[0].acknowledged).toBe(true);
    expect(within(view.firstAlert).getByRole('button', { name: 'saving...' })).toBeDisabled();

    release();

    // Once confirmed, the refetched server state agrees with the optimistic one.
    await waitFor(() =>
      expect(within(view.firstAlert).getByRole('button', { name: 'unacknowledge' })).toBeEnabled(),
    );
    expect(screen.getByText(`${FEED_SIZE - 1} unacknowledged`)).toBeInTheDocument();
    expect(cachedAlerts(view)[0].acknowledged).toBe(true);
  });

  it('rolls the cache back and shows an error when the server returns 500', async () => {
    const user = userEvent.setup();
    const view = await renderFeed();
    const before = structuredClone(cachedAlerts(view));
    const { release } = gateAcknowledge(async () =>
      HttpResponse.json({ error: 'Failed to acknowledge alert' }, { status: 500 }),
    );

    await user.click(within(view.firstAlert).getByRole('button', { name: 'acknowledge' }));

    // Optimistic state is visible while the doomed request is in flight.
    expect(await screen.findByText(`${FEED_SIZE - 1} unacknowledged`)).toBeInTheDocument();
    expect(cachedAlerts(view)[0].acknowledged).toBe(true);

    // onSettled refetches after the failure, and the server's real (unacknowledged)
    // answer would hide a broken rollback. Hold that refetch open so the only
    // thing that can restore the cache is the rollback itself.
    let releaseRefetch!: () => void;
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    server.use(
      http.get('/api/alerts', async ({ request }) => {
        await refetchGate;
        return getAlerts(new NextRequest(request));
      }),
    );

    release();

    expect(await screen.findByText('Failed to save, change rolled back.')).toBeInTheDocument();
    expect(await screen.findByText(`${FEED_SIZE} unacknowledged`)).toBeInTheDocument();
    expect(view.queryClient.isFetching({ queryKey: ['alerts'] })).toBe(1);
    expect(cachedAlerts(view)).toEqual(before);
    expect(within(view.firstAlert).getByRole('button', { name: 'acknowledge' })).toBeEnabled();

    releaseRefetch();
    await waitFor(() => expect(view.queryClient.isFetching({ queryKey: ['alerts'] })).toBe(0));
    expect(cachedAlerts(view)).toEqual(before);
  });
});
