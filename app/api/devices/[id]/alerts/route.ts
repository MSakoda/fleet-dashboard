import { NextRequest, NextResponse } from 'next/server';
import { delay, randomLatencyMs } from '@/lib/delay';
import { findDevice, getDeviceAlerts } from '@/lib/seed';
import type { AlertListResponse } from '@/lib/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    await delay(randomLatencyMs(), request.signal);
  } catch {
    console.log(`[GET /api/devices/${id}/alerts] aborted by client, skipping work`);
    return new NextResponse(null, { status: 499 });
  }

  if (!findDevice(id)) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  const body: AlertListResponse = { alerts: getDeviceAlerts(id) };
  return NextResponse.json(body);
}
