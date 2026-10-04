import * as cheerio from 'cheerio';

const BLOCK_TAGS = 'p, div, li, br, h1, h2, h3, h4, h5, h6, tr, section, article, ul, ol';

/** Convert an HTML fragment to readable plain text (keeps line breaks between blocks). */
export function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return cleanText(html);
  const $ = cheerio.load(`<div id="__root">${html}</div>`);
  $('script, style, noscript, svg').remove();
  $(BLOCK_TAGS).each((_, el) => {
    $(el).before('\n');
    $(el).after('\n');
  });
  return cleanText($('#__root').text());
}

/** Trim, collapse spaces, keep at most one blank line. */
export function cleanText(text: string): string {
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Short excerpt for cards and search: single line, cut on a word boundary. */
export function snippetOf(text: string | undefined, max = 600): string | undefined {
  if (!text) return undefined;
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat || undefined;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.7 ? lastSpace : max)}…`;
}
