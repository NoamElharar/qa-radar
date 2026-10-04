import type { SourceConfig } from '../config.ts';
import type { RawJob } from '../adapters/types.ts';
import type { Classifier, QaDecision } from './classify.ts';
import { parseSourceDate } from './dates.ts';
import { canonicalUrl, shortHash } from './ids.ts';
import { cleanText, htmlToText, snippetOf } from './text.ts';
import type { Job } from '@qa-radar/shared';

/** A classified job before freshness/state fields are attached. */
export type JobCandidate = Omit<
  Job,
  'firstSeenAt' | 'lastSeenAt' | 'missingStreak' | 'state' | 'closedAt' | 'reappearedAt' | 'baseline'
>;

export interface NormalizeResult {
  kept: JobCandidate[];
  /** Every QA decision with its reason — handy when tuning config/taxonomy.yaml. */
  decisions: Array<{ title: string; decision: QaDecision }>;
  droppedForeign: number;
}

const END_CLIENT =
  /(?:^|\s)(?:ל|ב|עבור\s+)((?:חברת|חברה|ארגון|משרד|בנק|סטארט-?אפ|סטארטאפ|גוף|רשות|קבוצת|מוסד)\s[^,.|()–\n]{2,60})/;
const END_CLIENT_STOP =
  /\s+(?:(?:באזור|במרכז|בצפון|בדרום|בשפלה|בשרון|בירושלים|בתל|בפתח|בחיפה|ברמת|בראשון|בהרצליה|היושב|היושבת|שיושב|הממוקם|הממוקמת)(?:\s|$)|(?:דרוש|מגייס|מחפש)\S*).*$/;

/** "דרוש/ה QA לחברה פיננסית באזור המרכז" → "חברה פיננסית". */
export function extractEndClient(title: string): string | undefined {
  const m = END_CLIENT.exec(title);
  if (!m?.[1]) return undefined;
  const phrase = m[1].replace(END_CLIENT_STOP, '').trim();
  const words = phrase.split(/\s+/).slice(0, 6).join(' ');
  return words.length >= 4 ? words : undefined;
}

const ISRAEL = new Set(['il', 'isr', 'israel', 'ישראל']);

export function normalizeJobs(
  raw: RawJob[],
  source: SourceConfig,
  classifier: Classifier,
  now: Date,
): NormalizeResult {
  const kept = new Map<string, JobCandidate>();
  const decisions: NormalizeResult['decisions'] = [];
  let droppedForeign = 0;

  for (const r of raw) {
    // Titles from WordPress & co. arrive HTML-encoded ("Manual &amp; QA", "&#8211;").
    const title = htmlToText(r.title ?? '').replace(/\s+/g, ' ');
    if (!title) continue;
    if (r.country && !ISRAEL.has(r.country.trim().toLowerCase())) {
      droppedForeign++;
      continue;
    }
    const description = r.description ? htmlToText(r.description) : undefined;
    const decision = classifier.decideQa(title, description, source.categoryQa);
    decisions.push({ title, decision });
    if (!decision.qa) continue;

    const url = r.url ?? source.homepage;
    const sourceJobId = r.sourceJobId?.trim() || undefined;
    // Without a native id: hash the URL when it is job-specific, otherwise hash the title.
    const fallbackKey = r.url && canonicalUrl(r.url) !== canonicalUrl(source.homepage) ? canonicalUrl(r.url) : title;
    const id = `${source.id}:${sourceJobId ?? `h-${shortHash(fallbackKey)}`}`;
    if (kept.has(id)) continue;

    const location = r.location ? cleanText(r.location).replace(/\s+/g, ' ') : undefined;
    const classification = classifier.classify({ title, description, location });
    const isAgency = source.type === 'agency';

    kept.set(id, {
      id,
      sourceId: source.id,
      sourceJobId,
      url,
      title,
      company: isAgency ? undefined : (r.company ?? source.company ?? source.name),
      agency: isAgency ? source.name : undefined,
      endClient: isAgency ? (r.endClient ?? r.company ?? extractEndClient(title)) : undefined,
      locationText: location || undefined,
      snippet: snippetOf(description),
      postedAt: parseSourceDate(r.postedAt, now),
      ...classification,
    });
  }
  return { kept: [...kept.values()], decisions, droppedForeign };
}
