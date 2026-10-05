'use client';

import { useState } from 'react';
import { DeviceTable } from '@/features/devices/DeviceTable';
import { DeviceDetailPanel } from '@/features/devices/DeviceDetailPanel';
import { AlertFeed } from '@/features/alerts/AlertFeed';

export default function Home() {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-zinc-50 p-8 dark:bg-black lg:flex-row">
      <main className="flex flex-1 flex-col gap-6">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Endpoint Fleet Dashboard</h1>
        <DeviceTable selectedDeviceId={selectedDeviceId} onSelectDevice={setSelectedDeviceId} />
      </main>
      <aside className="w-full shrink-0 lg:w-80">
        <AlertFeed />
      </aside>
      <DeviceDetailPanel deviceId={selectedDeviceId} onClose={() => setSelectedDeviceId(null)} />
    </div>
  );
}
