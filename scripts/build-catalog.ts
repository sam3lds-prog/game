/**
 * Deterministic offline content pipeline.
 *
 *   npx tsx scripts/build-catalog.ts            → src/content/catalog.v1.json + docs/catalog-report.md
 *
 * Same inputs → same catalog, byte for byte. Every published puzzle is:
 *  - unique (exact solver), valid, with connected regions holding one cat + one dog each
 *  - solvable by the deduction engine without guessing, at exactly its labeled difficulty
 *  - not a duplicate or near-duplicate (rotation/reflection-aware) of any other entry
 *
 * Never regenerate a published catalog version in place: past dailies must not change.
 * Bump CATALOG_VERSION for new content and keep earlier entries.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateExact, ENGINE_VERSION, type GeneratedPuzzle } from '../src/engine/generator';
import { countSolutions, isValidSolution } from '../src/engine/solver';
import { hashString } from '../src/engine/rng';
import type { Difficulty } from '../src/engine/types';
import { canonicalKey, encodePuzzle, layoutSimilarity, NEAR_DUPLICATE_THRESHOLD, type Catalog, type CatalogEntry } from '../src/engine/catalogFormat';

export const CATALOG_VERSION = 'v1';
export const DAILY_START = '2026-10-25';
export const DAILY_DAYS = 90;
export const CAMPAIGN_LEVELS = 200;

/** Campaign curve: sizes step up as the player proves the rules; difficulty rises inside each size. */
export function campaignSlot(level: number): { size: number; difficulty: Difficulty } {
  if (level <= 8) return { size: 5, difficulty: 'easy' };
  if (level <= 16) return { size: 5, difficulty: 'medium' };
  if (level <= 22) return { size: 6, difficulty: 'easy' };
  if (level <= 32) return { size: 6, difficulty: 'medium' };
  if (level <= 44) return { size: 7, difficulty: 'medium' };
  if (level <= 56) return { size: 7, difficulty: 'hard' };
  if (level <= 68) return { size: 8, difficulty: 'medium' };
  if (level <= 90) return { size: 8, difficulty: 'hard' };
  if (level <= 105) return { size: 9, difficulty: 'medium' };
  if (level <= 140) return { size: 9, difficulty: level % 7 === 0 ? 'expert' : 'hard' };
  if (level <= 170) return { size: level % 5 === 0 ? 8 : 9, difficulty: level % 5 === 0 ? 'expert' : 'hard' };
  return { size: 9, difficulty: level % 3 === 0 ? 'expert' : 'hard' };
}

/** Daily ladder by weekday (0 = Sunday): gentle early week, toughest at the weekend. */
export const DAILY_BY_WEEKDAY: Array<{ size: number; difficulty: Difficulty }> = [
  { size: 9, difficulty: 'hard' }, // Sun
  { size: 6, difficulty: 'medium' }, // Mon
  { size: 7, difficulty: 'medium' }, // Tue
  { size: 7, difficulty: 'hard' }, // Wed
  { size: 8, difficulty: 'medium' }, // Thu
  { size: 8, difficulty: 'hard' }, // Fri
  { size: 8, difficulty: 'expert' }, // Sat
];

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function weekday(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function connected(p: GeneratedPuzzle): boolean {
  const n = p.size;
  const seen = p.regions.map((row) => row.map(() => false));
  const firstOf = new Map<number, [number, number]>();
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!firstOf.has(p.regions[r][c])) firstOf.set(p.regions[r][c], [r, c]);
  for (const [id, [r0, c0]] of firstOf) {
    const stack = [[r0, c0]];
    seen[r0][c0] = true;
    while (stack.length) {
      const [r, c] = stack.pop()!;
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n || seen[rr][cc] || p.regions[rr][cc] !== id) continue;
        seen[rr][cc] = true;
        stack.push([rr, cc]);
      }
    }
  }
  return seen.every((row) => row.every(Boolean)) && firstOf.size === n;
}

interface Accepted {
  p: GeneratedPuzzle;
  key: string;
}

