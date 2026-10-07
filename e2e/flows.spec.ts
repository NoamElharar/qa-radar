import { expect, test, type Page } from '@playwright/test';
import { TITLES } from './fixtures.ts';

/** A job card by its exact title ("QA Automation Engineer" must not match the "Senior …" one). */
const card = (page: Page, title: string) => page.getByRole('article', { name: title, exact: true });

test('the page is Hebrew, right-to-left', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
});

test('"חדש" shows new and returning jobs only', async ({ page }) => {
  await page.goto('./');
  for (const title of [TITLES.manualNew, TITLES.automationNew, TITLES.longNew, TITLES.back]) {
    await expect(card(page, title)).toBeVisible();
  }
  // The silent first-run baseline, a closed job and a job outside the default regions stay out.
  for (const title of [TITLES.baseline, TITLES.closed, TITLES.north]) {
    await expect(card(page, title)).toHaveCount(0);
  }
});

test('"הכל" also lists jobs from earlier scans', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('navigation', { name: 'תצוגות' }).getByRole('button', { name: /הכל/ }).click();
  await expect(page).toHaveURL(/view=all/);
  await expect(card(page, TITLES.baseline)).toBeVisible();
  await expect(card(page, TITLES.closed)).toHaveCount(0);
});

test('search narrows the list and survives a reload (kept in the URL)', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('searchbox').fill('Automation');
  await expect(card(page, TITLES.automationNew)).toBeVisible();
  await expect(card(page, TITLES.manualNew)).toHaveCount(0);
  await expect(page).toHaveURL(/q=Automation/);

  await page.reload();
  await expect(page.getByRole('searchbox')).toHaveValue('Automation');
  await expect(card(page, TITLES.manualNew)).toHaveCount(0);
});

test('a region filter brings in jobs from that region', async ({ page }) => {
  await page.goto('./');
  await expect(card(page, TITLES.north)).toHaveCount(0);
  await page.getByRole('button', { name: 'סינון', exact: true }).click();
  await page.getByRole('button', { name: 'צפון וחיפה' }).click();
  await page.getByRole('button', { name: /^הצג \d+ משרות$/ }).click();
  await expect(card(page, TITLES.north)).toBeVisible();
});

test('marking "הגשתי" moves a job from "חדש" to "שלי" and is remembered', async ({ page }) => {
  await page.goto('./');
  const job = card(page, TITLES.manualNew);
  await job.getByRole('button', { name: /^סטטוס/ }).click();
  await job.getByRole('menuitemradio', { name: 'הגשתי' }).click();
  await expect(card(page, TITLES.manualNew)).toHaveCount(0);

  await page.getByRole('navigation', { name: 'תצוגות' }).getByRole('button', { name: /שלי/ }).click();
  await expect(page.getByText(TITLES.manualNew)).toBeVisible();

  await page.reload();
  await expect(page.getByText(TITLES.manualNew)).toBeVisible();
});

test('the star saves a job to "שלי"', async ({ page }) => {
  await page.goto('./');
  const job = card(page, TITLES.automationNew);
  await job.getByRole('button', { name: 'שמור משרה' }).click();
  await expect(job.getByRole('button', { name: 'הסר משמורים' })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('./?view=mine');
  await expect(page.getByText(TITLES.automationNew)).toBeVisible();
});

test('an application added by hand is listed and remembered', async ({ page }) => {
  const title = 'בודק/ת תוכנה – הוספה ידנית';
  await page.goto('./?view=mine');
  await page.getByRole('button', { name: /הוספת מועמדות ידנית/ }).click();
  const form = page.getByRole('form', { name: 'הוספת מועמדות ידנית' });
  await form.getByPlaceholder('לדוגמה: בודק/ת תוכנה ידני/ת').fill(title);
  await form.getByPlaceholder('שם החברה או חברת ההשמה').fill('אקמה');
  await form.getByRole('button', { name: /שמירה|שמור/ }).click();
  await expect(form.getByText(`✓ נוסף:`)).toBeVisible();

  // The new row in the list (not the confirmation inside the form).
  const row = page.locator('button', { hasText: title });
  await expect(row).toBeVisible();
  await page.reload();
  await expect(row).toBeVisible();
});

test('a failing source is flagged, and link-out sources offer one-tap searches', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: /מקור תקול/ })).toBeVisible();

  await page.goto('./?view=sources');
  await expect(page.getByText('HTTP 403 for https://broken.example.test/jobs')).toBeVisible();
  await expect(page.getByRole('link', { name: 'משרות QA' }).first()).toHaveAttribute(
    'href',
    'https://board.example.test/qa',
  );
});

test('the theme button cycles light → dark → device setting', async ({ page }) => {
  await page.goto('./');
  const button = page.getByRole('button', { name: /ערכת נושא/ });
  await button.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await button.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
