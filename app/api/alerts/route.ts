import { NextRequest, NextResponse } from 'next/server';
import { delay, randomLatencyMs } from '@/lib/delay';
import { driftAlerts, getAlertStore } from '@/lib/seed';
import type { AlertListResponse } from '@/lib/types';

const FEED_LIMIT = 20;

export async function GET(request: NextRequest) {
  try {
    await delay(randomLatencyMs(), request.signal);
  } catch {
    console.log('[GET /api/alerts] aborted by client, skipping work');
    return new NextResponse(null, { status: 499 });
  }

  const store = getAlertStore();
  driftAlerts(store);

  const body: AlertListResponse = { alerts: store.slice(0, FEED_LIMIT) };
  return NextResponse.json(body);
}
