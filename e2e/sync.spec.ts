import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { auditLayout, lowContrastText } from './helpers.ts';

/**
 * "סנכרון בין מכשירים" with two devices (two browser contexts, each with its own storage) and a
 * stand-in cloud kept here in the test runner. The app sees it through `window.__qaRadarSyncBackend`,
 * the hook the real Firebase backend is swapped out by — so this runs the real engine and UI, minus
 * Google's sign-in window (we can't sign in to a Google account in a test).
 */
interface Item {
  key: string;
  value: unknown;
  changedAt: string;
}

class Cloud {
  docs = new Map<string, Item>();
  private pages = new Set<Page>();

  async connect(context: BrowserContext): Promise<Page> {
    await context.exposeFunction('cloudAll', () => [...this.docs.values()]);
    await context.exposeFunction('cloudWrite', (items: Item[]) => {
      for (const item of items) this.docs.set(item.key, item);
      // Every open page hears about it, like a live Firestore listener (not awaited: the writer
      // may still be waiting for this call to return).
      for (const page of this.pages)
        void page.evaluate((changes) => window.cloudPush?.(changes), items).catch(() => {});
    });
    await context.addInitScript(installFakeBackend);
    const page = await context.newPage();
    this.pages.add(page);
    page.on('close', () => this.pages.delete(page));
    return page;
  }
}

declare global {
  interface Window {
    cloudAll(): Promise<Item[]>;
    cloudWrite(items: Item[]): Promise<void>;
    cloudPush?: (changes: Item[]) => void;
  }
}

