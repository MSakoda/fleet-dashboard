import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http } from 'msw';
import { NextRequest } from 'next/server';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GET as getAlertsRoute } from '@/app/api/alerts/route';
import { POST as acknowledgeRoute } from '@/app/api/alerts/[id]/acknowledge/route';
import type { AlertListResponse } from '@/lib/types';
import { renderWithClient } from '@/test/render-with-client';
import { server } from '@/test/msw/server';
import { AlertFeed } from './AlertFeed';

const FEED_SIZE = 20;
const POLL_INTERVAL_MS = 5_000;

// shouldAdvanceTime keeps the fake clock ticking in real time so
// waitFor/findBy (which poll on timers) still work; vi.advanceTimers* is
// what jumps a whole poll interval at once.
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

// Wraps the real GET handler, counting calls. `onCall` can hold or alter
// the response for a given call number.
function spyOnAlertPolls(onCall?: (call: number, res: Response) => Promise<Response> | Response) {
  const state = { calls: 0 };
  server.use(
    http.get('/api/alerts', async ({ request }) => {
      const call = ++state.calls;
      const res = await getAlertsRoute(new NextRequest(request));
      return onCall ? onCall(call, res) : res;
    }),
  );
  return state;
}

describe('AlertFeed polling', () => {
  it('refetches every interval and shows what the poll finds', async () => {
    const polls = spyOnAlertPolls(async (call, res) => {
      if (call < 2) return res;
      const body = (await res.json()) as AlertListResponse;
      body.alerts.unshift({ ...body.alerts[0], id: 'alert-from-poll', message: 'Brand new alert from a poll' });
      return Response.json(body);
    });

    const view = renderWithClient(<AlertFeed />);
    await screen.findByText(`${FEED_SIZE} unacknowledged`);
    // The first load is not "new": nothing is announced for existing alerts.
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    // Two hooks observe ['alerts'] but share one in-flight fetch.
    expect(polls.calls).toBe(1);
    expect(screen.queryByText('Brand new alert from a poll')).not.toBeInTheDocument();

    // Just short of the interval: nothing yet.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 500);
    expect(polls.calls).toBe(1);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(await screen.findByText('Brand new alert from a poll', { selector: 'p' })).toBeInTheDocument();
    expect(polls.calls).toBe(2);
    // Only the new alert is announced, in a polite live region, not the whole list.
    const announcement = screen.getByRole('status');
    expect(announcement).toHaveAttribute('aria-live', 'polite');
    expect(announcement).toHaveTextContent(/^New alert: (critical|warning|info), Brand new alert from a poll on .+, at /);
    expect(view.queryClient.getQueryData<AlertListResponse>(['alerts'])!.alerts[0].id).toBe('alert-from-poll');

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await waitFor(() => expect(polls.calls).toBe(3));
  });

  it("a poll that is in flight when you click can't overwrite the pending acknowledge", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const pollGate = deferred();
    const postGate = deferred();
    let pollSettled = false;

    // The 2nd poll captures the server state *before* the acknowledge
    // (everything unacknowledged), then is held until after the click.
    const polls = spyOnAlertPolls(async (call, res) => {
      if (call !== 2) return res;
      await pollGate.promise;
      pollSettled = true;
      return res;
    });
    server.use(
      http.post('/api/alerts/:id/acknowledge', async ({ request, params }) => {
        await postGate.promise;
        return acknowledgeRoute(new NextRequest(request), { params: Promise.resolve({ id: String(params.id) }) });
      }),
    );

    const view = renderWithClient(<AlertFeed />);
    await screen.findByText(`${FEED_SIZE} unacknowledged`);
    const firstAlert = screen.getAllByRole('listitem')[0];

    // Poll starts and hangs on the server.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    await waitFor(() => expect(polls.calls).toBe(2));
    expect(view.queryClient.isFetching({ queryKey: ['alerts'] })).toBe(1);

    await user.click(within(firstAlert).getByRole('button', { name: 'acknowledge' }));
    expect(await screen.findByText(`${FEED_SIZE - 1} unacknowledged`)).toBeInTheDocument();

    // The stale poll response finally arrives while the POST is still pending.
    pollGate.release();
    await waitFor(() => expect(pollSettled).toBe(true));
    await vi.advanceTimersByTimeAsync(100);

    expect(screen.getByText(`${FEED_SIZE - 1} unacknowledged`)).toBeInTheDocument();
    expect(view.queryClient.getQueryData<AlertListResponse>(['alerts'])!.alerts[0].acknowledged).toBe(true);
    expect(within(firstAlert).getByRole('button', { name: 'saving...' })).toBeDisabled();

    // Once the mutation settles, the server agrees and the state holds.
    postGate.release();
    await waitFor(() =>
      expect(within(firstAlert).getByRole('button', { name: 'unacknowledge' })).toBeEnabled(),
    );
    expect(screen.getByText(`${FEED_SIZE - 1} unacknowledged`)).toBeInTheDocument();
  });
});
