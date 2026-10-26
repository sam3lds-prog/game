/**
 * Turns a ModeRef into its Puzzle. Everything here is deterministic, so a mode reference is enough to
 * rebuild the exact board on any device (resume, share, verification).
 */

import { generatePuzzle } from '../engine/generator';
import { dailySpec, levelSpec } from '../engine/levels';
import { hashString } from '../engine/rng';
import type { Puzzle } from '../engine/types';
import { cupBoardSpec } from '../competitions/cup';
import { dateFromKey } from './dates';
import type { ModeRef } from './modes';
import { modeKey } from './modes';

/**
 * Bump when the generator's output for an existing (size, seed, difficulty) changes. Saved sessions and
 * competitive events record the version they were built with; a mismatch means "don't resume this".
 */
export const GENERATOR_VERSION = 1;

export type PuzzleSource = (mode: ModeRef) => Puzzle | null;

/** Optional curated/frozen boards (the shipped level pack) consulted before generating. */
let packSource: PuzzleSource | null = null;
export function setPuzzlePack(src: PuzzleSource | null): void {
  packSource = src;
  cache.clear();
}

const cache = new Map<string, Puzzle>();
const CACHE_MAX = 12;

export function puzzleFor(mode: ModeRef): Puzzle {
  const key = modeKey(mode);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = packSource?.(mode) ?? generateFor(mode);
  cache.set(key, p);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return p;
}

function generateFor(mode: ModeRef): Puzzle {
  switch (mode.kind) {
    case 'level': {
      const spec = levelSpec(mode.level);
      return generatePuzzle({ size: spec.size, seed: spec.seed, difficulty: spec.difficulty });
    }
    case 'daily': {
      const spec = dailySpec(dateFromKey(mode.dateKey));
      return generatePuzzle({ size: spec.size, seed: spec.seed, difficulty: spec.difficulty });
    }
    case 'zen':
      return generatePuzzle({ size: mode.size, seed: mode.seed });
    case 'cup': {
      const spec = cupBoardSpec(mode.weekKey, mode.index);
      return generatePuzzle({ size: spec.size, seed: spec.seed, difficulty: spec.difficulty });
    }
  }
}

/** Size of the board a mode will produce, without generating it. */
export function sizeFor(mode: ModeRef): number {
  switch (mode.kind) {
    case 'level':
      return levelSpec(mode.level).size;
    case 'daily':
      return dailySpec(dateFromKey(mode.dateKey)).size;
    case 'zen':
      return mode.size;
    case 'cup':
      return cupBoardSpec(mode.weekKey, mode.index).size;
  }
}

/** Short fingerprint of the board layout (not the solution). */
export function puzzleDigest(p: Pick<Puzzle, 'size' | 'regions' | 'givens'>): string {
  const givens = [...p.givens].sort((a, b) => a.r - b.r || a.c - b.c).map((g) => `${g.r}.${g.c}.${g.kind}`);
  return hashString(`${p.size}|${p.regions.map((row) => row.join(',')).join(';')}|${givens.join(';')}`).toString(16).padStart(8, '0');
}

export function modeTitle(mode: ModeRef): string {
  switch (mode.kind) {
    case 'level':
      return `Level ${mode.level}`;
    case 'daily':
      return 'Daily Cozy Puzzle';
    case 'zen':
      return 'Zen Garden';
    case 'cup':
      return `Paw Cup · Board ${mode.index + 1}`;
  }
}
