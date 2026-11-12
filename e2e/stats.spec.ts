import { expect, test, type Page } from '@playwright/test';
import { auditLayout } from './helpers.ts';

/** Midday (UTC 10:00) `n` days ago, so a day difference never depends on the hour the suite runs. */
const day = (n: number) => {
  const t = new Date(Date.now() - n * 864e5);
  t.setUTCHours(10, 0, 0, 0);
  return t.toISOString();
};

/**
 * Eight applications: five to the watched agency (one answered two days later), one to a company's own
 * site 40 days ago, and two added by hand — one to the same agency (a call, then a video interview) and
 * one rejected two days after applying.
 */
async function seedApplications(page: Page) {
  const radar = (n: number) => ({
    status: 'applied',
    appliedAt: day(20),
    updatedAt: day(20),
    snapshot: { title: `בודק תוכנה ${n}`, url: `https://watched.example.test/${n}` },
  });
  const statuses = {
    'watched:1': {
      ...radar(1),
      status: 'recruiter_call',
      updatedAt: day(18),
      history: [
        { status: 'applied', at: day(20) },
        { status: 'recruiter_call', at: day(18) },
      ],
    },
    'watched:2': radar(2),
    'watched:3': radar(3),
    'watched:4': radar(4),
    'watched:5': radar(5),
    'fixture:gone': {
      status: 'applied',
      appliedAt: day(40),
      updatedAt: day(40),
      snapshot: { title: 'משרה ישנה', url: 'https://jobs.example.test/gone' },
    },
    'manual:a': {
      status: 'interview_video',
      appliedAt: day(10),
      updatedAt: day(3),
      manual: true,
      history: [
        { status: 'applied', at: day(10) },
        { status: 'recruiter_call', at: day(9) },
        { status: 'interview_video', at: day(3) },
      ],
      snapshot: { title: 'QA ידני', company: 'סוכנות במעקב', url: '' },
    },
    'manual:b': {
      status: 'rejected',
      appliedAt: day(3),
      updatedAt: day(1),
      manual: true,
      history: [
        { status: 'applied', at: day(3) },
        { status: 'rejected', at: day(1) },
      ],
      snapshot: { title: 'QA Automation', company: 'Gtech', url: '' },
    },
  };
  await page.addInitScript((value) => {
    if (!localStorage.getItem('qa-radar:statuses'))
      localStorage.setItem('qa-radar:statuses', value);
  }, JSON.stringify(statuses));
}

test('the statistics tab follows my applications from sending to an answer', async ({ page }) => {
  await seedApplications(page);
  await page.goto('./');
  await page
    .getByRole('navigation', { name: 'תצוגות' })
    .getByRole('button', { name: 'סטטיסטיקה' })
    .click();
  await expect(page.getByRole('heading', { name: 'סטטיסטיקה' })).toBeVisible();

  const funnel = page.getByRole('region', { name: 'המשפך' });
  await expect(funnel.getByRole('listitem')).toHaveText([
    /הגשות\s*8/,
    /קיבלו תשובה\s*3 · 38% מההגשות/,
    // Fewer than 5 answers: the count, but no percentage.
    /^הגיעו לשיחה\s*2$/,
    /^הגיעו לראיון\s*1$/,
    /^קיבלו הצעה\s*0$/,
  ]);

  // The hand-added application to the agency joins the agency's row.
  const agencies = page.getByRole('region', { name: 'תשובות לפי חברת השמה' });
  await expect(agencies.getByRole('listitem').filter({ hasText: 'מתוך' })).toHaveText([
    /סוכנות במעקב\s*2 מתוך 6 · 33%/,
    // One application each: the one with an answer first.
    /^Gtech\s*1 מתוך 1$/,
    /^מקור בדיקה\s*0 מתוך 1$/,
    /משרות מהרדאר\s*1 מתוך 6 · 17%/,
    /הוספתי ידנית\s*2 מתוך 2/,
  ]);

  const timing = page.getByRole('region', { name: 'זמן עד תשובה' });
  await expect(timing).toContainText('חציון: יומיים · לפי 3 תשובות עם תאריך ידוע');
  await expect(timing.getByRole('listitem').filter({ hasText: 'אחרי 14 יום' })).toHaveText(
    /5 מתוך 6 · 83%/,
  );

  // Every week's numbers are a focus away (and in the table for screen readers).
  const weekly = page.getByRole('region', { name: 'הגשות לפי שבוע' });
  const busiest = weekly.getByRole('img', { name: /: 5 הגשות · 1 קיבלו תשובה$/ });
  await busiest.focus();
  await expect(weekly.getByRole('tooltip')).toHaveText(/: 5 הגשות · 1 קיבלו תשובה$/);

  const audit = await auditLayout(page);
  expect(audit.overflowX, 'the page scrolls sideways').toBeLessThanOrEqual(0);
  expect(audit.offscreen, 'elements stick out of the screen').toEqual([]);
  expect(audit.tooSmall, 'tap targets under 24×24 px').toEqual([]);

  // The last 30 days leave out the application from 40 days ago; the choice survives a reload.
  await page.getByRole('combobox', { name: 'תקופה' }).selectOption('30d');
  await expect(funnel.getByRole('listitem').first()).toHaveText(/הגשות\s*7/);
  await expect(page).toHaveURL(/sp=30d/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'תקופה' })).toHaveValue('30d');
  await expect(funnel.getByRole('listitem').first()).toHaveText(/הגשות\s*7/);
});

test('with no applications yet, the statistics tab points to "שלי"', async ({ page }) => {
  await page.goto('./?view=stats');
  await expect(page.getByText('עוד אין הגשות לנתח')).toBeVisible();
  await page.getByRole('button', { name: 'לשונית "שלי"' }).click();
  await expect(page.getByRole('heading', { name: 'המועמדויות שלי' })).toBeVisible();
});
