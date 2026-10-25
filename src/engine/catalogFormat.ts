/**
 * Compact, versioned catalog format shared by the build script, the app and the tests.
 *
 *  regions  — n*n chars, region id per cell (0-9), row-major
 *  solution — n*n chars: '.' empty, 'c' cat, 'd' dog
 *  givens   — "c12,d40": species letter + cell index
 *  trace    — space-separated step codes from the deduction engine (see stepCode)
 */
import { CAT, DOG, EMPTY, type Difficulty, type Given, type Kind, type Puzzle } from './types';
import type { Grade } from './generator';

export interface CatalogEntry {
  id: string;
  size: number;
  difficulty: Difficulty;
  seed: number;
  regions: string;
  solution: string;
  givens: string;
  trace: string;
  grade: Grade;
  /** Daily entries only: local calendar date YYYY-MM-DD. */
  date?: string;
}

export interface Catalog {
  catalogVersion: string;
  engineVersion: string;
  dailyPolicy: string;
  campaign: CatalogEntry[];
  daily: CatalogEntry[];
  /** Easy 5×5 boards reserved for the interactive tutorial (never in campaign or daily). */
  tutorial?: CatalogEntry[];
}

export function encodePuzzle(p: Puzzle): Pick<CatalogEntry, 'regions' | 'solution' | 'givens'> {
  return {
    regions: p.regions.flat().join(''),
    solution: p.solution
      .flat()
      .map((k) => (k === CAT ? 'c' : k === DOG ? 'd' : '.'))
      .join(''),
    givens: p.givens.map((g) => `${g.kind === CAT ? 'c' : 'd'}${g.r * p.size + g.c}`).join(','),
  };
}

export function decodeEntry(e: CatalogEntry, catalogVersion: string): Puzzle & { grade: Grade; trace: string[] } {
  const n = e.size;
  const regions: number[][] = [];
  const solution: Kind[][] = [];
  for (let r = 0; r < n; r++) {
    regions.push([]);
    solution.push([]);
    for (let c = 0; c < n; c++) {
      regions[r].push(Number(e.regions[r * n + c]));
      const ch = e.solution[r * n + c];
      solution[r].push(ch === 'c' ? CAT : ch === 'd' ? DOG : EMPTY);
    }
  }
  const givens: Given[] = e.givens
    .split(',')
    .filter(Boolean)
    .map((g) => {
      const i = Number(g.slice(1));
      return { r: Math.floor(i / n), c: i % n, kind: g[0] === 'c' ? CAT : DOG };
    });
  return { size: n, regions, solution, givens, difficulty: e.difficulty, seed: e.seed, id: e.id, catalogVersion, grade: e.grade, trace: e.trace.split(' ').filter(Boolean) };
}

// ---------------------------------------------------------------- duplicates

const transforms: Array<(r: number, c: number, n: number) => [number, number]> = [
  (r, c) => [r, c],
  (r, c, n) => [c, n - 1 - r],
  (r, c, n) => [n - 1 - r, n - 1 - c],
  (r, c, n) => [n - 1 - c, r],
  (r, c, n) => [r, n - 1 - c],
  (r, c, n) => [n - 1 - r, c],
  (r, c) => [c, r],
  (r, c, n) => [n - 1 - c, n - 1 - r],
];

function transformed(regions: number[][], k: number): number[][] {
  const n = regions.length;
  const out = regions.map((row) => row.slice());
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const [rr, cc] = transforms[k](r, c, n);
      out[rr][cc] = regions[r][c];
    }
  return out;
}

function relabel(regions: number[][]): string {
  const map = new Map<number, number>();
  return regions
    .flat()
    .map((v) => {
      if (!map.has(v)) map.set(v, map.size);
      return map.get(v)!;
    })
    .join('');
}

/** Same region layout under rotation/reflection → same key. */
export function canonicalKey(regions: number[][]): string {
  let best = '';
  for (let k = 0; k < 8; k++) {
    const s = relabel(transformed(regions, k));
    if (!best || s < best) best = s;
  }
  return `${regions.length}:${best}`;
}

/** Internal region boundaries as a set of edge ids. */
function boundaries(regions: number[][]): Set<number> {
  const n = regions.length;
  const out = new Set<number>();
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (c < n - 1 && regions[r][c] !== regions[r][c + 1]) out.add((r * n + c) * 2);
      if (r < n - 1 && regions[r][c] !== regions[r + 1][c]) out.add((r * n + c) * 2 + 1);
    }
  return out;
}

/** Highest boundary similarity (Jaccard) between two layouts across all 8 symmetries. */
export function layoutSimilarity(a: number[][], b: number[][]): number {
  if (a.length !== b.length) return 0;
  const ba = boundaries(a);
  let best = 0;
  for (let k = 0; k < 8; k++) {
    const bb = boundaries(transformed(b, k));
    let inter = 0;
    for (const e of ba) if (bb.has(e)) inter++;
    const union = ba.size + bb.size - inter;
    best = Math.max(best, union ? inter / union : 1);
  }
  return best;
}

export const NEAR_DUPLICATE_THRESHOLD = 0.8;
