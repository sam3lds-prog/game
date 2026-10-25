/** Resolves a puzzle reference to a Puzzle with a stable id. Campaign and daily come from the catalog; unlimited is generated from a seed. */
import type { Difficulty, Puzzle } from '../engine/types';
import { campaignPuzzle, dailyPuzzle } from './catalog';
import { ENGINE_VERSION, generateExact, generatePuzzle } from '../engine/generator';

export type UnlimitedDifficulty = Extract<Difficulty, 'easy' | 'medium' | 'hard'>;
export const UNLIMITED_SIZE: Record<UnlimitedDifficulty, number> = { easy: 6, medium: 7, hard: 8 };

export type PuzzleRef =
  | { kind: 'level'; level: number }
  | { kind: 'daily'; dateKey: string }
  | { kind: 'unlimited'; difficulty: UnlimitedDifficulty; seed: number };

export function puzzleKey(ref: PuzzleRef): string {
  if (ref.kind === 'level') return `campaign-${String(ref.level).padStart(4, '0')}`;
  if (ref.kind === 'daily') return `daily-${ref.dateKey}`;
  return `unlimited-${ref.difficulty}-${ref.seed}`;
}

/** null when the catalog has no puzzle for this level/date. */
export function loadPuzzle(ref: PuzzleRef): Puzzle | null {
  if (ref.kind === 'level') return campaignPuzzle(ref.level);
  if (ref.kind === 'daily') return dailyPuzzle(ref.dateKey);
  const size = UNLIMITED_SIZE[ref.difficulty];
  const p = generateExact({ size, seed: ref.seed, difficulty: ref.difficulty, attempts: 60 }) ?? generatePuzzle({ size, seed: ref.seed, difficulty: ref.difficulty });
  return { ...p, id: puzzleKey(ref), catalogVersion: ENGINE_VERSION };
}

export function newUnlimitedRef(difficulty: UnlimitedDifficulty): PuzzleRef {
  let seed = Math.floor(Math.random() * 2 ** 31);
  try {
    seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
  } catch {
    /* Math.random fallback */
  }
  return { kind: 'unlimited', difficulty, seed };
}

export function refTitle(ref: PuzzleRef): string {
  if (ref.kind === 'level') return `Level ${ref.level}`;
  if (ref.kind === 'daily') return `Daily · ${ref.dateKey}`;
  return `Unlimited · ${ref.difficulty[0].toUpperCase()}${ref.difficulty.slice(1)}`;
}
