import type { RegionId, Seniority, SourceType } from './types.ts';

/** Display order matters: the dashboard lists regions in this order. */
export const REGION_LABELS: Record<RegionId, string> = {
  center: 'מרכז',
  shfela: 'שפלה',
  sharon: 'שרון',
  jerusalem: 'ירושלים',
  north: 'צפון וחיפה',
  south: 'דרום',
  remote: 'מהבית/היברידי',
};

export const REGION_IDS = Object.keys(REGION_LABELS) as RegionId[];

export const SENIORITY_LABELS: Record<Seniority, string> = {
  junior: "ג'וניור",
  mid: 'מנוסה',
  senior: 'סניור',
  management: 'ניהול',
  unknown: 'לא צוין',
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  direct: 'ישירות בחברה',
  agency: 'חברת השמה / מיקור חוץ',
  board: 'לוח דרושים',
};
