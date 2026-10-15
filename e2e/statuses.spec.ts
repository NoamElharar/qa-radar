import { expect, test, type Page } from '@playwright/test';
import { TITLES } from './fixtures.ts';
import { auditLayout } from './helpers.ts';

const card = (page: Page, title: string) => page.getByRole('article', { name: title, exact: true });
const statusFilter = (page: Page) => page.getByRole('group', { name: 'סינון לפי סטטוס' });
const formatFilter = (page: Page) => page.getByRole('group', { name: 'סינון לפי פורמט ראיון' });
const row = (page: Page, title: string) => page.locator('li').filter({ hasText: title });

/** Saved statuses written before the app loads (only when the browser has none yet, so reloads keep edits). */
async function seedStatuses(page: Page, statuses: Record<string, string>) {
  const now = new Date().toISOString();
  const entries = Object.fromEntries(
    Object.entries(statuses).map(([id, status]) => [id, { status, updatedAt: now, appliedAt: now }]),
  );
  await page.addInitScript((value) => {
    if (!localStorage.getItem('qa-radar:statuses')) localStorage.setItem('qa-radar:statuses', value);
  }, JSON.stringify(entries));
}

for (const { label, title } of [
  { label: 'שיחה ממגייסת', title: TITLES.manualNew },
  { label: 'עבודת בית', title: TITLES.automationNew },
]) {
  test(`"${label}" can be set from the job card and survives a reload`, async ({ page }) => {
    await page.goto('./');
    const job = card(page, title);
    await job.getByRole('button', { name: /^סטטוס/ }).click();
    await job.getByRole('menuitemradio', { name: label }).click();
    // Like "הגשתי", it counts as handled, so the job leaves "חדש".
    await expect(card(page, title)).toHaveCount(0);

    await page.reload();
    await page.goto('./?view=mine');
    await expect(statusFilter(page).getByRole('button', { name: new RegExp(`^${label} 1$`) })).toBeVisible();
    await expect(row(page, title)).toBeVisible();
  });
}

test('filtering "שלי" by each new status shows only those jobs', async ({ page }) => {
  await seedStatuses(page, {
    'fixture:manual': 'recruiter_call',
    'fixture:automation': 'home_assignment',
    'fixture:long': 'applied',
  });
  await page.goto('./?view=mine');

  await statusFilter(page).getByRole('button', { name: /^שיחה ממגייסת/ }).click();
  await expect(page).toHaveURL(/ms=recruiter_call/);
  await expect(row(page, TITLES.manualNew)).toBeVisible();
  await expect(row(page, TITLES.automationNew)).toHaveCount(0);
  await expect(row(page, TITLES.longNew)).toHaveCount(0);

  await statusFilter(page).getByRole('button', { name: /^שיחה ממגייסת/ }).click();
  await statusFilter(page).getByRole('button', { name: /^עבודת בית/ }).click();
  await expect(page).toHaveURL(/ms=home_assignment/);
  await expect(row(page, TITLES.automationNew)).toBeVisible();
  await expect(row(page, TITLES.manualNew)).toHaveCount(0);
  await expect(row(page, TITLES.longNew)).toHaveCount(0);
});

test('an interview set to Zoom is the only one shown by the Zoom filter', async ({ page }) => {
  await seedStatuses(page, { 'fixture:manual': 'interview', 'fixture:automation': 'interview' });
  await page.goto('./?view=mine');

  const zoomRow = row(page, TITLES.manualNew);
  await zoomRow.locator('button[aria-expanded]').click();
  await zoomRow.getByLabel('פורמט ראיון').selectOption('zoom');
  await expect(zoomRow.getByText('ראיון: Zoom')).toBeVisible();

  await formatFilter(page).getByRole('button', { name: /^Zoom/ }).click();
  await expect(page).toHaveURL(/mi=zoom/);
  await expect(row(page, TITLES.manualNew)).toBeVisible();
  await expect(row(page, TITLES.automationNew)).toHaveCount(0);

  await page.reload();
  await expect(formatFilter(page).getByRole('button', { name: /^Zoom 1$/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, TITLES.automationNew)).toHaveCount(0);
});

test('the new labels render right-to-left and fit on a phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile viewport check');
  await seedStatuses(page, { 'fixture:manual': 'recruiter_call', 'fixture:automation': 'home_assignment' });

  // In the status menu of a job card…
  await page.goto('./');
  const job = card(page, TITLES.longNew);
  await job.getByRole('button', { name: /^סטטוס/ }).click();
  for (const label of ['שיחה ממגייסת', 'עבודת בית']) {
    const item = job.getByRole('menuitemradio', { name: label });
    await expect(item).toBeInViewport();
    expect(await item.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
  }

  // …and on "שלי": the filter chips and the group headings.
  await page.goto('./?view=mine');
  for (const label of ['שיחה ממגייסת', 'עבודת בית']) {
    const chip = statusFilter(page).getByRole('button', { name: new RegExp(`^${label}`) });
    await expect(chip).toBeVisible();
    expect(await chip.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl');
    expect(await chip.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true); // not clipped
    await expect(page.getByRole('heading', { name: new RegExp(label) })).toBeVisible();
  }
  const audit = await auditLayout(page);
  expect(audit.overflowX).toBeLessThanOrEqual(0);
  expect(audit.offscreen).toEqual([]);
  expect(audit.tooSmall).toEqual([]);
});
