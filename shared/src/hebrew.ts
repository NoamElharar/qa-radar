/**
 * Hebrew-aware text normalization shared by the collector (classification) and the dashboard (search).
 */

const NIQQUD = /[\u0591-\u05C7]/g;
const HEBREW_LETTER = 'א-ת';

/**
 * Collapse gender/plural markers that recruiters attach to words:
 * "בודק/ת" → "בודק", "מפתח.ת" → "מפתח", "מנהל(ת)" → "מנהל", "דרוש/ה" → "דרוש", "מנתח/ת" → "מנתח".
 */
const GENDER_SUFFIX = new RegExp(
  `([${HEBREW_LETTER}]{2,})(?:[/.\\\\]|\\s/\\s?)\\(?(?:ית|ות|יות|ת|ה|ים|י)\\)?(?![${HEBREW_LETTER}])`,
  'g',
);
const GENDER_PARENS = new RegExp(`([${HEBREW_LETTER}]{2,})\\((?:ית|ות|ת|ה|ים)\\)`, 'g');

/** Normalize Hebrew/English text for matching. Lower-cases Latin, strips niqqud, unifies quotes and gender slashes. */
export function normalizeText(input: string): string {
  return input
    .normalize('NFC')
    .replace(NIQQUD, '')
    .replace(/[\u05F3\u2018\u2019`´]/g, "'") // geresh and fancy single quotes
    .replace(/[\u05F4\u201C\u201D]/g, '"') // gershayim and fancy double quotes
    .replace(/[\u2013\u2014\u05BE]/g, '-') // en/em dash, maqaf
    .replace(GENDER_PARENS, '$1')
    .replace(GENDER_SUFFIX, '$1')
    .replace(/\u00A0/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const HAS_HEBREW = /[א-ת]/;

/**
 * Build a regex that matches a dictionary term inside normalized text.
 *
 * - Hebrew terms tolerate up to two attached prefix letters (ה/ב/ל/ו/מ/ש/כ) and common inflection
 *   suffixes, so "בודק" matches "הבודקת", "לבודקי", "בודקים".
 * - English terms match on word boundaries and tolerate a plural "s".
 * - Terms starting with `re:` are used as raw regular expressions.
 */
export function termToRegExp(term: string, options: { inflect?: boolean } = {}): RegExp {
  if (term.startsWith('re:')) return new RegExp(term.slice(3), 'i');
  const inflect = options.inflect ?? true;
  const normalized = normalizeText(term);
  if (HAS_HEBREW.test(normalized)) {
    const suffix = inflect ? '(?:ת|ית|י|ים|ות|יות)?' : '';
    const body = normalized
      .split(' ')
      .map((w) => (HAS_HEBREW.test(w) ? `${escapeRegExp(w)}${suffix}` : escapeRegExp(w)))
      .join('[\\s\\-]+');
    return new RegExp(`(?<![${HEBREW_LETTER}])[ובכלמשה]{0,2}${body}(?![${HEBREW_LETTER}])`, 'i');
  }
  const body = normalized
    .split(' ')
    .map((w) => escapeRegExp(w))
    .join('[\\s\\-]+');
  const start = /^\w/.test(normalized) ? '\\b' : '';
  const end = /\w$/.test(normalized) ? '(?:s|es)?\\b' : '';
  return new RegExp(`${start}${body}${end}`, 'i');
}

/** Compile a list of terms once; returns a predicate plus the first matching term. */
export function compileTerms(
  terms: readonly string[],
  options: { inflect?: boolean } = {},
): {
  test: (normalizedText: string) => boolean;
  firstMatch: (normalizedText: string) => string | undefined;
} {
  const compiled = terms.map((t) => ({ term: t, re: termToRegExp(t, options) }));
  return {
    test: (text) => compiled.some(({ re }) => re.test(text)),
    firstMatch: (text) => compiled.find(({ re }) => re.test(text))?.term,
  };
}

const HEBREW_INFLECTION = /(?:ית|ות|ים|ת|ה|י)$/;

/**
 * Search helper for the dashboard: every query word must appear in the normalized haystack.
 * Hebrew words also match without a gender/plural ending, so "בודקת" finds "בודק/ת".
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const hay = normalizeText(haystack);
  return q.split(' ').every((word) => {
    if (hay.includes(word)) return true;
    if (!HAS_HEBREW.test(word) || word.length < 4) return false;
    return hay.includes(word.replace(HEBREW_INFLECTION, ''));
  });
}
