import { http } from 'msw';
import { NextRequest } from 'next/server';
import { GET as getAlerts } from '@/app/api/alerts/route';
import { POST as acknowledgeAlert } from '@/app/api/alerts/[id]/acknowledge/route';
import { GET as getDevices } from '@/app/api/devices/route';
import { GET as getDevice } from '@/app/api/devices/[id]/route';
import { GET as getDeviceAlerts } from '@/app/api/devices/[id]/alerts/route';
import { POST as rebootDevice } from '@/app/api/devices/[id]/reboot/route';

// These delegate to the real Route Handlers instead of re-implementing them,
// so filtering, sorting, pagination, 404s and ?fail=1 can't drift from the
// app. Latency and random drift are neutralised in test/setup.ts.
function withId(handler: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>) {
  return ({ request, params }: { request: Request; params: Record<string, string | readonly string[] | undefined> }) =>
    handler(new NextRequest(request), { params: Promise.resolve({ id: String(params.id) }) });
}

export const handlers = [
  http.get('/api/devices', ({ request }) => getDevices(new NextRequest(request))),
  http.get('/api/devices/:id', withId(getDevice)),
  http.get('/api/devices/:id/alerts', withId(getDeviceAlerts)),
  http.post('/api/devices/:id/reboot', withId(rebootDevice)),
  http.get('/api/alerts', ({ request }) => getAlerts(new NextRequest(request))),
  http.post('/api/alerts/:id/acknowledge', withId(acknowledgeAlert)),
];
