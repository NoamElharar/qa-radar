import type { JobStatus } from '../../lib/storage.ts';

/** Small identity dot for a status. Always rendered next to the status label — never color alone. */
export function StatusDot({ status, className = '' }: { status: JobStatus; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2.5 shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: `var(--st-${status})` }}
    />
  );
}
