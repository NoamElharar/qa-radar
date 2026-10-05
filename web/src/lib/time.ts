const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });
const dateFmt = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const dateTimeFmt = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' });

const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;

/** Some ICU versions append the count to Hebrew dual forms: "לפני שעתיים (2)". Drop it. */
const format = (value: number, unit: Intl.RelativeTimeFormatUnit) => rtf.format(value, unit).replace(/\s*\(\d+\)\s*$/, '');

/** "לפני 3 שעות", "אתמול", "לפני 5 ימים", "לפני 3 שבועות" — relative to now, in Hebrew. */
export function relativeTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const diffMs = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diffMs);
  if (abs < 60000) return 'עכשיו';
  if (abs < HOUR_MS) return format(Math.round(diffMs / 60000), 'minute');
  if (abs < DAY_MS) return format(Math.round(diffMs / HOUR_MS), 'hour');
  if (abs < 14 * DAY_MS) return format(Math.round(diffMs / DAY_MS), 'day');
  if (abs < 56 * DAY_MS) return format(Math.round(diffMs / (7 * DAY_MS)), 'week');
  return format(Math.round(diffMs / (30 * DAY_MS)), 'month');
}

/** Israeli day-first date, e.g. 04.10.2026. */
export function formatDate(iso: string | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : '';
}

export function formatDateTime(iso: string | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : '';
}

/** YYYY-MM-DD of an instant in Israel — used for "checked today?" comparisons. */
export function israelDayKey(date: Date | string): string {
  return dayKeyFmt.format(typeof date === 'string' ? new Date(date) : date);
}
