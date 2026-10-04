import type { SourceHealth } from '@qa-radar/shared';
import type { SourceConfig } from './config.ts';
import { israelParts } from './pipeline/dates.ts';

/**
 * The GitHub Actions cron fires every hour (UTC). This gate decides in Israel local time, so DST
 * changes need no cron edits:
 *  - Sunday–Thursday 07:00–21:59 → run every hour;
 *  - otherwise (nights, Friday, Saturday) → run every 3 hours (00, 03, 06, … local).
 */
export function shouldRunAt(date: Date): { run: boolean; reason: string } {
  const { weekday, hour } = israelParts(date);
  const workday = weekday >= 0 && weekday <= 4;
  if (workday && hour >= 7 && hour <= 21) return { run: true, reason: 'workday hours (hourly)' };
  if (hour % 3 === 0) return { run: true, reason: 'off-hours 3-hour slot' };
  return { run: false, reason: `off-hours, next 3-hour slot at ${String(hour + (3 - (hour % 3))).padStart(2, '0')}:00` };
}

/** Cron jobs drift by several minutes, so allow some slack when checking `everyHours`. */
const SLACK_MS = 20 * 60 * 1000;

export function isSourceDue(source: SourceConfig, health: SourceHealth | undefined, now: Date): boolean {
  if (!health?.lastRunAt) return true;
  return now.getTime() - Date.parse(health.lastRunAt) >= source.everyHours * 3600000 - SLACK_MS;
}
