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

test('statuses saved on reposted copies follow the job: applied stays applied, one row in "שלי"', async ({ page }) => {
  const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
  await page.addInitScript((value) => {
    if (!localStorage.getItem('qa-radar:statuses')) localStorage.setItem('qa-radar:statuses', value);
  }, JSON.stringify({
    'fixture:manual-repost-1': { status: 'applied', appliedAt: day(10), updatedAt: day(10), note: 'שלחתי קו"ח' },
    'fixture:manual-repost-2': { status: 'irrelevant', updatedAt: day(3) },
  }));

  // Already applied, so it is not offered again in "חדש".
  await page.goto('./');
  await expect(card(page, TITLES.automationNew)).toBeVisible();
  await expect(card(page, TITLES.manualNew)).toHaveCount(0);

  await page.goto('./?view=mine');
  await expect(row(page, TITLES.manualNew)).toHaveCount(1);
  await expect(statusFilter(page).getByRole('button', { name: /^הגשתי 1$/ })).toBeVisible();
  await expect(statusFilter(page).getByRole('button', { name: /^לא רלוונטי 0$/ })).toBeVisible();

  // A change is saved under the current id and survives a reload.
  await row(page, TITLES.manualNew).locator('button[aria-expanded]').click();
  await row(page, TITLES.manualNew).getByRole('radio', { name: 'ראיון פרונטלי' }).click();
  await page.reload();
  await expect(statusFilter(page).getByRole('button', { name: /^ראיון פרונטלי 1$/ })).toBeVisible();
  await expect(row(page, TITLES.manualNew)).toHaveCount(1);
});

test('an interview moves video → frontal → waiting for the answer, and each step is remembered', async ({ page }) => {
  await page.goto('./');
  const job = card(page, TITLES.automationNew);
  await job.getByRole('button', { name: /^סטטוס/ }).click();
  await job.getByRole('menuitemradio', { name: 'ראיון שיחת וידאו' }).click();

  await page.goto('./?view=mine');
  await expect(statusFilter(page).getByRole('button', { name: /^ראיון שיחת וידאו 1$/ })).toBeVisible();
  const r = row(page, TITLES.automationNew);
  await r.locator('button[aria-expanded]').click();
  await r.getByRole('radio', { name: 'ראיון פרונטלי' }).click();
  await expect(statusFilter(page).getByRole('button', { name: /^ראיון פרונטלי 1$/ })).toBeVisible();
  await r.getByRole('radio', { name: 'ממתין לתשובה' }).click();

  await page.reload();
  await expect(statusFilter(page).getByRole('button', { name: /^ממתין לתשובה 1$/ })).toBeVisible();
  await expect(statusFilter(page).getByRole('button', { name: /^ראיון שיחת וידאו 0$/ })).toBeVisible();
  await expect(page.getByText('זימונים לראיון').locator('..')).toContainText('1');
});

test('an old "ראיון" entry stays readable and can be sorted into the new kinds', async ({ page }) => {
  await seedStatuses(page, { 'fixture:manual': 'interview' });
  await page.goto('./?view=mine');
  await expect(statusFilter(page).getByRole('button', { name: /^ראיון 1$/ })).toBeVisible();

  const r = row(page, TITLES.manualNew);
  await r.locator('button[aria-expanded]').click();
  await expect(r.getByRole('radio', { name: 'ראיון', exact: true })).toHaveAttribute('aria-checked', 'true');
  await r.getByRole('radio', { name: 'ראיון שיחת וידאו' }).click();

  // Once nothing is left in the old "ראיון", its chip leaves the pipeline.
  await expect(statusFilter(page).getByRole('button', { name: /^ראיון 1$/ })).toHaveCount(0);
  await expect(statusFilter(page).getByRole('button', { name: /^ראיון שיחת וידאו 1$/ })).toBeVisible();
  await expect(r.getByRole('radio', { name: 'ראיון', exact: true })).toHaveCount(0);
});

test('a long note is shown in full, full width, and grows as you type', async ({ page }) => {
  const note = ['התקשרה מישהי מNESS למשרה בבנק', 'ראיון ראשון בזום ביום ראשון', 'שכר שנאמר: 18-20', 'איש קשר: דנה', 'לשלוח תיק עבודות'].join('\n');
  const now = new Date().toISOString();
  await page.addInitScript((value) => {
    if (!localStorage.getItem('qa-radar:statuses')) localStorage.setItem('qa-radar:statuses', value);
  }, JSON.stringify({ 'fixture:manual': { status: 'applied', updatedAt: now, appliedAt: now, note } }));
  await page.goto('./?view=mine');
  const r = row(page, TITLES.manualNew);
  await r.locator('button[aria-expanded]').click();

  const box = r.getByLabel('הערות');
  await expect(box).toHaveValue(note);
  const fits = () => box.evaluate((el) => el.scrollHeight <= el.clientHeight + 1);
  expect(await fits(), 'the whole note is visible without scrolling inside the box').toBe(true);
  const width = await box.evaluate((el) => el.getBoundingClientRect().width / el.closest('li')!.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(0.75);
  expect(await box.getAttribute('dir')).toBe('auto');

  const before = (await box.boundingBox())!.height;
  await box.click();
  await page.keyboard.press('End');
  await box.press('Control+End');
  await page.keyboard.type('\nשורה חדשה\nועוד שורה');
  expect((await box.boundingBox())!.height).toBeGreaterThan(before);
  expect(await fits()).toBe(true);
});
