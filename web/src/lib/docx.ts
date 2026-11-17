/**
 * The text of a Word (.docx) file, for "התאמה לפי קורות החיים". Its own module so the unzip library
 * loads only when someone actually analyzes a Word file.
 */
import { strFromU8, unzipSync } from 'fflate';
import { CvReadError } from './cv-errors.ts';

/** The main document's text, one line per paragraph. */
export function docxText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
  } catch {
    throw new CvReadError('לא הצלחתי לפתוח את קובץ ה-Word.');
  }
  const xml = files['word/document.xml'];
  if (!xml) throw new CvReadError('זה לא נראה כמו קובץ Word (‎.docx‎).');
  return wordXmlText(strFromU8(xml));
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Paragraph texts out of WordprocessingML (`<w:p>` paragraphs of `<w:t>` runs, tabs and breaks as spaces). */
export function wordXmlText(xml: string): string {
  return xml
    .split('</w:p>')
    .map((paragraph) =>
      [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(?:tab|br)\s*\/>/g)]
        .map((m) => m[1] ?? ' ')
        .join(''),
    )
    .map((p) =>
      p.replace(
        /&(?:#(\d+)|#x([0-9a-f]+)|(\w+));/gi,
        (all, dec: string, hex: string, name: string) =>
          dec
            ? String.fromCodePoint(Number(dec))
            : hex
              ? String.fromCodePoint(parseInt(hex, 16))
              : (XML_ENTITIES[name] ?? all),
      ),
    )
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n');
}