function main() {
  const t0 = Date.now();
  const accepted: Accepted[] = [];
  const keys = new Set<string>();
  const rejects = { duplicate: 0, nearDuplicate: 0, noMatch: 0 };

  function find(label: string, size: number, difficulty: Difficulty): GeneratedPuzzle {
    for (let attempt = 0; attempt < 400; attempt++) {
      const seed = hashString(`${CATALOG_VERSION}:${label}:${attempt}`);
      const p = generateExact({ size, seed, difficulty, attempts: 40 });
      if (!p) {
        rejects.noMatch++;
        continue;
      }
      // Independent re-checks (the generator already did these).
      if (countSolutions(size, p.regions, p.givens, 2).count !== 1 || !isValidSolution(size, p.regions, p.solution) || !connected(p)) throw new Error(`invalid puzzle ${label}`);
      const key = canonicalKey(p.regions);
      if (keys.has(key)) {
        rejects.duplicate++;
        continue;
      }
      if (accepted.some((a) => a.p.size === size && layoutSimilarity(a.p.regions, p.regions) >= NEAR_DUPLICATE_THRESHOLD)) {
        rejects.nearDuplicate++;
        continue;
      }
      keys.add(key);
      accepted.push({ p, key });
      return p;
    }
    throw new Error(`no ${size}×${size} ${difficulty} puzzle found for ${label}`);
  }

  const entry = (id: string, p: GeneratedPuzzle, date?: string): CatalogEntry => ({
    id,
    size: p.size,
    difficulty: p.difficulty,
    seed: p.seed,
    ...encodePuzzle(p),
    trace: p.trace.join(' '),
    grade: p.grade,
    ...(date ? { date } : {}),
  });

  // Campaign: generate per slot, then order each band (same size + difficulty run) by score.
  const raw: GeneratedPuzzle[] = [];
  for (let level = 1; level <= CAMPAIGN_LEVELS; level++) {
    const slot = campaignSlot(level);
    raw.push(find(`campaign:${level}`, slot.size, slot.difficulty));
    if (level % 20 === 0) console.log(`campaign ${level}/${CAMPAIGN_LEVELS}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  let i = 0;
  while (i < raw.length) {
    let j = i;
    const s0 = campaignSlot(i + 1);
    while (j < raw.length && campaignSlot(j + 1).size === s0.size && campaignSlot(j + 1).difficulty === s0.difficulty) j++;
    const band = raw.slice(i, j).sort((a, b) => a.grade.score - b.grade.score);
    raw.splice(i, j - i, ...band);
    i = j;
  }
  const campaign = raw.map((p, k) => entry(`campaign-${String(k + 1).padStart(4, '0')}`, p));

  const daily: CatalogEntry[] = [];
  for (let d = 0; d < DAILY_DAYS; d++) {
    const date = addDays(DAILY_START, d);
    const slot = DAILY_BY_WEEKDAY[weekday(date)];
    daily.push(entry(`daily-${date}`, find(`daily:${date}`, slot.size, slot.difficulty), date));
    if ((d + 1) % 30 === 0) console.log(`daily ${d + 1}/${DAILY_DAYS}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }

  const catalog: Catalog = {
    catalogVersion: CATALOG_VERSION,
    engineVersion: ENGINE_VERSION,
    dailyPolicy:
      "Daily puzzles are keyed by the player's local calendar date (YYYY-MM-DD); a new one unlocks at local midnight. Every app version resolves a date to the same puzzle id. Published entries never change; new dates are appended in a new catalog version.",
    campaign,
    daily,
  };
  mkdirSync('src/content', { recursive: true });
  writeFileSync(`src/content/catalog.${CATALOG_VERSION}.json`, JSON.stringify(catalog) + '\n');
  writeFileSync('docs/catalog-report.md', report(catalog, rejects, Date.now() - t0));
  console.log(`done: ${campaign.length} campaign + ${daily.length} daily in ${((Date.now() - t0) / 1000).toFixed(0)}s`, rejects);
}

function report(c: Catalog, rejects: Record<string, number>, ms: number): string {
  const rows = (list: CatalogEntry[]) => {
    const groups = new Map<string, CatalogEntry[]>();
    for (const e of list) {
      const k = `${e.size}×${e.size} ${e.difficulty}`;
      groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    const stat = (xs: number[]) => `${Math.min(...xs)}–${Math.max(...xs)} (avg ${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)})`;
    return [...groups.entries()]
      .map(([k, es]) => `| ${k} | ${es.length} | ${stat(es.map((e) => e.grade.givens))} | ${stat(es.map((e) => e.grade.steps))} | ${stat(es.map((e) => e.grade.maxTier))} | ${stat(es.map((e) => e.grade.score))} |`)
      .join('\n');
  };
  const techniques = new Map<string, number>();
  for (const e of [...c.campaign, ...c.daily]) for (const s of e.trace.split(' ')) techniques.set(s.split('.')[0], (techniques.get(s.split('.')[0]) ?? 0) + 1);
  return `# Catalog ${c.catalogVersion} report

Generated by \`npx tsx scripts/build-catalog.ts\` with ${c.engineVersion} in ${(ms / 1000).toFixed(0)} s. Deterministic: rerunning produces the same file.

- Campaign: ${c.campaign.length} levels (${c.campaign[0].id} … ${c.campaign[c.campaign.length - 1].id})
- Daily: ${c.daily.length} days (${c.daily[0].date} … ${c.daily[c.daily.length - 1].date})
- Candidates rejected: ${rejects.duplicate} exact duplicates, ${rejects.nearDuplicate} near-duplicates (boundary similarity ≥ ${NEAR_DUPLICATE_THRESHOLD}), ${rejects.noMatch} seeds with no exact-difficulty match

Difficulty = hardest technique the engine needed: easy = last-spot only; medium = confined/squeeze; hard = locked sets (≤ 1 four-unit set); expert = forcing or repeated four-unit sets.

## Campaign

| Band | Levels | Givens | Logic steps | Max tier | Score |
| --- | --- | --- | --- | --- | --- |
${rows(c.campaign)}

## Daily

| Band | Days | Givens | Logic steps | Max tier | Score |
| --- | --- | --- | --- | --- | --- |
${rows(c.daily)}

## Technique usage across all published steps

${[...techniques.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

(S last-spot · C confined · Q squeeze · K2/K3/K4 locked sets · F forcing)

## Not done here

Manual playtesting of the first campaign levels by people. These metrics are engine measurements, not human solve times; recalibrate bands once TestFlight data arrives.
`;
}

main();
