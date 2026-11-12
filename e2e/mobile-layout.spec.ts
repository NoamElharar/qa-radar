import { expect, test } from '@playwright/test';
import { TITLES } from './fixtures.ts';
import { auditLayout, bottomLimit, lowContrastText } from './helpers.ts';

const VIEWS = [
  { name: 'חדש', path: './', ready: TITLES.manualNew },
  { name: 'הכל', path: './?view=all', ready: TITLES.baseline },
  { name: 'שלי', path: './?view=mine', ready: 'המועמדויות שלי' },
  { name: 'סטטיסטיקה', path: './?view=stats', ready: 'עוד אין הגשות לנתח' },
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

for (const colorScheme of ['light', 'dark'] as const) {
  test(`every view's text is readable in ${colorScheme} mode — at least 4.5:1`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    for (const view of VIEWS) {
      await page.goto(view.path);
      await expect(page.getByText(view.ready).first()).toBeVisible();
      expect(await lowContrastText(page), `low-contrast text on "${view.name}"`).toEqual([]);
    }
  });
}

test('a job card keeps its actions on one line on a small iPhone (375 px)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('./');
  for (const card of await page.getByRole('article').all()) {
    const apply = card.getByRole('link', { name: /הגש מועמדות/ });
    const lines = await apply.evaluate((a) => {
      const range = document.createRange();
      range.selectNodeContents(a);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    expect(lines, 'the "הגש מועמדות" label wraps').toBe(1);
    const star = (await card.getByRole('button', { name: /שמור משרה|הסר משמורים/ }).boundingBox())!;
    expect(star.width, 'the star button was squeezed').toBeGreaterThanOrEqual(44);
  }
});

test('the status menu works from the keyboard', async ({ page }) => {
  await page.goto('./');
  const card = page.getByRole('article', { name: TITLES.manualNew, exact: true });
  const toggle = card.getByRole('button', { name: /^סטטוס/ });
  await toggle.focus();
  await page.keyboard.press('Enter');
  // Focus moves into the menu, onto the current status ("חדש" has none, so the first choice).
  const items = card.getByRole('menuitemradio');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(card.getByRole('menu')).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('an open application in "שלי" has no tap target under 24 px', async ({ page }) => {
  const now = new Date().toISOString();
  const seeded = {
    'fixture:manual': {
      status: 'recruiter_call',
      appliedAt: now,
      updatedAt: now,
      history: [
        { status: 'applied', at: now },
        { status: 'recruiter_call', at: now },
      ],
      snapshot: { title: TITLES.manualNew, url: 'https://jobs.example.test/manual' },
    },
  };
  await page.addInitScript((v) => localStorage.setItem('qa-radar:statuses', v), JSON.stringify(seeded));
  await page.goto('./?view=mine');
  await page.getByRole('button', { name: TITLES.manualNew }).click();
  await expect(page.getByRole('button', { name: 'הסר מהרשימה' })).toBeVisible();

  const audit = await auditLayout(page);
  expect(audit.tooSmall).toEqual([]);
  expect(audit.overflowX).toBeLessThanOrEqual(0);
});

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
  await expect(page.getByRole('navigation', { name: 'תצוגות' })).toBeVisible();
  expect(last!.y + last!.height).toBeLessThanOrEqual(await bottomLimit(page));
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

test('the status menu of the top card is fully visible — never under the header or the bottom bar', async ({ page }) => {
  for (const path of ['./', './?view=all']) {
    await page.goto(path);
    const first = page.getByRole('article').first();
    await first.getByRole('button', { name: /^סטטוס/ }).click();
    const menu = first.getByRole('menu');
    await expect(menu).toBeVisible();

    const box = (await menu.boundingBox())!;
    const header = (await page.locator('header').boundingBox())!;
    expect(box.y, 'menu starts under the sticky header').toBeGreaterThanOrEqual(header.y + header.height);
    expect(box.y + box.height, 'menu ends under the bottom bar').toBeLessThanOrEqual(await bottomLimit(page));

    // Every choice is on screen at once — nothing hidden inside a scrolled menu.
    for (const item of await menu.getByRole('menuitemradio').all()) {
      await expect(item).toBeInViewport({ ratio: 1 });
    }
    await page.keyboard.press('Escape');
  }

  // A card just above the bottom bar opens its menu upward, still clear of both bars.
  await page.goto('./?view=all');
  const card = page.getByRole('article').nth(1);
  const toggle = card.getByRole('button', { name: /^סטטוס/ });
  const limit = await bottomLimit(page);
  await toggle.evaluate((el, bottom) => window.scrollBy(0, el.getBoundingClientRect().bottom - (bottom - 8)), limit);
  await toggle.click();
  const box = (await card.getByRole('menu').boundingBox())!;
  const header = (await page.locator('header').boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(box.y + box.height).toBeLessThanOrEqual(await bottomLimit(page));
});

test('every filter chip on "שלי" is fully on screen — none cut off at the edge', async ({ page }) => {
  // Saved statuses across the whole pipeline, so every status chip is shown.
  const now = new Date().toISOString();
  const statuses = ['applied', 'recruiter_call', 'home_assignment', 'interview', 'interview_video', 'interview_frontal', 'awaiting_answer', 'offer', 'rejected', 'irrelevant', 'saved'];
  const ids = ['manual', 'automation', 'long', 'back', 'baseline', 'north', 'closed', 'm1', 'm2', 'm3', 'm4'];
  const seeded = Object.fromEntries(
    statuses.map((status, i) => [`fixture:${ids[i]}`, { status, updatedAt: now, appliedAt: now, snapshot: { title: `משרה ${i}`, url: '' } }]),
  );
  await page.addInitScript((v) => localStorage.setItem('qa-radar:statuses', v), JSON.stringify(seeded));
  await page.goto('./?view=mine');

  const width = await page.evaluate(() => document.documentElement.clientWidth);
  for (const group of ['סינון לפי סטטוס', 'סינון לפי פורמט ראיון']) {
    const buttons = await page.getByRole('group', { name: group }).getByRole('button').all();
    expect(buttons.length).toBeGreaterThan(3);
    for (const button of buttons) {
      const box = (await button.boundingBox())!;
      expect(box.x, `${await button.textContent()} starts off screen`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${await button.textContent()} is cut at the edge`).toBeLessThanOrEqual(width);
    }
  }
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
