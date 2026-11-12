import { expect, test, type Page } from '@playwright/test';
import { auditLayout } from './helpers.ts';

const row = (page: Page, title: string) => page.locator('li').filter({ hasText: title });

/** Two applications sent to the same company ("אקמה") by two different agencies. */
async function seedTwoAgencies(page: Page) {
  const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
  const manual = (title: string, company: string, daysAgo: number) => ({
    status: 'applied',
    appliedAt: day(daysAgo),
    updatedAt: day(daysAgo),
    manual: true,
    endClient: 'אקמה',
    snapshot: { title, company, url: '' },
  });
  await page.addInitScript(
    (value) => {
      if (!localStorage.getItem('qa-radar:statuses'))
        localStorage.setItem('qa-radar:statuses', value);
    },
    JSON.stringify({
      'manual:first': manual('בודק תוכנה ראשון', 'סוכנות א', 9),
      'manual:second': manual('בודק תוכנה שני', 'סוכנות ב', 2),
    }),
  );
}

test('two agencies sending my CV to the same company are flagged in "שלי"', async ({ page }) => {
  await seedTwoAgencies(page);
  await page.goto('./?view=mine');

  await expect(row(page, 'בודק תוכנה שני').getByText('2 הגשות ל-אקמה')).toBeVisible();
  const flag = page.getByRole('button', { name: /הגשה כפולה ללקוח/ });
  await expect(flag).toHaveText(/2$/);

  // The open row names the other agency and when it applied.
  await row(page, 'בודק תוכנה שני').locator('button[aria-expanded]').click();
  await expect(row(page, 'בודק תוכנה שני').getByText(/סוכנות א · הגשתי · הוגש/)).toBeVisible();

  const audit = await auditLayout(page);
  expect(audit.overflowX).toBe(0);
  expect(audit.offscreen).toEqual([]);
});

test('the add form warns before a third agency is logged for the same company', async ({
  page,
}) => {
  await seedTwoAgencies(page);
  await page.goto('./?view=mine');

  await page.getByRole('button', { name: /הוספת מועמדות ידנית/ }).click();
  const form = page.getByRole('form', { name: 'הוספת מועמדות ידנית' });
  await form.getByLabel('שם המשרה *').fill('בודק תוכנה שלישי');
  await form.getByLabel('חברה', { exact: true }).fill('סוכנות ג');
  await form.getByLabel(/לקוח הקצה/).fill('אקמה');
  await expect(form.getByRole('status')).toContainText('כבר יש לך 2 מועמדויות ל-אקמה');
  await expect(form.getByRole('status')).toContainText('עלולה לפסול');

  // Saved anyway: now three applications to that company, and a reload keeps the end client.
  await form.getByRole('button', { name: 'שמור מועמדות' }).click();
  await page.reload();
  await expect(row(page, 'בודק תוכנה שלישי').getByText('3 הגשות ל-אקמה')).toBeVisible();
});
