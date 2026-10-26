/**
 * Paw Cup weekly board pack. Five fixed boards per UTC week, identical for every player because they
 * are derived from the week key alone. `parSeconds` feeds the scoring formula.
 */

import type { Difficulty } from '../engine/types';
import { hashString } from '../engine/rng';
import { utcWeekKey } from '../game/dates';

export interface CupBoardSpec {
  weekKey: string;
  index: number;
  size: number;
  difficulty: Difficulty;
  seed: number;
  parSeconds: number;
  label: string;
}

export const PAR_SECONDS: Record<Difficulty, number> = { easy: 90, medium: 150, hard: 240, expert: 360 };

const LINEUP: Array<{ size: number; difficulty: Difficulty; label: string }> = [
  { size: 6, difficulty: 'easy', label: 'Warm-up' },
  { size: 7, difficulty: 'medium', label: 'Garden Path' },
  { size: 7, difficulty: 'medium', label: 'Courtyard' },
  { size: 8, difficulty: 'hard', label: 'Orchard' },
  { size: 9, difficulty: 'expert', label: 'Grand Hall' },
];

export const CUP_BOARD_COUNT = LINEUP.length;
export const CUP_ATTEMPTS_PER_BOARD = 2;

export function cupBoardSpec(weekKey: string, index: number): CupBoardSpec {
  const slot = LINEUP[Math.max(0, Math.min(LINEUP.length - 1, index))];
  return {
    weekKey,
    index,
    size: slot.size,
    difficulty: slot.difficulty,
    seed: hashString(`cup-${weekKey}-${index}`),
    parSeconds: PAR_SECONDS[slot.difficulty],
    label: slot.label,
  };
}

export function cupWeek(d = new Date()): CupBoardSpec[] {
  const wk = utcWeekKey(d);
  return LINEUP.map((_, i) => cupBoardSpec(wk, i));
}
