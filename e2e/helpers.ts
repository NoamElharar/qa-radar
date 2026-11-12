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
    // A control may look small and still have a larger tap area (the `tap-44` ::before in index.css).
    const tapArea = (el: Element) => {
      const r = el.getBoundingClientRect();
      const before = getComputedStyle(el, '::before');
      const grown = before.content !== 'none' && before.position === 'absolute';
      return {
        width: Math.max(r.width, grown ? parseFloat(before.width) || 0 : 0),
        height: Math.max(r.height, grown ? parseFloat(before.height) || 0 : 0),
      };
    };
    const tooSmall = [...targets]
      .filter(visible)
      .filter((el) => {
        const r = tapArea(el);
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

/**
 * Visible text under the WCAG AA contrast minimum against what is really behind it (4.5:1, or 3:1
 * from 24px / 18.66px bold). Disabled controls are exempt. Colors are read through a canvas, which
 * turns any CSS color (Tailwind's oklch included) into sRGB.
 */
export function lowContrastText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (color: string): number[] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    };
    const over = (top: number[], below: number[]) => [0, 1, 2].map((i) => top[i]! * top[3]! + below[i]! * (1 - top[3]!)).concat(1);
    const luminance = (c: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
    };
    const backgroundOf = (el: Element) => {
      const layers: number[][] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3]! > 0) layers.push(c);
        if (c[3] === 1) break;
      }
      const base = rgba(getComputedStyle(document.documentElement).backgroundColor);
      return layers.reverse().reduce((acc, c) => over(c, acc), base);
    };
    const opacityOf = (el: Element) => {
      let o = 1;
      for (let e: Element | null = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
      return o;
    };

    const failures: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.closest('.sr-only, [disabled], [aria-disabled="true"]')) continue;
      if (![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden') continue;
      const bg = backgroundOf(el);
      const fg = rgba(style.color);
      const text = over([fg[0]!, fg[1]!, fg[2]!, fg[3]! * opacityOf(el)], bg);
      const [hi, lo] = [luminance(text), luminance(bg)].sort((a, b) => b - a);
      const ratio = (hi! + 0.05) / (lo! + 0.05);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && parseInt(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) {
        failures.push(`${ratio.toFixed(2)}:1 "${el.textContent!.trim().slice(0, 30)}" (${style.color})`);
      }
    }
    return [...new Set(failures)];
  });
}
