import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/** Grow to fit the text (from `minRows` up to `maxRows` lines, then scroll). */
function fit(el: HTMLTextAreaElement, minRows: number, maxRows: number) {
  const style = getComputedStyle(el);
  const line = parseFloat(style.lineHeight) || 24;
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  el.style.height = 'auto';
  // scrollHeight covers text + padding; the height we set (border-box) also has to hold the borders.
  const needed = el.scrollHeight + borders;
  const min = minRows * line + padding + borders;
  const max = maxRows * line + padding + borders;
  const height = Math.min(Math.max(needed, min), max);
  el.style.height = `${height}px`;
  el.style.overflowY = needed > height + 1 ? 'auto' : 'hidden';
}

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxRows?: number };

/**
 * A comfortable notes box: full width, sized to show everything written (no tiny scroll window),
 * line breaks kept, and `dir="auto"` so a note that starts in English or mixes "מNESS" reads right.
 */
export function NotesField({ minRows = 3, maxRows = 14, className = '', onInput, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (ref.current) fit(ref.current, minRows, maxRows);
  }, [minRows, maxRows, props.value]);
  return (
    <textarea
      ref={ref}
      dir="auto"
      rows={minRows}
      onInput={(e) => {
        fit(e.currentTarget, minRows, maxRows);
        onInput?.(e);
      }}
      className={`block w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 leading-relaxed whitespace-pre-wrap dark:border-slate-700 dark:bg-slate-900 ${className}`}
      {...props}
    />
  );
}
