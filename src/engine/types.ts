/** Core puzzle types for Cats vs Dogs. */

export const EMPTY = 0;
export const CAT = 1;
export const DOG = 2;
export type Kind = typeof EMPTY | typeof CAT | typeof DOG;
export type Species = typeof CAT | typeof DOG;

export interface Cell {
  r: number;
  c: number;
}

export interface Given extends Cell {
  kind: Species;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface Puzzle {
  /** Grid size n (n×n). */
  size: number;
  /** regions[r][c] = region id in [0, n). Every region is connected and holds exactly one cat and one dog. */
  regions: number[][];
  /** Pre-placed animals that break the cat/dog swap symmetry. Usually one. */
  givens: Given[];
  /** The unique solution: solution[r][c] ∈ {EMPTY, CAT, DOG}. */
  solution: Kind[][];
  /** Graded difficulty from the deduction engine. */
  difficulty: Difficulty;
  /** Seed that produced this puzzle (for reproducibility / sharing). */
  seed: number;
  /** Stable identity, e.g. "campaign-0007" or "daily-2026-10-26". Saved sessions reference it. */
  id?: string;
  /** Catalog or generator version that produced this puzzle. */
  catalogVersion?: string;
}

/**
 * RULES
 *  1. Every row, column and color region holds exactly one cat and one dog.
 *  2. A cat and a dog never sit side by side (share an edge). Diagonal is fine.
 * (Two cats or two dogs can never share an edge either — rule 1 already forbids it.)
 */
export function sideBySide(a: Cell, b: Cell): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

export function otherSpecies(s: Species): Species {
  return s === CAT ? DOG : CAT;
}

export function makeGrid<T>(n: number, fill: T): T[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => fill));
}
