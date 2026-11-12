import { expect, test, type Page } from '@playwright/test';
import { auditLayout } from './helpers.ts';

const row = (page: Page, title: string) => page.locator('li').filter({ hasText: title });

/** One application saved before status history existed: only the dates of the entry itself. */
async function seedOldApplication(page: Page) {
  const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
  await page.addInitScript(
    (value) => {
      if (!localStorage.getItem('qa-radar:statuses'))
        localStorage.setItem('qa-radar:statuses', value);
    },
    JSON.stringify({
      'manual:old': {
        status: 'applied',
        appliedAt: day(6),
        updatedAt: day(6),
        manual: true,
        snapshot: { title: 'בודק תוכנה ותיק', company: 'סוכנות א', url: '' },
      },
    }),
  );
}

test('each status change becomes a dated step that can be fixed or removed', async ({ page }) => {
  await seedOldApplication(page);
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('./?view=mine');

  const item = row(page, 'בודק תוכנה ותיק');
  await item.locator('button[aria-expanded]').click();
  const history = item.getByRole('region', { name: 'מהלך המועמדות' });
  await expect(history.getByRole('listitem')).toHaveCount(1);

  // A recruiter called; then a mis-tap on "הצעה", corrected to the video interview.
  const statuses = item.getByRole('radiogroup', { name: 'סטטוס' });
  await statuses.getByRole('radio', { name: 'שיחה ממגייסת' }).click();
  await statuses.getByRole('radio', { name: 'הצעה' }).click();
  await statuses.getByRole('radio', { name: 'ראיון שיחת וידאו' }).click();
  await expect(history.getByRole('listitem')).toHaveText([
    /הגשתי/,
    /שיחה ממגייסת/,
    /הצעה/,
    /ראיון שיחת וידאו/,
  ]);

  await history.getByRole('button', { name: 'מחק את השלב "הצעה"' }).click();
  await expect(history.getByRole('listitem')).toHaveText([
    /הגשתי/,
    /שיחה ממגייסת/,
    /ראיון שיחת וידאו/,
  ]);
  // The current status can't be removed from the history (change the status instead).
  await expect(history.getByRole('button', { name: /ראיון שיחת וידאו/ })).toHaveCount(0);

  // The call happened the day after applying, not today.
  const applied = await history.getByLabel('תאריך: הגשתי').inputValue();
  const nextDay = new Date(`${applied}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const callDay = nextDay.toISOString().slice(0, 10);
  await history.getByLabel('תאריך: שיחה ממגייסת').fill(callDay);

  const audit = await auditLayout(page);
  expect(audit.overflowX).toBe(0);
  expect(audit.offscreen).toEqual([]);

  // Saved in the browser: still there after a reload.
  await page.reload();
  await row(page, 'בודק תוכנה ותיק').locator('button[aria-expanded]').click();
  const after = row(page, 'בודק תוכנה ותיק').getByRole('region', { name: 'מהלך המועמדות' });
  await expect(after.getByRole('listitem')).toHaveText([
    /הגשתי/,
    /שיחה ממגייסת/,
    /ראיון שיחת וידאו/,
  ]);
  await expect(after.getByLabel('תאריך: שיחה ממגייסת')).toHaveValue(callDay);
});
