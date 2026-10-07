import type { Page } from '@playwright/test';

export interface LayoutAudit {
  /** Pixels the page can scroll sideways (should be 0). */
  overflowX: number;
  /** Visible elements that stick out of the viewport sideways. */
  offscreen: string[];
  /** Tap targets smaller than 24×24 CSS px — the WCAG 2.2 AA minimum (2.5.8). */
  tooSmall: string[];
  /** Text fields under 16px: iOS Safari zooms into them on focus. */
  smallFields: string[];
}

/** Inspect the current page for the layout problems that bite on phones. */
export function auditLayout(page: Page): Promise<LayoutAudit> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden';
    };
    const describe = (el: Element) => {
      const r = el.getBoundingClientRect();
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? (el as HTMLInputElement).placeholder ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 40);
      return `${el.tagName.toLowerCase()} "${name}" ${Math.round(r.width)}×${Math.round(r.height)}`;
    };
    // Elements inside horizontal scrollers (chip rows) may extend past the edge by design.
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll') return true;
      }
      return false;
    };

    const offscreen = [...document.querySelectorAll('body *')]
      .filter((el) => visible(el) && !inScroller(el))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > vw + 1 || r.left < -1;
      })
      .map(describe);

    const targets = document.querySelectorAll(
      'button, a[href], select, textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])',
    );
    const tooSmall = [...targets]
      .filter(visible)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width < 24 || r.height < 24;
      })
      .map(describe);

    const smallFields = [...document.querySelectorAll('input, select, textarea')]
      .filter((el) => visible(el) && !['checkbox', 'radio', 'range', 'hidden'].includes((el as HTMLInputElement).type))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${describe(el)} ${getComputedStyle(el).fontSize}`);

    return {
      overflowX: document.documentElement.scrollWidth - vw,
      offscreen: offscreen.slice(0, 10),
      tooSmall,
      smallFields,
    };
  });
}
