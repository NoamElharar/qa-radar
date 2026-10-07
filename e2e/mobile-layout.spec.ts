import { expect, test } from '@playwright/test';
import { TITLES } from './fixtures.ts';
import { auditLayout } from './helpers.ts';

const VIEWS = [
  { name: 'חדש', path: './', ready: TITLES.manualNew },
  { name: 'הכל', path: './?view=all', ready: TITLES.baseline },
  { name: 'שלי', path: './?view=mine', ready: 'המועמדויות שלי' },
  { name: 'מקורות', path: './?view=sources', ready: 'מקור תקול' },
];

for (const view of VIEWS) {
  test(`"${view.name}" fits the screen — no sideways scroll, tappable controls, no iOS zoom`, async ({
    page,
    isMobile,
  }) => {
    await page.goto(view.path);
    await expect(page.getByText(view.ready).first()).toBeVisible();

    const audit = await auditLayout(page);
    expect(audit.overflowX, 'the page scrolls sideways').toBeLessThanOrEqual(0);
    expect(audit.offscreen, 'elements stick out of the screen').toEqual([]);
    expect(audit.tooSmall, 'tap targets under 24×24 px').toEqual([]);
    if (isMobile) expect(audit.smallFields, 'fields under 16px make iOS zoom in').toEqual([]);
  });
}

test('the main controls meet Apple’s 44pt tap size', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone guideline');
  await page.goto('./');
  const card = page.getByRole('article', { name: TITLES.manualNew, exact: true });
  await expect(card).toBeVisible();

  const controls = [
    page.getByRole('button', { name: /רענון/ }),
    page.getByRole('button', { name: /ערכת נושא/ }),
    page.getByRole('button', { name: 'סינון', exact: true }),
    card.getByRole('link', { name: /הגש מועמדות/ }),
    card.getByRole('button', { name: 'שמור משרה' }),
    card.getByRole('button', { name: 'פרטים' }),
    card.getByRole('button', { name: /^סטטוס/ }),
    ...(await page.getByRole('navigation', { name: 'תצוגות' }).getByRole('button').all()),
  ];
  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box, `${control} is not rendered`).not.toBeNull();
    expect(box!.height, `${control} is shorter than 44px`).toBeGreaterThanOrEqual(44);
  }
});

test('the bottom bar never covers the last job card', async ({ page }) => {
  await page.goto('./?view=all');
  await expect(page.getByText(TITLES.baseline)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const cards = page.getByRole('article');
  const last = await cards.nth((await cards.count()) - 1).boundingBox();
  const nav = await page.getByRole('navigation', { name: 'תצוגות' }).boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(nav!.y);
});

test('a long job title wraps instead of widening the card', async ({ page }) => {
  await page.goto('./');
  const card = page.getByRole('article', { name: TITLES.longNew, exact: true });
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
});

test('the filter sheet fits the phone and its main button stays reachable', async ({ page, isMobile }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'סינון', exact: true }).click();
  const show = page.getByRole('button', { name: /^הצג \d+ משרות$/ });
  await expect(show).toBeInViewport();

  const audit = await auditLayout(page);
  expect(audit.overflowX).toBeLessThanOrEqual(0);
  expect(audit.tooSmall).toEqual([]);
  if (isMobile) expect(audit.smallFields).toEqual([]);

  await page.getByRole('button', { name: 'סגור' }).click();
  await expect(show).toBeHidden();
});

test('the add-application form does not make iOS zoom in', async ({ page, isMobile }) => {
  await page.goto('./?view=mine');
  await page.getByRole('button', { name: /הוספת מועמדות ידנית/ }).click();
  const form = page.getByRole('form', { name: 'הוספת מועמדות ידנית' });
  await expect(form).toBeVisible();

  const audit = await auditLayout(page);
  expect(audit.overflowX).toBeLessThanOrEqual(0);
  expect(audit.tooSmall).toEqual([]);
  if (isMobile) expect(audit.smallFields).toEqual([]);
});

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('follows the phone’s dark setting', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByText(TITLES.manualNew)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const background = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(background).toBe('rgb(11, 18, 32)');
  });
});
