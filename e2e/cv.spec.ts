import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { TITLES } from './fixtures.ts';
import { auditLayout, lowContrastText } from './helpers.ts';

/** A Word file with one paragraph per line (what a CV exported from Word or Google Docs looks like inside). */
function docx(lines: string[]): Buffer {
  const body = lines
    .map((l) => `<w:p><w:r><w:t xml:space="preserve">${l}</w:t></w:r></w:p>`)
    .join('');
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      ),
      'word/document.xml': strToU8(
        `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`,
      ),
    }),
  );
}

/** A one-page PDF with a line of English text in a standard font. */
function pdf(text: string): Buffer {
  const stream = `BT /F1 14 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const CV_LINES = [
  'QA Engineer',
  'בדיקות ידניות ורגרסיה',
  'Playwright · TypeScript · Python · SQL',
  'Mobile: 054-1234567 · noa@example.test', // a phone number, not mobile testing
];

const card = (page: Page, title: string) => page.getByRole('article', { name: title, exact: true });
const cvRegion = (page: Page) => page.getByRole('region', { name: 'התאמה לפי קורות החיים' });

async function upload(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await cvRegion(page).getByLabel('בחירת קובץ קורות חיים').setInputFiles(file);
  await cvRegion(page).getByRole('button', { name: 'נתח קורות חיים' }).click();
}

test('a CV uploaded once re-scores every job against its skills', async ({ page }) => {
  await page.goto('./');
  const cv = cvRegion(page);
  await expect(cv.getByText('מספיק פעם אחת')).toBeVisible();

  await upload(page, {
    name: 'cv-2026.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: docx(CV_LINES),
  });
  await expect(cv.getByRole('heading', { name: /נמצאו 5 כישורים/ })).toBeVisible();
  const chips = cv.getByRole('list', { name: 'הכישורים שלי' }).getByRole('button');
  await expect(chips).toHaveText(['Manual / E2E', 'SQL', 'Python', 'Playwright', 'TypeScript']);

  // The open jobs, by the fixed profile and by this CV: averages 61 → 63, strong matches 5 → 4.
  const table = cv.getByRole('table', { name: /מה ישתנה ב-6 המשרות הפתוחות/ });
  await expect(table.getByRole('row', { name: /ציון ממוצע/ })).toHaveText(/61\s*63 \(\+2\)/);
  await expect(table.getByRole('row', { name: /התאמה גבוהה/ })).toHaveText(/5\s*4 \(−1\)/);

  // Fix what the reader got wrong: drop Python, add Postman.
  await cv.getByRole('button', { name: 'הסר את Python' }).click();
  await cv.getByLabel('הוספת כישור').selectOption('Postman');
  await expect(chips).toHaveText(['Manual / E2E', 'SQL', 'Postman', 'Playwright', 'TypeScript']);
  await cv.getByRole('button', { name: 'שמור והשתמש בקורות החיים' }).click();

  await expect(cv.getByRole('switch', { name: 'ציון לפי קורות החיים' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(cv).toContainText('cv-2026.docx');
  await expect(cv).toContainText('5 כישורים');
  await expect(cv).toContainText('ציון ממוצע 63');
  await expect(cv.getByRole('listitem').filter({ hasText: 'API testing' })).toContainText(
    '17% · 1 משרות',
  );

  // 50 + 6 (Playwright) − 12 (API, Java) + 10 (mid level) + 6 (2 years, as asked) = 60, was 88 by the profile.
  const automation = card(page, TITLES.automationNew);
  await expect(automation.getByTitle('ציון התאמה לקורות החיים')).toHaveText(/60$/);
  await expect(card(page, TITLES.manualNew).getByTitle('ציון התאמה לקורות החיים')).toHaveText(
    /70$/,
  );

  // Switched off, jobs go back to the fixed profile — and the choice survives a reload.
  await cv.getByRole('switch', { name: 'ציון לפי קורות החיים' }).click();
  await expect(automation.getByTitle('ציון התאמה לפרופיל')).toHaveText(/88$/);
  await page.reload();
  await expect(cvRegion(page).getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  await expect(card(page, TITLES.automationNew).getByTitle('ציון התאמה לפרופיל')).toHaveText(/88$/);
  await cvRegion(page).getByRole('switch').click();
  await expect(card(page, TITLES.automationNew).getByTitle('ציון התאמה לקורות החיים')).toHaveText(
    /60$/,
  );

  const audit = await auditLayout(page);
  expect(audit.overflowX, 'the page scrolls sideways').toBeLessThanOrEqual(0);
  expect(audit.offscreen, 'elements stick out of the screen').toEqual([]);
  expect(audit.tooSmall, 'tap targets under 24×24 px').toEqual([]);
  expect(await lowContrastText(page), 'text below 4.5:1').toEqual([]);

  // "ניהול" opens the full panel in "שלי": the skills, the tips, and deleting.
  await cvRegion(page).getByRole('button', { name: 'ניהול קורות החיים' }).click();
  await expect(page.getByRole('heading', { name: 'המועמדויות שלי' })).toBeVisible();
  const full = cvRegion(page);
  await expect(
    full.getByRole('list', { name: 'הכישורים מקורות החיים' }).getByRole('listitem'),
  ).toHaveCount(5);
  await expect(
    full.getByRole('heading', { name: 'משרות מבקשות, ולא מופיע בקורות החיים' }),
  ).toBeVisible();
  expect(await lowContrastText(page), 'text below 4.5:1').toEqual([]);
  page.once('dialog', (d) => void d.accept());
  await full.getByRole('button', { name: 'מחיקה' }).click();
  await expect(full.getByText('מספיק פעם אחת')).toBeVisible();
});

test('a PDF CV is read too; an old .doc file gets a clear message', async ({ page }) => {
  await page.goto('./?view=mine');
  const cv = cvRegion(page);
  await upload(page, {
    name: 'cv.pdf',
    mimeType: 'application/pdf',
    buffer: pdf('Skills: Playwright, Python, SQL'),
  });
  await expect(cv.getByRole('heading', { name: /נמצאו 3 כישורים/ })).toBeVisible();
  await expect(cv.getByRole('list', { name: 'הכישורים שלי' }).getByRole('button')).toHaveText([
    'SQL',
    'Python',
    'Playwright',
  ]);
  await cv.getByRole('button', { name: 'ביטול' }).click();

  await upload(page, {
    name: 'cv.doc',
    mimeType: 'application/msword',
    buffer: Buffer.from('old word'),
  });
  await expect(cv.getByRole('alert')).toContainText('.docx');
});
