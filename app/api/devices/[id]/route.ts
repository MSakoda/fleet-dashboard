import { NextRequest, NextResponse } from 'next/server';
import { delay, randomLatencyMs } from '@/lib/delay';
import { findDevice, getDeviceStore, resolveReboots } from '@/lib/seed';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    await delay(randomLatencyMs(), request.signal);
  } catch {
    console.log(`[GET /api/devices/${id}] aborted by client, skipping work`);
    return new NextResponse(null, { status: 499 });
  }

  // Resolves reboots on this single-device path too, not just the list -
  // otherwise a device fetched here directly (e.g. an open detail panel)
  // could show 'rebooting' long after it actually finished, until the list
  // happened to get polled again.
  resolveReboots(getDeviceStore());

  const device = findDevice(id);
  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  return NextResponse.json(device);
}