/** Runs in the page before the app. Sign-in is remembered across reloads, as Firebase's is. */
function installFakeBackend() {
  type Snapshot = {
    all: () => Item[];
    changes: Item[];
    fromCache: boolean;
    pendingWrites: boolean;
  };
  let user = JSON.parse(localStorage.getItem('test:user') ?? 'null') as {
    uid: string;
    email: string;
  } | null;
  const userCallbacks = new Set<(u: typeof user) => void>();
  const listeners = new Set<(s: Snapshot) => void>();
  const setUser = (next: typeof user) => {
    user = next;
    if (next) localStorage.setItem('test:user', JSON.stringify(next));
    else localStorage.removeItem('test:user');
    for (const cb of userCallbacks) cb(next);
  };
  window.cloudPush = (changes) => {
    for (const l of listeners)
      l({ all: () => [], changes, fromCache: false, pendingWrites: false });
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__qaRadarSyncBackend = {
    onUser(cb: (u: typeof user) => void) {
      userCallbacks.add(cb);
      setTimeout(() => cb(user));
      return () => userCallbacks.delete(cb);
    },
    signIn: async () => setUser({ uid: 'u1', email: 'me@example.com' }),
    signOut: async () => setUser(null),
    listen(_uid: string, onNext: (s: Snapshot) => void) {
      listeners.add(onNext);
      void window
        .cloudAll()
        .then((all) =>
          onNext({ all: () => all, changes: all, fromCache: false, pendingWrites: false }),
        );
      return () => listeners.delete(onNext);
    },
    write: (_uid: string, items: Item[]) => window.cloudWrite(items),
  };
}

const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
const application = (title: string, daysAgo: number) => ({
  status: 'applied',
  appliedAt: day(daysAgo),
  updatedAt: day(daysAgo),
  manual: true,
  snapshot: { title, company: 'אקמה', url: '' },
});

async function seed(page: Page, statuses: Record<string, unknown>) {
  await page.addInitScript((value) => {
    if (!localStorage.getItem('qa-radar:statuses'))
      localStorage.setItem('qa-radar:statuses', value);
  }, JSON.stringify(statuses));
}

/** The second device: a desktop browser next to the project's own (an iPhone or a desktop). */
const desktop = (browser: Browser) =>
  browser.newContext({
    baseURL: 'http://localhost:4173/',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    viewport: { width: 1440, height: 900 },
  });

const card = (page: Page) => page.locator('section#sync');
const status = (page: Page) => card(page).getByRole('status');
const titles = (page: Page) => page.locator('main li bdi[dir]').allInnerTexts();

test('two devices share "שלי": first link merges both ways, later changes arrive live', async ({
  context,
  browser,
}) => {
  const cloud = new Cloud();
  const phone = await cloud.connect(context);
  const pcContext = await desktop(browser);
  const pc = await cloud.connect(pcContext);
  await seed(phone, {
    'manual:a': application('Alpha QA', 1),
    'manual:b': application('Bravo QA', 2),
  });
  await seed(pc, { 'manual:c': application('Charlie QA', 3) });

  for (const p of [phone, pc]) await p.goto('./?view=mine');
  await expect(status(phone)).toHaveText(/לא מחובר/);

  // The phone links first: its two applications go up.
  await card(phone).getByRole('button', { name: 'התחברות עם Google' }).click();
  await expect(status(phone)).toHaveText(/מסונכרן · me@example.com/);
  expect([...cloud.docs.keys()].sort()).toEqual(['s:manual:a', 's:manual:b']);
  // The backup notes now say the data is also in the cloud.
  await expect(phone.getByText('נשמרים בדפדפן הזה ובענן', { exact: false })).toBeAttached();

  // The PC links: it gets the phone's two, and the phone gets the PC's one — without reloading.
  await card(pc).getByRole('button', { name: 'התחברות עם Google' }).click();
  await expect
    .poll(() => titles(pc).then((t) => t.sort()))
    .toEqual(['Alpha QA', 'Bravo QA', 'Charlie QA']);
  await expect
    .poll(() => titles(phone).then((t) => t.sort()))
    .toEqual(['Alpha QA', 'Bravo QA', 'Charlie QA']);

  // A status changed on the PC shows on the phone.
  await pc.getByRole('button', { name: /^Bravo QA/ }).click();
  await pc
    .getByRole('radiogroup', { name: 'סטטוס' })
    .getByRole('radio', { name: /שיחה ממגייסת/ })
    .click();
  await expect
    .poll(() =>
      phone.evaluate(
        () => JSON.parse(localStorage.getItem('qa-radar:statuses')!)['manual:b'].status,
      ),
    )
    .toBe('recruiter_call');

  // Deleting on the phone deletes on the PC.
  await phone.getByRole('button', { name: /^Alpha QA/ }).click();
  phone.once('dialog', (d) => void d.accept());
  await phone.getByRole('button', { name: 'הסר מהרשימה' }).click();
  await expect.poll(() => titles(pc).then((t) => t.sort())).toEqual(['Bravo QA', 'Charlie QA']);
  expect(cloud.docs.get('s:manual:a')?.value).toBeNull();

  // A reload reconnects on its own, and disconnecting keeps this device's data.
  await pc.reload();
  await expect(status(pc)).toHaveText(/מסונכרן/);
  await card(pc).getByRole('button', { name: 'ניתוק המכשיר הזה' }).click();
  await expect(status(pc)).toHaveText(/לא מחובר/);
  await expect.poll(() => titles(pc).then((t) => t.sort())).toEqual(['Bravo QA', 'Charlie QA']);
  await pcContext.close();
});

test('the sync card fits the screen and reads well in both themes', async ({ page }) => {
  await page.addInitScript(installFakeBackend);
  await page.exposeFunction('cloudAll', () => []);
  await page.exposeFunction('cloudWrite', () => {});
  for (const colorScheme of ['light', 'dark'] as const) {
    // Theme first, then load: measuring mid-transition between themes would be meaningless.
    await page.emulateMedia({ colorScheme });
    await page.goto('./?view=mine');
    await card(page).scrollIntoViewIfNeeded();
    for (const signedIn of [false, true]) {
      if (signedIn) await card(page).getByRole('button', { name: 'התחברות עם Google' }).click();
      await expect(status(page)).toHaveText(signedIn ? /מסונכרן/ : /לא מחובר/);
      const audit = await auditLayout(page);
      expect(audit.overflowX).toBe(0);
      expect(audit.tooSmall.filter((t) => t.includes('Google') || t.includes('ניתוק'))).toEqual([]);
      expect(await lowContrastText(page)).toEqual([]);
      if (signedIn) await card(page).getByRole('button', { name: 'ניתוק המכשיר הזה' }).click();
    }
  }
  // Keyboard: the sign-in button is reachable and works with Enter.
  await card(page).getByRole('button', { name: 'התחברות עם Google' }).focus();
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText(/מסונכרן/);
});
