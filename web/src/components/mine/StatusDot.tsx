import { LEGACY_STATUSES, type JobStatus } from '../../lib/storage.ts';

/**
 * Small identity dot for a status. Always rendered next to the status label — never color alone.
 * Legacy statuses (the unsorted "ראיון") are a ring instead of a filled dot.
 */
export function StatusDot({ status, className = '' }: { status: JobStatus; className?: string }) {
  const color = `var(--st-${status})`;
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2.5 shrink-0 rounded-full ${className}`}
      style={LEGACY_STATUSES.has(status) ? { border: `2px solid ${color}` } : { backgroundColor: color }}
    />
  );
}
