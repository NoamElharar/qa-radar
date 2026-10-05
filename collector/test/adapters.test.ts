import { describe, expect, it } from 'vitest';
import { parseAbraItems } from '../src/adapters/abra.ts';
import { parseAdamtotalPage } from '../src/adapters/adamtotal.ts';
import { mapComeet } from '../src/adapters/comeet.ts';
import { getPath, parseEmbeddedJson } from '../src/adapters/embedded-json.ts';
import { htmlAdapter, htmlOptionsSchema, parseHtmlJobs } from '../src/adapters/html.ts';
import type { SourceConfig } from '../src/config.ts';
import type { PoliteClient } from '../src/http.ts';
import { collectElalBanners, mapMax, mapNess } from '../src/adapters/json-sites.ts';
import { parseRss } from '../src/adapters/rss.ts';
import { parseOzCards, wpmlAjaxAdapter } from '../src/adapters/wpml-ajax.ts';
import { mapWpPosts } from '../src/adapters/wp-rest.ts';
import { extractEndClient } from '../src/pipeline/normalize.ts';

// TEST FIXTURES: small synthetic snippets that mirror each site's real markup (structure copied,
// content invented). No real personal data. Real-page fixtures are planned for Phase 2.

describe('html adapter (selector-driven)', () => {
  it('parses SQLink-style boxes: id from attribute, link, description from several blocks', () => {
    const html = `
      <div id="22074" class="boxInput"><a href="/career/db/qa/qa-digital/"><h3 class="positionTitle">לחברה פיננסית דרוש/ה QA</h3></a>
        <div class="text">דרוש/ה איש/ת QA לארגון פיננסי.</div><div class="hiddenDiv"><div class="jobText">שנת ניסיון בבדיקות Web</div></div></div>
      <div id="22075" class="boxInput"><a href="/career/db/qa/x/"><h3 class="positionTitle">QA Automation</h3></a></div>`;
    const options = htmlOptionsSchema.parse({
      url: 'https://www.sqlink.com/career/db/qa/',
      item: 'div.boxInput',
      title: 'h3.positionTitle',
      link: { selector: 'a', attr: 'href' },
      id: { selector: ':self', attr: 'id' },
      description: '.text, .jobText',
    });
    const jobs = parseHtmlJobs(html, options.url, options);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      sourceJobId: '22074',
      url: 'https://www.sqlink.com/career/db/qa/qa-digital/',
      title: 'לחברה פיננסית דרוש/ה QA',
    });
    expect(jobs[0]!.description).toContain('שנת ניסיון');
  });

  it('extracts the job URL from a share link and cleans a "label: value" location (Tesnet)', () => {
    const html = `<div class="item-wrap"><div class="item"><h3 class="title">דרוש/ה בודק/ת תוכנה</h3>
      <div class="locations"> איזור: גוש דן </div><div class="description">ניסיון בבדיקות API</div>
      <ul class="share"><li><a href="https://www.facebook.com/sharer/sharer.php?u=https://tesnet-group.com/job/%d7%91%d7%95%d7%93%d7%a7/"></a></li></ul></div></div>`;
    const options = htmlOptionsSchema.parse({
      url: 'https://tesnet-group.com/job/',
      item: 'div.item-wrap',
      title: 'h3.title',
      link: { selector: 'a[href*="sharer.php"]', attr: 'href', regex: '[?&]u=([^&]+)' },
      location: { selector: '.locations', regex: '(?:איזור|אזור)\\s*:?\\s*(.+)' },
      description: '.description',
    });
    const [job] = parseHtmlJobs(html, options.url, options);
    expect(job).toMatchObject({
      url: 'https://tesnet-group.com/job/%d7%91%d7%95%d7%93%d7%a7/',
      location: 'גוש דן',
    });
  });

  it('builds URLs from ids, strips hidden labels and skips non-job sections', () => {
    const html = `
      <div class="job_item" data-order_id="15466"><button class="archive-job_item-title">בודק/ת תוכנה</button>
        <p class="career_location"><span class="hidden_span1">מיקום</span>השרון</p></div>
      <section id="s1"><h2>מדיניות הפרטיות למועמדים</h2></section>`;
    const iec = htmlOptionsSchema.parse({
      url: 'https://careers.iec.co.il/',
      item: 'div.job_item',
      title: '.archive-job_item-title',
      id: { selector: ':self', attr: 'data-order_id' },
      urlTemplate: 'https://careers.iec.co.il/order/{id}/',
      location: { selector: '.career_location', remove: '.hidden_span1' },
    });
    expect(parseHtmlJobs(html, iec.url, iec)[0]).toMatchObject({
      sourceJobId: '15466',
      url: 'https://careers.iec.co.il/order/15466/',
      location: 'השרון',
    });
    const mataf = htmlOptionsSchema.parse({
      url: 'https://bank.test/jobs',
      item: 'section',
      title: 'h2',
      skipTitle: 'מדיניות',
    });
    expect(parseHtmlJobs(html, mataf.url, mataf)).toEqual([]);
  });

  it('reads an id from the link with a regex (Yael)', () => {
    const html = `<div class="job_item"><h3 class="job_title">בודק/ת תוכנה (QA)</h3>
      <button class="share_link" data-copy="https://yaelgroup.com/jobs/order/25685/"></button></div>`;
    const options = htmlOptionsSchema.parse({
      url: 'https://yaelgroup.com/jobs/',
      item: 'div.job_item',
      title: 'h3.job_title',
      link: { selector: 'button.share_link', attr: 'data-copy' },
      id: { from: 'link', regex: '/order/(\\d+)' },
    });
    expect(parseHtmlJobs(html, options.url, options)[0]?.sourceJobId).toBe('25685');
  });

  it('splits an article into jobs by heading (Reshet 13)', () => {
    const html = `<article><div class="text">
      <div><h2>בודק/ת תוכנה (QA)</h2></div><div><p>בדיקות ידניות למערכות דיגיטל</p></div><div><p>ניסיון של שנה</p></div>
      <div><h2>מנהל/ת פרויקטים</h2></div><div><p>ניהול פרויקטים</p></div></div></article>`;
    const options = htmlOptionsSchema.parse({
      url: 'https://13tv.test/jobs/',
      headings: 'article h2',
    });
    const jobs = parseHtmlJobs(html, options.url, options);
    expect(jobs.map((j) => j.title)).toEqual(['בודק/ת תוכנה (QA)', 'מנהל/ת פרויקטים']);
    expect(jobs[0]!.description).toBe('בדיקות ידניות למערכות דיגיטל\nניסיון של שנה');
  });

  it('rejects incomplete configs', () => {
    expect(() => htmlOptionsSchema.parse({ url: 'https://x.test/' })).toThrow();
  });

  it('reports a page with zero job items as an error (block page / layout change) unless allowEmpty', async () => {
    const source = (extra: Record<string, unknown>) =>
      ({
        id: 'x',
        options: { url: 'https://x.test/jobs', item: '.job', title: 'h3', ...extra },
      }) as unknown as SourceConfig;
    const ctx = (s: SourceConfig) => ({
      source: s,
      http: {
        text: async () => '<html><body>Access denied</body></html>',
      } as unknown as PoliteClient,
      log: () => {},
      isQaCandidate: () => true,
    });
    await expect(htmlAdapter(ctx(source({})))).rejects.toThrow(/no job items matched/);
    await expect(htmlAdapter(ctx(source({ allowEmpty: true })))).resolves.toEqual([]);
  });
});

