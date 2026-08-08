import { NextRequest, NextResponse } from 'next/server';
import { delay, randomLatencyMs } from '@/lib/delay';
import { findDevice, REBOOT_DURATION_MS, startReboot } from '@/lib/seed';
import type { RebootResponse } from '@/lib/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    await delay(randomLatencyMs(), request.signal);
  } catch {
    console.log(`[POST /api/devices/${id}/reboot] aborted by client, skipping work`);
    return new NextResponse(null, { status: 499 });
  }

  const device = findDevice(id);
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  startReboot(device);

  const body: RebootResponse = { device, rebootDurationMs: REBOOT_DURATION_MS };
  return NextResponse.json(body);
}
