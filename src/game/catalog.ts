/**
 * Published puzzle catalog. Campaign levels and dailies come only from here, so every install and
 * every app version sees the same puzzle for the same level or date. No generation at runtime.
 */
import raw from '../content/catalog.v1.json';
import { decodeEntry, type Catalog, type CatalogEntry } from '../engine/catalogFormat';
import type { Puzzle } from '../engine/types';

const catalog = raw as unknown as Catalog;

export const CATALOG_VERSION = catalog.catalogVersion;
export const CAMPAIGN_LENGTH = catalog.campaign.length;
export const DAILY_FIRST = catalog.daily[0]?.date ?? '';
export const DAILY_LAST = catalog.daily[catalog.daily.length - 1]?.date ?? '';

const dailyByDate = new Map<string, CatalogEntry>(catalog.daily.map((e) => [e.date!, e]));

export type CatalogPuzzle = Puzzle & { grade: CatalogEntry['grade']; trace: string[] };

export function campaignEntry(level: number): CatalogEntry | null {
  return catalog.campaign[level - 1] ?? null;
}

export function campaignPuzzle(level: number): CatalogPuzzle | null {
  const e = campaignEntry(level);
  return e ? decodeEntry(e, CATALOG_VERSION) : null;
}

export function dailyEntry(dateKey: string): CatalogEntry | null {
  return dailyByDate.get(dateKey) ?? null;
}

export function dailyPuzzle(dateKey: string): CatalogPuzzle | null {
  const e = dailyEntry(dateKey);
  return e ? decodeEntry(e, CATALOG_VERSION) : null;
}

export function allDailyDates(): string[] {
  return catalog.daily.map((e) => e.date!);
}

/** Easy boards reserved for the tutorial. */
export function tutorialPool(): CatalogPuzzle[] {
  return (catalog.tutorial ?? []).map((e) => decodeEntry(e, CATALOG_VERSION));
}
