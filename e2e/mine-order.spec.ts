import { expect, test, type Page } from '@playwright/test';
import { auditLayout } from './helpers.ts';

const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

/** Four applications added by hand, Alpha updated most recently … Delta longest ago; Bravo and Charlie have notes. */
async function seed(page: Page) {
  const entry = (title: string, daysAgo: number, note?: string) => ({
    status: 'applied',
    appliedAt: day(daysAgo),
    updatedAt: day(daysAgo),
    manual: true,
    ...(note ? { note } : {}),
    snapshot: { title, company: 'אקמה', url: '' },
  });
  const statuses = {
    'manual:a': entry('Alpha QA', 1),
    'manual:b': entry('Bravo QA', 2, 'לחזור אליהם'),
    'manual:c': entry('Charlie QA', 3, 'ראיון טלפוני'),
    'manual:d': entry('Delta QA', 4),
  };
  await page.addInitScript((value) => {
    if (!localStorage.getItem('qa-radar:statuses'))
      localStorage.setItem('qa-radar:statuses', value);
  }, JSON.stringify(statuses));
}

/** The "הגשתי" group, and its rows' titles top to bottom. */
const appliedGroup = (page: Page) =>
  page
    .locator('section')
    .filter({ has: page.locator('h3').getByRole('button', { name: /^הגשתי/ }) });
const titles = (page: Page) => appliedGroup(page).locator('li bdi[dir]').allInnerTexts();
const row = (page: Page, title: string) =>
  appliedGroup(page)
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: new RegExp(`^${title}`) }) });
const handle = (page: Page, title: string) =>
  page.getByRole('button', { name: `שינוי המקום של "${title}"` });

async function moveWithButton(page: Page, title: string, direction: 'העבר למעלה' | 'העבר למטה') {
  const expand = page.getByRole('button', { name: new RegExp(`^${title}`) });
  await expand.click();
  await row(page, title).getByRole('button', { name: direction }).click();
  await expand.click(); // close it again
}

test('"הסדר שלי": move applications with the keyboard or one tap, also inside a filter', async ({
  page,
}) => {
  await seed(page);
  await page.goto('./?view=mine');
  await expect.poll(() => titles(page)).toEqual(['Alpha QA', 'Bravo QA', 'Charlie QA', 'Delta QA']);
  await expect(handle(page, 'Alpha QA')).toHaveCount(0); // no handles in the other sorts

  // Choosing it moves nothing: it starts in the order shown.
  await page.getByRole('combobox', { name: 'מיון' }).selectOption('mine');
  await expect(page).toHaveURL(/msort=mine/);
  await expect(page.getByText('גרירה של ⋮⋮ משנה את הסדר')).toBeVisible();
  await expect.poll(() => titles(page)).toEqual(['Alpha QA', 'Bravo QA', 'Charlie QA', 'Delta QA']);

  // Keyboard: Space picks the row up, an arrow moves it, Space puts it down — each step announced in Hebrew.
  await handle(page, 'Alpha QA').focus();
  await page.keyboard.press('Space');
  await expect(page.getByText('הרמת את "Alpha QA", מקום 1 מתוך 4.')).toBeAttached();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByText('"Alpha QA" עכשיו במקום 2 מתוך 4.')).toBeAttached();
  await page.keyboard.press('Space');
  await expect(page.getByText('"Alpha QA" הונח במקום 2 מתוך 4.')).toBeAttached();
  await expect.poll(() => titles(page)).toEqual(['Bravo QA', 'Alpha QA', 'Charlie QA', 'Delta QA']);

  // One tap, without dragging.
  await moveWithButton(page, 'Delta QA', 'העבר למעלה');
  await expect.poll(() => titles(page)).toEqual(['Bravo QA', 'Alpha QA', 'Delta QA', 'Charlie QA']);

  // Inside a filter (with notes: Bravo, Charlie), Charlie goes above Bravo — the hidden rows stay put.
  await page.getByRole('button', { name: 'עם הערות' }).click();
  await expect.poll(() => titles(page)).toEqual(['Bravo QA', 'Charlie QA']);
  await moveWithButton(page, 'Charlie QA', 'העבר למעלה');
  await expect.poll(() => titles(page)).toEqual(['Charlie QA', 'Bravo QA']);
  await page.getByRole('button', { name: 'עם הערות' }).click();
  await expect.poll(() => titles(page)).toEqual(['Charlie QA', 'Bravo QA', 'Alpha QA', 'Delta QA']);

  const audit = await auditLayout(page);
  expect(audit.overflowX, 'the page scrolls sideways').toBeLessThanOrEqual(0);
  expect(audit.tooSmall, 'tap targets under 24×24 px').toEqual([]);

  // Kept across a reload, sort included.
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'מיון' })).toHaveValue('mine');
  await expect.poll(() => titles(page)).toEqual(['Charlie QA', 'Bravo QA', 'Alpha QA', 'Delta QA']);

  // A new status takes the application to its new group, at the top; the others keep their order.
  await page.getByRole('button', { name: /^Bravo QA/ }).click();
  await row(page, 'Bravo QA').getByRole('radio', { name: 'שיחה ממגייסת' }).click();
  await expect.poll(() => titles(page)).toEqual(['Charlie QA', 'Alpha QA', 'Delta QA']);
});

/**
 * A finger dragging from one point to another: the touch pointer events the browser sends (Playwright's
 * touchscreen can only tap), one move per frame.
 */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.evaluate(
    async ({ from, to }) => {
      const at = (x: number, y: number): PointerEventInit => ({
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: 'touch',
        isPrimary: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: 1,
      });
      document
        .elementFromPoint(from.x, from.y)!
        .dispatchEvent(new PointerEvent('pointerdown', at(from.x, from.y)));
      for (let i = 1; i <= 20; i++) {
        const y = from.y + ((to.y - from.y) * i) / 20;
        document.dispatchEvent(new PointerEvent('pointermove', at(from.x, y)));
        await new Promise((r) => requestAnimationFrame(r));
      }
      document.dispatchEvent(new PointerEvent('pointerup', at(from.x, to.y)));
    },
    { from, to },
  );
}

test('"הסדר שלי": drag a row by its handle (mouse on desktop, a finger on the iPhone)', async ({
  page,
  isMobile,
}) => {
  await seed(page);
  await page.goto('./?view=mine&msort=mine');
  await expect.poll(() => titles(page)).toEqual(['Alpha QA', 'Bravo QA', 'Charlie QA', 'Delta QA']);

  // Only what is on screen can be pressed.
  await appliedGroup(page).scrollIntoViewIfNeeded();
  const box = async (title: string) => {
    const b = (await handle(page, title).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const from = await box('Delta QA');
  const to = await box('Alpha QA');
  if (isMobile) {
    await touchDrag(page, from, { x: to.x, y: to.y - 4 });
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y - 12, { steps: 4 });
    await page.mouse.move(to.x, to.y - 4, { steps: 16 });
    await page.mouse.up();
  }
  await expect.poll(() => titles(page)).toEqual(['Delta QA', 'Alpha QA', 'Bravo QA', 'Charlie QA']);

  await page.reload();
  await expect.poll(() => titles(page)).toEqual(['Delta QA', 'Alpha QA', 'Bravo QA', 'Charlie QA']);
});
