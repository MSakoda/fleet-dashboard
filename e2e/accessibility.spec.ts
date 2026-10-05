import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Fails with a readable list of what broke and where, instead of a bare
// "expected 3 to be 0".
async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const report = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n` +
      v.nodes.map((n) => `    ${n.target.join(' ')}\n      ${n.failureSummary?.split('\n').join('\n      ')}`).join('\n'),
  );
  expect(violations, `\n${report.join('\n\n')}\n`).toEqual([]);
}

async function loadDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByText(/200 devices total/)).toBeVisible();
  await expect(page.getByRole('listitem').first()).toBeVisible();
}

async function openFirstDevice(page: Page) {
  await page.getByRole('row').nth(1).getByRole('button').click();
  const panel = page.getByRole('dialog', { name: 'Device Detail' });
  await expect(panel).toBeVisible();
  await expect(page.getByText('loading alert history...')).toBeHidden();
  await expect(page.getByText('loading device...')).toBeHidden();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('dashboard has no accessibility violations', async ({ page }) => {
      await loadDashboard(page);
      await expectNoA11yViolations(page);
    });

    test('dashboard with a device panel open has none', async ({ page }) => {
      await loadDashboard(page);
      await openFirstDevice(page);
      await expectNoA11yViolations(page);
    });

    test('a failed acknowledge, with its error shown, has none', async ({ page }) => {
      await loadDashboard(page);
      await page.getByLabel('simulate failures').check();
      await page.getByRole('button', { name: 'acknowledge', exact: true }).first().click();
      await expect(page.getByText('Failed to save, change rolled back.')).toBeVisible({ timeout: 10_000 });
      await expectNoA11yViolations(page);
    });
  });
}

test.describe('mobile viewport', () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

  test('dashboard has no accessibility violations', async ({ page }) => {
    await loadDashboard(page);
    await expectNoA11yViolations(page);
  });

  test('dashboard with a device panel open has none', async ({ page }) => {
    await loadDashboard(page);
    await openFirstDevice(page);
    await expectNoA11yViolations(page);
  });
});
