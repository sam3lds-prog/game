/** Resolves a puzzle reference to a Puzzle with a stable id. Campaign and daily come from the catalog. */
import type { Puzzle } from '../engine/types';
import { campaignPuzzle, dailyPuzzle } from './catalog';

export type PuzzleRef = { kind: 'level'; level: number } | { kind: 'daily'; dateKey: string };

export function puzzleKey(ref: PuzzleRef): string {
  return ref.kind === 'level' ? `campaign-${String(ref.level).padStart(4, '0')}` : `daily-${ref.dateKey}`;
}

/** null when the catalog has no puzzle for this level/date. */
export function loadPuzzle(ref: PuzzleRef): Puzzle | null {
  return ref.kind === 'level' ? campaignPuzzle(ref.level) : dailyPuzzle(ref.dateKey);
}

export function refTitle(ref: PuzzleRef): string {
  return ref.kind === 'level' ? `Level ${ref.level}` : `Daily · ${ref.dateKey}`;
}
