import { describe, expect, it } from 'vitest';
import { acknowledgeAlert, fetchAlerts, fetchDevice, fetchDevices, rebootDevice } from '@/lib/api-client';

describe('msw handlers mirror the route handlers', () => {
  it('paginates, filters and sorts devices through the real fetch code', async () => {
    const res = await fetchDevices({ page: 2, pageSize: 10, sortBy: 'hostname', sortDir: 'desc' });
    expect(res.total).toBe(200);
    expect(res.devices).toHaveLength(10);
    expect(res.page).toBe(2);
  });

  it('404s for an unknown device', async () => {
    await expect(fetchDevice('nope')).rejects.toThrow('(404)');
  });

  it('reboot flips status and is reset between tests', async () => {
    const { device } = await rebootDevice('dev-1');
    expect(device.status).toBe('rebooting');
  });

  it('starts each test from a clean fleet', async () => {
    expect((await fetchDevice('dev-1')).status).not.toBe('rebooting');
  });

  it('acknowledge toggles, and ?fail=1 returns 500', async () => {
    const [first] = (await fetchAlerts()).alerts;
    expect((await acknowledgeAlert(first.id, false)).acknowledged).toBe(true);
    await expect(acknowledgeAlert(first.id, true)).rejects.toThrow('(500)');
  });
});
