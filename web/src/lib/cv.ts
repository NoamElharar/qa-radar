/**
 * "התאמה לפי קורות החיים": read a CV in the browser, find the skills the radar knows in it, and score
 * jobs against them. The file never leaves the browser and its text is never stored — only the list of
 * skill names (see CvProfile in storage.ts).
 */
import {
  compileTerms,
  normalizeText,
  scoreJob,
  type Job,
  type ScoreProfile,
  type ScoringConfig,
  type SkillDef,
  type SourceHealth,
} from '@qa-radar/shared';
import { CvReadError } from './cv-errors.ts';

export { CvReadError };

export const MAX_CV_BYTES = 10 * 1024 * 1024;
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const CV_ACCEPT = `.pdf,application/pdf,.docx,${DOCX_TYPE},.txt,text/plain`;

/** The CV's text, one line per line of the document. PDF and Word readers load only when needed. */
export async function readCvFile(file: File): Promise<string> {
  if (file.size > MAX_CV_BYTES) throw new CvReadError('הקובץ גדול מדי (מעל 10MB).');
  const name = file.name.toLowerCase();
  let text: string;
  if (name.endsWith('.pdf') || file.type === 'application/pdf')
    text = await pdfText(await file.arrayBuffer());
  else if (name.endsWith('.docx') || file.type === DOCX_TYPE) {
    const [{ docxText }, bytes] = await Promise.all([import('./docx.ts'), file.arrayBuffer()]);
    text = docxText(new Uint8Array(bytes));
  } else if (name.endsWith('.txt') || file.type === 'text/plain') text = await file.text();
  else if (name.endsWith('.doc'))
    throw new CvReadError('קובץ Word ישן (‎.doc‎) לא נתמך. שמור/י אותו כ-‎.docx‎ או כ-PDF.');
  else throw new CvReadError('אפשר להעלות PDF, Word (‎.docx‎) או קובץ טקסט.');
  if (!text.trim()) {
    throw new CvReadError(
      'לא נמצא טקסט בקובץ. ייתכן שזה PDF סרוק (תמונה) — נסה/י קובץ Word, או הדבק/י את הטקסט.',
    );
  }
  return text;
}

async function pdfText(data: ArrayBuffer): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  // pdf.js 6 never evaluates code from a file, so a PDF can only be read, not run.
  const task = pdfjs.getDocument({ data: new Uint8Array(data) });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    void task.destroy();
    throw new CvReadError('לא הצלחתי לפתוח את קובץ ה-PDF.');
  }
  const lines: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      let line: string[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line.push(item.str);
        if (item.hasEOL) {
          lines.push(line.join(' '));
          line = [];
        }
      }
      if (line.length) lines.push(line.join(' '));
    }
  } finally {
    void task.destroy();
  }
  return lines.join('\n');
}

/** Lines with an e-mail, a link or a phone number: "Mobile: 054-…" there is a phone, not a skill. */
const CONTACT_LINE = /@|https?:\/\/|www\.|(?:\+?972|0)[\s-]?\d{1,2}[\s-]?\d{3}[\s-]?\d{4}/;
const HEBREW = /[א-ת]/;

/**
 * Some PDFs store Hebrew in visual order, so a reader gets "הנכות קדוב" for "בודק תוכנה". Undo it:
 * reverse the line's words and each Hebrew word's letters. (Applied as a second reading, never instead.)
 */
export function mirrorHebrew(line: string): string {
  if (!HEBREW.test(line)) return line;
  return line
    .split(/\s+/)
    .reverse()
    .map((w) => (HEBREW.test(w) ? [...w].reverse().join('') : w))
    .join(' ');
}

/** The labels of the known skills a CV mentions, in the catalog's order. */
export function findSkills(text: string, skills: readonly SkillDef[]): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !CONTACT_LINE.test(l));
  const asRead = normalizeText(lines.join('\n'));
  const mirrored = normalizeText(lines.map(mirrorHebrew).join('\n'));
  return skills
    .filter((s) => {
      const matcher = compileTerms(s.terms);
      return matcher.test(asRead) || matcher.test(mirrored);
    })
    .map((s) => s.label);
}

/** The skills and experience a CV gives the score. */
export interface CvSkills {
  skills: readonly string[];
  yearsExperience: number;
}

export function cvProfile(scoring: ScoringConfig, cv: CvSkills): ScoreProfile {
  return {
    have: new Set(cv.skills),
    yearsExperience: cv.yearsExperience,
    bonusTags: scoring.bonusTags,
  };
}

/** Jobs re-scored against a CV. Jobs collected before `requires` existed keep their stored score. */
export function rescoreJobs(jobs: readonly Job[], scoring: ScoringConfig, cv: CvSkills): Job[] {
  const profile = cvProfile(scoring, cv);
  return jobs.map((job) =>
    job.requires
      ? {
          ...job,
          ...scoreJob(
            {
              requires: job.requires,
              tags: job.tags,
              seniority: job.seniority,
              yearsRequired: job.yearsRequired,
            },
            profile,
          ),
        }
      : job,
  );
}

/**
 * Watch-mode sources with their jobs' scores re-computed against a CV (what "התאמה עד …" shows).
 * Entries saved before the collector kept their skills keep their stored score.
 */
export function rescoreWatched(
  sources: readonly SourceHealth[],
  scoring: ScoringConfig,
  cv: CvSkills,
): SourceHealth[] {
  const profile = cvProfile(scoring, cv);
  return sources.map((source) =>
    source.watch?.some((w) => w.requires)
      ? {
          ...source,
          watch: source.watch.map((w) =>
            w.requires
              ? {
                  ...w,
                  score: scoreJob(
                    {
                      requires: w.requires,
                      tags: w.tags ?? [],
                      seniority: w.seniority ?? 'unknown',
                      yearsRequired: w.yearsRequired,
                    },
                    profile,
                  ).score,
                }
              : w,
          ),
        }
      : source,
  );
}

/** A score from here up is a strong match (the job card's ring turns green). */
export const STRONG_MATCH = 70;

export interface MatchSummary {
  /** Open jobs that can be re-scored. */
  jobs: number;
  average: number;
  strong: number;
}

const scorable = (jobs: readonly Job[]) => jobs.filter((j) => j.state === 'active' && j.requires);

/** How open jobs score for one set of skills: the average and how many are strong matches. */
export function matchSummary(jobs: readonly Job[], profile: ScoreProfile): MatchSummary {
  const open = scorable(jobs);
  const scores = open.map(
    (j) =>
      scoreJob(
        {
          requires: j.requires!,
          tags: j.tags,
          seniority: j.seniority,
          yearsRequired: j.yearsRequired,
        },
        profile,
      ).score,
  );
  return {
    jobs: open.length,
    average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    strong: scores.filter((s) => s >= STRONG_MATCH).length,
  };
}

export interface MissingSkill {
  label: string;
  /** Open jobs asking for it. */
  count: number;
  /** Their share of the open jobs that can be re-scored, in whole percent. */
  share: number;
}

/** The skills open jobs ask for most that these skills don't include — what to check the CV for. */
export function missingSkills(
  jobs: readonly Job[],
  have: ReadonlySet<string>,
  top = 5,
): MissingSkill[] {
  const open = scorable(jobs);
  const counts = new Map<string, number>();
  for (const job of open) {
    for (const label of job.requires!)
      if (!have.has(label)) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, top)
    .map(([label, count]) => ({ label, count, share: Math.round((count / open.length) * 100) }));
}
