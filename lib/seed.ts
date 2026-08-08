import type { Alert, AlertSeverity, Device, DeviceOS } from './types';

const DEVICE_COUNT = 200;
const SEED = 20260807;

// Deterministic PRNG (mulberry32) so the initial fleet is the same set of
// 200 devices every cold start, instead of a new random fleet each time.
function mulberry32(seed: number): () => number {
  let state = seed;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(rng: () => number, options: readonly T[]): T {
  return options[Math.floor(rng() * options.length)];
}

const OS_OPTIONS: readonly DeviceOS[] = ['Windows', 'macOS', 'Linux'];
const HOSTNAME_PREFIXES = ['WKS', 'SRV', 'LAP', 'POS', 'KIOSK'] as const;

function generateDevices(): Device[] {
  const rng = mulberry32(SEED);
  const devices: Device[] = [];

  for (let i = 0; i < DEVICE_COUNT; i++) {
    const prefix = pick(rng, HOSTNAME_PREFIXES);
    devices.push({
      id: `dev-${i + 1}`,
      hostname: `${prefix}-${String(i + 1).padStart(4, '0')}`,
      os: pick(rng, OS_OPTIONS),
      status: rng() < 0.08 ? 'offline' : 'online',
      cpuPercent: randomInt(rng, 5, 90),
      memoryPercent: randomInt(rng, 10, 95),
      diskPercent: randomInt(rng, 20, 98),
      lastCheckIn: new Date(Date.now() - randomInt(rng, 0, 1000 * 60 * 60 * 6)).toISOString(),
    });
  }

  return devices;
}

// Next.js dev mode re-evaluates this module on most edit-triggered HMR
// passes, which would otherwise wipe the fleet back to its initial state
// mid-session. Stashing it on globalThis survives that (the same trick used
// for the Prisma client singleton in Next.js docs).
const globalStore = globalThis as unknown as { __fleetDevices?: Device[] };

export function getDeviceStore(): Device[] {
  if (!globalStore.__fleetDevices) {
    globalStore.__fleetDevices = generateDevices();
  }
  return globalStore.__fleetDevices;
}

export function findDevice(id: string): Device | undefined {
  return getDeviceStore().find((device) => device.id === id);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function jitter(current: number, spread: number): number {
  return clamp(Math.round(current + (Math.random() * 2 - 1) * spread), 1, 99);
}

const STATUS_FLIP_CHANCE = 0.02;

export const REBOOT_DURATION_MS = 6_000;

// Tracked separately from Device itself - the client never needs to know
// *when* a reboot started, only its current status, so this stays out of
// the public API response shape.
const globalRebootStore = globalThis as unknown as { __fleetReboots?: Map<string, number> };

function getRebootStore(): Map<string, number> {
  if (!globalRebootStore.__fleetReboots) {
    globalRebootStore.__fleetReboots = new Map();
  }
  return globalRebootStore.__fleetReboots;
}

export function startReboot(device: Device): void {
  device.status = 'rebooting';
  getRebootStore().set(device.id, Date.now());
}

// Flips a device back to 'online' once its reboot has run for long enough.
// This runs lazily on read, same as driftDevices, rather than scheduling a
// setTimeout in the route handler - a bare setTimeout would work fine in a
// warm dev server but isn't guaranteed to fire at all on Vercel, where the
// serverless function can be frozen or torn down right after it responds.
export function resolveReboots(devices: Device[]): void {
  const reboots = getRebootStore();
  if (reboots.size === 0) return;

  const now = Date.now();
  for (const device of devices) {
    const startedAt = reboots.get(device.id);
    if (startedAt !== undefined && now - startedAt >= REBOOT_DURATION_MS) {
      device.status = 'online';
      reboots.delete(device.id);
    }
  }
}

// Called on every list read so polling/refetching is visibly live: metrics
// jitter a few points and a small fraction of devices flip online/offline.
// Never touches 'rebooting' directly - that state is only ever set by
// startReboot and only ever cleared by resolveReboots.
export function driftDevices(devices: Device[]): void {
  resolveReboots(devices);

  const now = new Date().toISOString();

  for (const device of devices) {
    device.cpuPercent = jitter(device.cpuPercent, 6);
    device.memoryPercent = jitter(device.memoryPercent, 4);
    device.diskPercent = jitter(device.diskPercent, 1);
    device.lastCheckIn = now;

    if (device.status !== 'rebooting' && Math.random() < STATUS_FLIP_CHANCE) {
      device.status = device.status === 'online' ? 'offline' : 'online';
    }
  }
}

const ALERT_SEED = 20260808;
const INITIAL_ALERT_COUNT = 40;
const MAX_ALERTS = 200;
const NEW_ALERT_CHANCE = 0.25;

const ALERT_TEMPLATES: Record<AlertSeverity, readonly string[]> = {
  critical: ['Device unreachable for over 10 minutes', 'Disk usage above 95%', 'Agent crashed and failed to restart'],
  warning: ['CPU sustained above 90% for 10 minutes', 'Memory usage above 85%', 'Disk usage above 80%'],
  info: ['Agent updated to latest version', 'Scheduled scan completed', 'Device checked in after being offline'],
};

// Weighted so most polling reads surface routine info noise, not a wall of
// criticals - closer to what a real fleet feed looks like.
const SEVERITY_WEIGHTS: readonly [AlertSeverity, number][] = [
  ['critical', 0.15],
  ['warning', 0.35],
  ['info', 0.5],
];

function pickSeverity(rng: () => number): AlertSeverity {
  const roll = rng();
  let cumulative = 0;
  for (const [severity, weight] of SEVERITY_WEIGHTS) {
    cumulative += weight;
    if (roll < cumulative) return severity;
  }
  return 'info';
}

function buildAlert(rng: () => number, device: Device, createdAt: string): Alert {
  const severity = pickSeverity(rng);
  return {
    id: `alert-${Math.floor(rng() * 1e9)}-${device.id}`,
    deviceId: device.id,
    hostname: device.hostname,
    severity,
    message: pick(rng, ALERT_TEMPLATES[severity]),
    acknowledged: false,
    createdAt,
  };
}

function generateAlerts(devices: Device[]): Alert[] {
  const rng = mulberry32(ALERT_SEED);
  const alerts: Alert[] = [];

  for (let i = 0; i < INITIAL_ALERT_COUNT; i++) {
    const device = pick(rng, devices);
    const minutesAgo = randomInt(rng, 0, 180);
    const createdAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    alerts.push(buildAlert(rng, device, createdAt));
  }

  return alerts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

const globalAlertStore = globalThis as unknown as { __fleetAlerts?: Alert[] };

export function getAlertStore(): Alert[] {
  if (!globalAlertStore.__fleetAlerts) {
    globalAlertStore.__fleetAlerts = generateAlerts(getDeviceStore());
  }
  return globalAlertStore.__fleetAlerts;
}

// Called on every /api/alerts read, not on a timer - nothing runs
// server-side between requests, so this is what gives the polling widget
// something new to find most times it checks in.
export function driftAlerts(alerts: Alert[]): void {
  if (Math.random() >= NEW_ALERT_CHANCE) return;

  const device = pick(Math.random, getDeviceStore());
  alerts.unshift(buildAlert(Math.random, device, new Date().toISOString()));

  if (alerts.length > MAX_ALERTS) {
    alerts.length = MAX_ALERTS;
  }
}

// A pure read over the existing store, unlike /api/alerts which also
// drives drift. Opening several device panels shouldn't multiply the
// chance of new alerts appearing - only the global feed does that.
export function getDeviceAlerts(deviceId: string): Alert[] {
  return getAlertStore()
    .filter((alert) => alert.deviceId === deviceId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
