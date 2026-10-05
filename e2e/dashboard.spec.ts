import { expect, test, type Page } from '@playwright/test';

// First cell of each data row. Skeleton rows have no hostname-shaped text.
const hostnames = (page: Page) =>
  page
    .getByRole('row')
    .evaluateAll((rows) =>
      rows
        .slice(1)
        .map((row) => row.querySelector('td')?.textContent ?? '')
        .filter((text) => /-\d{4}$/.test(text)),
    );

const statuses = (page: Page) =>
  page
    .getByRole('row')
    .evaluateAll((rows) => rows.slice(1).map((row) => row.querySelectorAll('td')[2]?.textContent ?? ''));

const unacknowledgedCount = async (page: Page) => {
  const text = await page.getByText(/\d+ unacknowledged/).textContent();
  return Number(text?.match(/(\d+) unacknowledged/)?.[1]);
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/200 devices total/)).toBeVisible();
});

test('filter and page the device table', async ({ page }) => {
  await expect(page.getByText(/^Page 1 of 10/)).toBeVisible();
  const pageOne = await hostnames(page);
  expect(pageOne).toHaveLength(20);

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText(/^Page 2 of 10/)).toBeVisible();
  await expect.poll(() => hostnames(page)).not.toEqual(pageOne);
  await expect(page.getByText('refreshing...')).toBeHidden();
  const pageTwo = await hostnames(page);
  expect(pageTwo).toHaveLength(20);
  expect(pageTwo.filter((name) => pageOne.includes(name))).toEqual([]);

  // Filtering from page 2 starts over at page 1 and shows only matching rows.
  await page.getByLabel('Status').selectOption('offline');
  await expect(page.getByText(/^Page 1 of/)).toBeVisible();
  await expect.poll(async () => {
    const found = await statuses(page);
    return found.length > 0 && found.every((status) => status === 'offline');
  }).toBe(true);
  // Back on the first page of the filtered set. How many pages that is
  // drifts with the fake backend's random status flips, so don't pin it.
  await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();
});

test('open a device and see its alert history load', async ({ page, request }) => {
  // Pick a device that really has history instead of hoping a random one does.
  const { alerts } = await (await request.get('/api/alerts')).json();
  const { hostname, message } = alerts[0];

  await page.getByLabel('Search hostname').fill(hostname);
  await expect(page.getByText(/^Page 1 of 1 \(1 devices total\)/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Alert History' })).toBeHidden();

  await page.getByRole('button', { name: hostname }).click();

  await expect(page.getByRole('heading', { name: 'Device Detail' })).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: hostname })).toBeVisible();

  const history = page.getByRole('heading', { name: 'Alert History' }).locator('xpath=following-sibling::ul');
  await expect(page.getByText('loading alert history...')).toBeHidden();
  await expect(history).toContainText(message);
  await expect(page.getByText(/Failed to load alert history/)).toBeHidden();

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Device Detail' })).toBeHidden();
});

test('a failed acknowledge is shown optimistically, then rolled back with an error', async ({ page }) => {
  await expect(page.getByText(/\d+ unacknowledged/)).toBeVisible();
  const before = await unacknowledgedCount(page);
  expect(before).toBeGreaterThan(0);

  await page.getByLabel('simulate failures').check();
  await page.getByRole('button', { name: 'acknowledge', exact: true }).first().click();

  // The endpoint takes 2.5-4s, so this is the optimistic state, not the answer.
  await expect(page.getByRole('button', { name: 'saving...' })).toBeDisabled();
  await expect(page.getByText(`${before - 1} unacknowledged`)).toBeVisible();

  // Then the 500 lands and the change is undone.
  await expect(page.getByText('Failed to save, change rolled back.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(`${before} unacknowledged`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'saving...' })).toBeHidden();
});
