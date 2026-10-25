/**
 * Resolves a puzzle reference (campaign level or daily date) to a Puzzle with a stable id.
 * Sprint 1: generated on demand (catalogVersion "gen-1"). Sprint 3 swaps in the curated catalog.
 */
import { generatePuzzle } from '../engine/generator';
import { dailySpec, levelSpec } from '../engine/levels';
import type { Puzzle } from '../engine/types';

export type PuzzleRef = { kind: 'level'; level: number } | { kind: 'daily'; dateKey: string };

export function puzzleKey(ref: PuzzleRef): string {
  return ref.kind === 'level' ? `campaign-${String(ref.level).padStart(4, '0')}` : `daily-${ref.dateKey}`;
}

export function dateFromKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function loadPuzzle(ref: PuzzleRef): Puzzle {
  if (ref.kind === 'level') {
    const spec = levelSpec(ref.level);
    const p = generatePuzzle({ size: spec.size, seed: spec.seed, difficulty: spec.difficulty });
    return { ...p, id: puzzleKey(ref), catalogVersion: 'gen-1' };
  }
  const spec = dailySpec(dateFromKey(ref.dateKey));
  const p = generatePuzzle({ size: spec.size, seed: spec.seed, difficulty: spec.difficulty });
  return { ...p, id: puzzleKey(ref), catalogVersion: 'gen-1' };
}

export function refTitle(ref: PuzzleRef): string {
  return ref.kind === 'level' ? `Level ${ref.level}` : `Daily · ${ref.dateKey}`;
}
