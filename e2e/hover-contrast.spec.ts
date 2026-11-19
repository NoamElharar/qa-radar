import { expect, test } from '@playwright/test';
import { lowContrastText } from './helpers.ts';

/**
 * Hover styles are easy to miss in dark mode (a light hover background under light text). Hover every
 * link and button on every view, in both themes, and check that all text stays readable.
 */
for (const colorScheme of ['dark', 'light'] as const) {
  test(`links and buttons stay readable on hover — ${colorScheme} mode`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'touch screens have no hover');
    await page.emulateMedia({ colorScheme });
    for (const view of ['./', './?view=all', './?view=mine', './?view=stats', './?view=sources']) {
      await page.goto(view);
      await page.waitForLoadState('networkidle');
      const targets = page.locator('main a[href], main button');
      const count = await targets.count();
      for (let i = 0; i < count; i++) {
        const target = targets.nth(i);
        if (!(await target.isVisible())) continue;
        await target.hover();
        const label =
          (await target.innerText()).trim().slice(0, 40) ||
          (await target.getAttribute('aria-label'));
        expect(await lowContrastText(page), `hovering "${label}" on ${view}`).toEqual([]);
      }
    }
  });
}