describe('embedded JSON adapter', () => {
  it('reads __NEXT_DATA__ with array paths (Compie)', () => {
    const data = {
      props: {
        pageProps: {
          jobs: [
            {
              jobNumber: 1795,
              title: 'QA',
              published_at: '2026-08-13T13:19:42.311Z',
              uWillDo: [{ description: 'בדיקות' }, { description: 'API' }],
            },
          ],
        },
      },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
    const jobs = parseEmbeddedJson(html, {
      url: 'https://compie.test/',
      nextData: true,
      path: 'props.pageProps.jobs',
      fields: {
        id: 'jobNumber',
        title: 'title',
        postedAt: 'published_at',
        description: ['uWillDo[].description'],
      },
    });
    expect(jobs[0]).toMatchObject({ sourceJobId: '1795', title: 'QA', description: 'בדיקות\nAPI' });
  });

  it('reads a `var x = [...]` script with a regex (Noga)', () => {
    const html = `<script> var openJobs = [{"url":"https://noga.test/jobs/jb-56/","title":"QA","location":"חיפה","jobCode":"JB-56"}]; </script>`;
    const jobs = parseEmbeddedJson(html, {
      url: 'https://noga.test/jobs/',
      nextData: false,
      pattern: 'var openJobs = (\\[[\\s\\S]*?\\]);',
      fields: { id: 'jobCode', title: 'title', url: 'url', location: 'location' },
    });
    expect(jobs[0]).toMatchObject({
      sourceJobId: 'JB-56',
      url: 'https://noga.test/jobs/jb-56/',
      location: 'חיפה',
    });
  });

  it('getPath flattens arrays', () => {
    expect(getPath({ a: [{ b: 1 }, { b: 2 }] }, 'a[].b')).toEqual([1, 2]);
    expect(getPath({ a: null }, 'a.b')).toEqual([]);
  });

  it('fails loudly when the layout changes', () => {
    expect(() =>
      parseEmbeddedJson('<html></html>', {
        url: 'https://x.test/',
        nextData: true,
        fields: { title: 'title' },
      }),
    ).toThrow(/not found/);
  });
});

describe('platform mappers', () => {
  it('RSS items (WordPress feed)', () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>בודק/ת תוכנה</title><link>https://aman.test/careers/qa/x/</link>
      <pubDate>Sun, 16 Nov 2025 10:09:22 +0000</pubDate><guid>https://aman.test/?p=123</guid>
      <content:encoded><![CDATA[<p>ניסיון בבדיקות</p>]]></content:encoded></item></channel></rss>`;
    expect(parseRss(xml)[0]).toMatchObject({
      sourceJobId: '123',
      title: 'בודק/ת תוכנה',
      postedAt: 'Sun, 16 Nov 2025 10:09:22 +0000',
    });
  });

  it('Comeet positions keep the country so foreign jobs can be dropped', () => {
    const [job] = mapComeet([
      {
        uid: 'DC.A67',
        name: 'QA Automation Engineer',
        company_name: 'Commit',
        location: { city: 'Petah Tikva', country: 'IL' },
        url_comeet_hosted_page: 'https://www.comeet.com/jobs/x/DC.A67',
        details: [{ name: 'Description', value: '<p>C#</p>' }],
      },
    ]);
    expect(job).toMatchObject({
      sourceJobId: 'DC.A67',
      country: 'IL',
      location: 'Petah Tikva',
      company: 'Commit',
    });
  });

  it('WordPress REST posts', () => {
    const [job] = mapWpPosts([
      {
        id: 5753,
        date_gmt: '2026-08-26T08:45:34',
        link: 'https://masav.test/position/x/',
        title: { rendered: 'בודק תוכנה &#8211; Python' },
      },
    ]);
    expect(job).toMatchObject({ sourceJobId: '5753', postedAt: '2026-08-26T08:45:34Z' });
  });

  it('NESS items never copy recruiter contact details', () => {
    const [job] = mapNess(
      [
        {
          index: '42814',
          title: 'בודק/ת תוכנה',
          posLocation: 'אזור המרכז',
          posDescription: 'API',
          rakazEmail: 'someone@example.test',
        } as never,
      ],
      'https://ness.test/careers/',
    );
    expect(JSON.stringify(job)).not.toContain('example.test');
    expect(job).toMatchObject({ sourceJobId: '42814', url: 'https://ness.test/careers/#42814' });
  });

  it('MAX lobby pages strip tracking params', () => {
    const { jobs, isLast } = mapMax({
      result: {
        categories: [
          {
            pages: {
              isLast: true,
              pages: [
                { title: 'QA', linkUrl: 'https://www.max.co.il/jobs/pages/qa?SourceGA=jobs-lobby' },
              ],
            },
          },
        ],
      },
    });
    expect(isLast).toBe(true);
    expect(jobs[0]).toMatchObject({
      url: 'https://www.max.co.il/jobs/pages/qa',
      sourceJobId: 'qa',
    });
  });

  it('El Al banners are collected from nested categories', () => {
    const data = {
      children: [
        {
          data: {
            banners: [{ title: 'נציג/ת', link: { url: 'https://campaign.adamtotal.co.il?d=1' } }],
          },
        },
        {
          data: {
            banners: [{ title: 'Tech', link: { url: 'https://campaign.adamtotal.co.il?d=2' } }],
          },
        },
      ],
    };
    expect(collectElalBanners(data).map((b) => b.title)).toEqual(['נציג/ת', 'Tech']);
  });

  it('adamtotal job cards', () => {
    const html = `<article class="job-card" data-job-id="198801" data-job-title="QA Engineer &amp; Production Support">
      <div class="job-meta"><span>מס' משרה: 198801</span><span>גוש דן | </span></div><p class="job-snippet">בודק/ת תוכנה</p>
      <a class="btn-details job-detail-link" href="/Jobs/JobDetails?token=abc"></a></article>`;
    expect(
      parseAdamtotalPage(html, 'https://career.adamtotal.co.il/Home/Index?token=t')[0],
    ).toMatchObject({
      sourceJobId: '198801',
      title: 'QA Engineer & Production Support',
      location: 'גוש דן',
      url: 'https://career.adamtotal.co.il/Jobs/JobDetails?token=abc',
    });
  });

  it('Abra career items', () => {
    const html = `<div class="career__our-careers-item"><div class="career__our-careers-item-body"><p class="subtitle">Automation &amp; QA</p>
      <a href="https://www.abra-it.com/career/rd/embedded-qa-engineer/" class="title">Embedded QA Engineer</a>
      <ul class="tags"><li><span>Haifa</span></li><li><span>On-site, Full-time</span></li></ul></div></div>`;
    expect(parseAbraItems(html)[0]).toMatchObject({
      title: 'Embedded QA Engineer',
      location: 'Haifa',
    });
  });
});

describe('extractEndClient', () => {
  it.each([
    ['לחברה פיננסית דרוש/ה QA לצוות דיגיטל', 'חברה פיננסית'],
    ['דרוש/ה מהנדס/ת עומסים לארגון פיננסי', 'ארגון פיננסי'],
    ['QA לגוף ממשלתי היושב בירושלים', 'גוף ממשלתי'],
    ['לחברה מובילה במרכז בתחום האבטחה דרוש/ה QA Engineer', 'חברה מובילה'],
    ['Low Level Automation Lead בחברת סטארט-אפ בתחום הסייבר', 'חברת סטארט-אפ בתחום הסייבר'],
    ['QA Engineer', undefined],
  ])('%s → %s', (title, expected) => {
    expect(extractEndClient(title)).toBe(expected);
  });
});

describe('OZ Software (WPML admin-ajax)', () => {
  // Synthetic fragment mirroring the real card markup: categories ride on the CSS classes.
  const card = (id: string, title: string, loc: string, classes: string) =>
    `<div class="col-md-6 career-teaser float-start ${classes}"><div class="wrapper"><div class="item-header">
      <a href="https://oz.test/he/career/jb-${id}/"><h2>${title}</h2><div class="location">${loc}</div></a></div>
      <div class="item-body"><div class="excerpt">תיאור קצר</div></div></div></div>`;
  const fragment = [
    card('239', 'בודק/ת QA ואוטומציה', 'תל אביב', 'software-qa automation תל_אביב'),
    card('148%e2%80%8e', 'מפתח/ת אוטומציה מנוסה', 'פתח תקווה', 'automation software-qa פתח_תקווה'),
    card('77', 'מפתח/ת Java', 'לוד', 'java backend-development לוד'),
  ].join('');

  it('parses cards: id from the link, location, and categories as description words', () => {
    const jobs = parseOzCards(fragment);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      sourceJobId: '239',
      title: 'בודק/ת QA ואוטומציה',
      location: 'תל אביב',
      url: 'https://oz.test/he/career/jb-239/',
    });
    expect(jobs[0]!.description).toContain('software qa');
    expect(jobs[1]).toMatchObject({ sourceJobId: '148' }); // the invisible direction mark in the URL is ignored
  });

  const run = (payload: unknown, seen: { url?: string; cookie?: string } = {}) =>
    wpmlAjaxAdapter({
      source: {
        id: 'oz',
        options: { ajaxUrl: 'https://oz.test/wp-admin/admin-ajax.php', pageId: 3090 },
      } as unknown as SourceConfig,
      http: {
        json: async (url: string, init?: { headers?: Record<string, string> }) => {
          seen.url = url;
          seen.cookie = init?.headers?.cookie;
          return payload;
        },
      } as unknown as PoliteClient,
      log: () => {},
      isQaCandidate: () => true,
    });

  it('asks for everything in one request, with the Hebrew WPML cookie', async () => {
    const seen: { url?: string; cookie?: string } = {};
    const jobs = await run({ success: true, loaded_posts: fragment, total_count: 3 }, seen);
    expect(jobs).toHaveLength(3);
    expect(seen.cookie).toBe('wp-wpml_current_language=he');
    expect(seen.url).toContain('action=ozs_load_more_posts');
    expect(seen.url).toContain('page_id=3090');
    expect(seen.url).toContain('displaying=0');
  });

  it('fails loudly when the endpoint refuses, the markup changes, or nothing comes back', async () => {
    await expect(run({ success: false })).rejects.toThrow(/success=false/);
    await expect(run({ success: true, loaded_posts: fragment, total_count: 66 })).rejects.toThrow(
      /parsed 3 of 66/,
    );
    await expect(run({ success: true, loaded_posts: '<div></div>' })).rejects.toThrow(/no jobs/);
  });
});
