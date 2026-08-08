import { NextRequest, NextResponse } from 'next/server';
import { delay, randomLatencyMs } from '@/lib/delay';
import { getAlertStore } from '@/lib/seed';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Deliberately much slower than the other fake endpoints (150-400ms). The
// alert feed polls every 5s; a mutation this slow makes it very likely a
// poll lands while it's still pending, which is exactly the race the
// naive optimistic acknowledge is built to expose.
const ACKNOWLEDGE_LATENCY_MIN_MS = 2_500;
const ACKNOWLEDGE_LATENCY_MAX_MS = 4_000;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const forceFail = request.nextUrl.searchParams.get('fail') === '1';

  try {
    await delay(randomLatencyMs(ACKNOWLEDGE_LATENCY_MIN_MS, ACKNOWLEDGE_LATENCY_MAX_MS), request.signal);
  } catch {
    console.log(`[POST /api/alerts/${id}/acknowledge] aborted by client, skipping work`);
    return new NextResponse(null, { status: 499 });
  }

  const alert = getAlertStore().find((a) => a.id === id);
  if (!alert) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
  }

  if (forceFail) {
    return NextResponse.json({ error: 'Failed to acknowledge alert' }, { status: 500 });
  }

  alert.acknowledged = !alert.acknowledged;
  return NextResponse.json(alert);
}
