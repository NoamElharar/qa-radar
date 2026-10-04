/**
 * Date handling in Israel time (Asia/Jerusalem), including Hebrew relative phrases.
 */

export const ISRAEL_TZ = 'Asia/Jerusalem';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ISRAEL_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  weekday: 'short',
});

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface IsraelParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

export function israelParts(date: Date): IsraelParts {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? 'Sun'),
  };
}

/** Offset of Israel time from UTC (minutes) at a given instant — 120 in winter, 180 in summer. */
function israelOffsetMinutes(utcMs: number): number {
  const p = israelParts(new Date(utcMs));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

/** Convert an Israel wall-clock time to a UTC Date (DST-aware). */
export function israelLocalToDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let utc = guess - israelOffsetMinutes(guess) * 60000;
  // Re-check once around DST transitions.
  utc = guess - israelOffsetMinutes(utc) * 60000;
  return new Date(utc);
}

function startOfIsraelDay(date: Date, daysBack = 0): Date {
  const p = israelParts(date);
  const d = israelLocalToDate(p.year, p.month, p.day);
  return new Date(d.getTime() - daysBack * 86400000);
}

const HE_NUMBERS: Record<string, number> = {
  אחד: 1, אחת: 1, שניים: 2, שתיים: 2, שני: 2, שתי: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4,
  חמש: 5, חמישה: 5, שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10,
};

const UNIT_MS = {
  minute: 60000,
  hour: 3600000,
  day: 86400000,
  week: 7 * 86400000,
  month: 30 * 86400000,
} as const;
type Unit = keyof typeof UNIT_MS;

const HE_UNITS: Array<[RegExp, Unit, number?]> = [
  [/^דקה$|^דקות$/, 'minute'],
  [/^שעה$|^שעות$/, 'hour'],
  [/^שעתיים$/, 'hour', 2],
  [/^יום$|^ימים$/, 'day'],
  [/^יומיים$/, 'day', 2],
  [/^שבוע$|^שבועות$/, 'week'],
  [/^שבועיים$/, 'week', 2],
  [/^חודש$|^חודשים$/, 'month'],
  [/^חודשיים$/, 'month', 2],
];

function relativeHebrew(text: string, now: Date): Date | undefined {
  // Note: \b is ASCII-only in JS regexes, so Hebrew word ends use a negative lookahead instead.
  if (/^(?:פורסם\s+)?היום(?![א-ת])/.test(text)) return now;
  if (/^(?:פורסם\s+)?אתמול(?![א-ת])/.test(text)) return startOfIsraelDay(now, 1);
  if (/^(?:פורסם\s+)?שלשום(?![א-ת])/.test(text)) return startOfIsraelDay(now, 2);
  const m = /לפני\s+(?:כ-?\s*)?(?:(\d+|[א-ת]+)\s+)?([א-ת]+)/.exec(text);
  if (!m) return undefined;
  const [, amountRaw, unitWord] = m;
  for (const [re, unit, implied] of HE_UNITS) {
    if (!unitWord || !re.test(unitWord)) continue;
    let amount = implied ?? 1;
    if (amountRaw) amount = /^\d+$/.test(amountRaw) ? Number(amountRaw) : (HE_NUMBERS[amountRaw] ?? amount);
    return new Date(now.getTime() - amount * UNIT_MS[unit]);
  }
  return undefined;
}

function relativeEnglish(text: string, now: Date): Date | undefined {
  if (/^(today|just now)\b/i.test(text)) return now;
  if (/^yesterday\b/i.test(text)) return startOfIsraelDay(now, 1);
  const m = /(\d+)\+?\s*(minute|hour|day|week|month)s?\s+ago/i.exec(text);
  if (!m) return undefined;
  return new Date(now.getTime() - Number(m[1]) * UNIT_MS[m[2]!.toLowerCase() as Unit]);
}

/**
 * Parse a date as reported by a source. Returns ISO-8601 (UTC) or undefined when unknown/implausible.
 * Accepts ISO strings (naive ones are treated as Israel time), RFC-2822 (RSS), dd/mm/yyyy (Israeli
 * day-first, also with "." or "-"), and Hebrew/English relative phrases ("לפני 3 שעות", "אתמול").
 */
export function parseSourceDate(raw: string | null | undefined, now: Date = new Date()): string | undefined {
  if (!raw) return undefined;
  const text = raw.trim();
  if (!text) return undefined;

  let date: Date | undefined;
  const dayFirst = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?:[ T,]+(\d{1,2}):(\d{2}))?/.exec(text);
  const isoNaive = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/.exec(text);

  if (isoNaive) {
    const [, y, mo, d, h, mi] = isoNaive;
    date = israelLocalToDate(Number(y), Number(mo), Number(d), Number(h ?? 0), Number(mi ?? 0));
  } else if (/^\d{4}-\d{2}-\d{2}T.+(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    date = new Date(text);
  } else if (dayFirst) {
    const [, d, mo, yRaw, h, mi] = dayFirst;
    const y = yRaw!.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    const month = Number(mo);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      date = israelLocalToDate(y, month, day, Number(h ?? 0), Number(mi ?? 0));
    }
  } else if (/^[א-ת]/.test(text)) {
    date = relativeHebrew(text, now);
  } else if (/ago|today|yesterday|just now/i.test(text)) {
    date = relativeEnglish(text, now);
  } else {
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) date = new Date(parsed);
  }

  if (!date || Number.isNaN(date.getTime())) return undefined;
  // Reject sentinels like 01/01/1900 and anything in the future (beyond clock skew).
  if (date.getUTCFullYear() < 2015 || date.getTime() > now.getTime() + 36 * 3600000) return undefined;
  return date.toISOString();
}
