import { readFileSync } from 'node:fs';
import { decodeEntry, type Catalog } from '../src/engine/catalogFormat';

const catalog = JSON.parse(readFileSync(new URL('../src/content/catalog.v1.json', import.meta.url), 'utf8')) as Catalog;

/** The published puzzle for a campaign level (what the app will show). */
export function campaignPuzzle(level: number) {
  return decodeEntry(catalog.campaign[level - 1], catalog.catalogVersion);
}

export function firstLevelOfSize(size: number): number {
  return catalog.campaign.findIndex((e) => e.size === size) + 1;
}

export function tutorialPoolPuzzles() {
  return (catalog.tutorial ?? []).map((e) => decodeEntry(e, catalog.catalogVersion));
}
