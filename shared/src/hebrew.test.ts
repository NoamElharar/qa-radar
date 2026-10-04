import { describe, expect, it } from 'vitest';
import { compileTerms, matchesQuery, normalizeText, termToRegExp } from './hebrew.ts';

describe('normalizeText', () => {
  it.each([
    ['בודק/ת תוכנה', 'בודק תוכנה'],
    ['מפתח.ת אוטומציה', 'מפתח אוטומציה'],
    ['דרוש/ה QA', 'דרוש qa'],
    ['מנהל(ת) פרויקט', 'מנהל פרויקט'],
    ['סטודנט/ית', 'סטודנט'],
    ['בּוֹדֵק', 'בודק'], // niqqud
    ['ג׳וניור', "ג'וניור"], // geresh
    ['ר״צ  QA', 'ר"צ qa'], // gershayim + spaces
    ['Senior   QA Engineer', 'senior qa engineer'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it('leaves Latin slashes alone', () => {
    expect(normalizeText('QA/QC Engineer')).toBe('qa/qc engineer');
  });
});

describe('termToRegExp', () => {
  const tester = termToRegExp('בודק');

  it.each(['בודק', 'הבודק', 'לבודקי', 'בודקים', 'ובודקת'])('Hebrew term matches inflected form "%s"', (word) => {
    expect(tester.test(normalizeText(word))).toBe(true);
  });

  it('does not match inside an unrelated word', () => {
    expect(tester.test('מבודקן')).toBe(false);
  });

  it('inflects every word of a multi-word Hebrew term', () => {
    expect(termToRegExp('בודק תוכנה').test(normalizeText('דרושים בודקי תוכנה'))).toBe(true);
  });

  it('can disable inflection (city names)', () => {
    const city = termToRegExp('ראשון', { inflect: false });
    expect(city.test('בראשון')).toBe(true);
    expect(city.test('ראשונים')).toBe(false);
  });

  it('English terms match whole words, plural allowed', () => {
    const re = termToRegExp('tester');
    expect(re.test('senior testers wanted')).toBe(true);
    expect(re.test('contester')).toBe(false);
  });

  it('supports raw regex terms', () => {
    expect(termToRegExp('re:^qa\\b').test('qa lead')).toBe(true);
  });
});

describe('compileTerms', () => {
  it('reports the first matching term', () => {
    const terms = compileTerms(['SDET', 'בדיקות תוכנה']);
    expect(terms.firstMatch(normalizeText('מהנדס/ת בדיקות תוכנה'))).toBe('בדיקות תוכנה');
    expect(terms.test('product manager')).toBe(false);
  });
});

describe('matchesQuery', () => {
  it('ignores gender slashes, inflections and case', () => {
    expect(matchesQuery('בודק/ת תוכנה ידני/ת · SQLink', 'בודק sqlink')).toBe(true);
    expect(matchesQuery('בודק/ת תוכנה ידני/ת · SQLink', 'בודקת SQLINK')).toBe(true);
    expect(matchesQuery('בודק/ת תוכנה', 'מפתח')).toBe(false);
    expect(matchesQuery('Senior QA Engineer', '')).toBe(true);
  });
});
