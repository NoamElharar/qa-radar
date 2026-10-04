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

/** "לפני 3 שעות", "אתמול", "לפני 5 ימים" — relative to now, in Hebrew. */
export function relativeTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const diffMs = Date.parse(iso) - now.getTime();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60000);
  if (abs < 60000) return 'עכשיו';
  if (abs < 3600000) return rtf.format(minutes, 'minute');
  if (abs < 86400000) return rtf.format(Math.round(diffMs / 3600000), 'hour');
  if (abs < 30 * 86400000) return rtf.format(Math.round(diffMs / 86400000), 'day');
  return rtf.format(Math.round(diffMs / (30 * 86400000)), 'month');
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
