import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './msw/server';

// No artificial latency (the acknowledge endpoint alone waits 2.5-4s).
vi.mock('@/lib/delay', () => ({
  delay: () => Promise.resolve(),
  randomLatencyMs: () => 0,
}));

// Keep the real stores and reboot logic, but turn off random metric jitter,
// status flips and new alerts so assertions are deterministic.
vi.mock('@/lib/seed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/seed')>();
  return {
    ...actual,
    driftDevices: (devices: Parameters<typeof actual.driftDevices>[0]) => actual.resolveReboots(devices),
    driftAlerts: () => {},
  };
});

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

beforeEach(() => {
  // Fresh seeded fleet per test so mutations (reboot, acknowledge) don't leak.
  const g = globalThis as Record<string, unknown>;
  delete g.__fleetDevices;
  delete g.__fleetAlerts;
  delete g.__fleetReboots;
});

afterEach(() => {
  server.resetHandlers();
  cleanup();
});

afterAll(() => server.close());
