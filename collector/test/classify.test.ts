import { beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { createClassifier, parseYearsRequired, type Classifier } from '../src/pipeline/classify.ts';
import { normalizeText } from '@qa-radar/shared';

// These tests run against the real config/*.yaml, so they double as regression tests for
// the dictionaries. Most examples are real job titles seen during the source audit.
let classifier: Classifier;
beforeAll(() => {
  classifier = createClassifier(loadConfig());
});

describe('QA relevance — accepted', () => {
  it.each([
    'דרוש/ה בודק/ת תוכנה מנוסה לארגון פיננסי באזור המרכז',
    'Manual QA Engineer ל- IBI קפיטל',
    'בודק איכות ידני - QA',
    'SDET – Payments Platform',
    'הזדמנות ראשונה להיכנס לעולם ה-QA – ללא ניסיון קודם!',
    'מהנדס/ת בדיקות תוכנה',
    'Senior Test Automation Engineer',
    'ר"צ בדיקות תוכנה',
  ])('%s', (title) => {
    expect(classifier.decideQa(title, undefined, false).qa).toBe(true);
  });

  it('ambiguous titles need software context…', () => {
    const description = 'פיתוח תשתיות אוטומציה לבדיקות API ו-Web, עבודה עם Jira';
    expect(classifier.decideQa('מפתח/ת Automation', description, false)).toMatchObject({ qa: true });
    expect(classifier.decideQa('מפתח/ת אוטומציה', 'תכנות בקרי PLC בקו ייצור', false)).toMatchObject({
      qa: false,
      reason: expect.stringContaining('weak-no-context') as string,
    });
  });

  it('…unless the source page is already a QA category', () => {
    expect(classifier.decideQa('מפתח/ת אוטומציה', 'תכנות בקרי PLC', true).qa).toBe(true);
  });
});

describe('QA relevance — rejected look-alikes (real false positives)', () => {
  it.each([
    'אגף ביטחון - בודק/ת ביטחוני',
    'בודק/ת מתקנים במתח גבוה לתחנת-משנה באר שבע',
    'עובד/ת טכני/ת בתחום בדיקות אל הרס לחיפה',
    'מהנדס/ת חשמל לבדיקות מעבדה בגן שורק ובית דגן',
    'Electromechanical Quality Controller',
    'דרוש/ה מבקר/ת איכות לארגון בטחוני באזור הצפון',
    'מפתח.ת אוטומציה RPA',
    'Application Penetration Tester',
    'Treasury & Automation Analyst',
    'בודק/ת איכות במפעל מזון',
    'QA/QC Engineer – Construction',
    'Product Manager',
  ])('%s', (title) => {
    expect(classifier.decideQa(title, 'בדיקות תוכנה QA API', false).qa).toBe(false);
  });
});

describe('location', () => {
  it('maps agency area labels to a city and region', () => {
    const c = classifier.classify({ title: 'QA Engineer', location: 'ת"א והמרכז' });
    expect(c.city).toBe('תל אביב-יפו');
    expect(c.regions).toContain('center');
  });

  it('maps region words without a city', () => {
    expect(classifier.classify({ title: 'QA', location: 'גוש דן' }).regions).toEqual(['center']);
    expect(classifier.classify({ title: 'QA', location: 'השפלה' }).regions).toEqual(['shfela']);
  });

  it('a city may belong to two regions', () => {
    expect(classifier.classify({ title: 'QA', location: 'ראשון לציון' }).regions.sort()).toEqual(['center', 'shfela']);
  });

  it('falls back to the title, then the start of the description', () => {
    expect(classifier.classify({ title: 'QA למשרד ממשלתי מוביל בירושלים' }).city).toBe('ירושלים');
    expect(
      classifier.classify({ title: 'דרוש/ה QA', description: 'לחברה פיננסית באזור המרכז דרוש/ה QA מנוסה' }).regions,
    ).toEqual(['center']);
  });

  it('does not mistake common words for cities', () => {
    expect(classifier.classify({ title: 'מפתח/ת BI מודיעין עסקי', location: 'אזור המרכז' }).city).toBeUndefined();
    expect(classifier.classify({ title: 'QA', location: 'אזור המרכז' }).regions).toEqual(['center']);
  });

  it('flags hybrid/remote work', () => {
    expect(classifier.classify({ title: 'QA', location: 'רחובות', description: 'מודל עבודה היברידי' }).regions).toEqual([
      'shfela',
      'remote',
    ]);
  });

  it('computes distance from home (קריית עקרון)', () => {
    expect(classifier.classify({ title: 'QA', location: 'רחובות' }).distanceKm).toBeLessThanOrEqual(6);
    expect(classifier.classify({ title: 'QA', location: 'חיפה' }).distanceKm).toBeGreaterThan(90);
  });
});

describe('years of experience & seniority', () => {
  it.each([
    ['ניסיון של 5 שנים לפחות בבדיקות', 5],
    ['3-4 שנות ניסיון ב-QA', 3],
    ['ניסיון של שנתיים לפחות בבדיקות ידניות', 2],
    ['שנת ניסיון בבדיקות ידניות', 1],
    ['5+ years of experience in QA', 5],
    ['החברה פועלת 20 שנים בשוק', undefined],
  ])('%s → %s', (text, years) => {
    expect(parseYearsRequired(normalizeText(text))).toBe(years);
  });

  it('title words win over years', () => {
    expect(classifier.classify({ title: 'Senior QA Engineer' }).seniority).toBe('senior');
    expect(classifier.classify({ title: 'ראש/ת צוות QA' }).seniority).toBe('management');
    expect(classifier.classify({ title: "בודק/ת תוכנה ג'וניור" }).seniority).toBe('junior');
    expect(classifier.classify({ title: 'בודק/ת תוכנה', description: 'ניסיון של 6 שנים' }).seniority).toBe('senior');
  });
});

describe('match score', () => {
  it('is transparent: matched skills (✓) and missing requirements (✗)', () => {
    const c = classifier.classify({
      title: 'בודק/ת תוכנה ידני/ת',
      description: 'בדיקות API עם Postman, כתיבת שאילתות SQL, עבודה ב-Jira. יתרון: Python. ניסיון של שנתיים.',
    });
    expect(c.matched).toEqual(expect.arrayContaining(['Manual / E2E', 'API testing', 'Postman', 'SQL', 'Jira / Xray']));
    expect(c.missing).toEqual(['Python']);
    expect(c.score).toBeGreaterThanOrEqual(80);
  });

  it('demotes senior roles and lists the years gap', () => {
    const c = classifier.classify({ title: 'QA Automation Architect', description: 'ניסיון של 7 שנים, Python, Kubernetes' });
    expect(c.missing).toEqual(expect.arrayContaining(['Python', 'Kubernetes / Docker', '7+ שנות ניסיון']));
    expect(c.score).toBeLessThan(35);
  });

  it('adds a bonus for fintech roles', () => {
    const base = classifier.classify({ title: 'בודק/ת תוכנה' }).score;
    const fintech = classifier.classify({ title: 'בודק/ת תוכנה למערכות בנקאיות' }).score;
    expect(fintech).toBeGreaterThan(base);
  });
});
