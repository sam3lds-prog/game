/** Level ladder + daily puzzle seeds. Deterministic, so every player sees the same daily. */

import type { Difficulty } from './types';
import { hashString } from './rng';

export interface LevelSpec {
  level: number;
  size: number;
  difficulty: Difficulty;
  seed: number;
}

/** Sizes step up as the player proves the rules; difficulty rises inside each size band. */
export function levelSpec(level: number): LevelSpec {
  let size: number;
  let difficulty: Difficulty;
  if (level <= 6) [size, difficulty] = [5, 'easy'];
  else if (level <= 10) [size, difficulty] = [5, 'hard'];
  else if (level <= 18) [size, difficulty] = [6, 'easy'];
  else if (level <= 26) [size, difficulty] = [6, 'hard'];
  else if (level <= 40) [size, difficulty] = [7, level % 3 === 0 ? 'hard' : 'medium'];
  else if (level <= 70) [size, difficulty] = [8, level % 2 === 0 ? 'hard' : 'medium'];
  else [size, difficulty] = [9, level % 4 === 0 ? 'expert' : 'hard'];
  return { level, size, difficulty, seed: hashString(`level-${level}`) };
}

export interface DailySpec {
  dateKey: string; // YYYY-MM-DD in the player's local time
  size: number;
  difficulty: Difficulty;
  seed: number;
}

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Weekday ladder: gentle early in the week, big on the weekend. */
export function dailySpec(d = new Date()): DailySpec {
  const dateKey = localDateKey(d);
  const dow = d.getDay(); // 0 = Sunday
  const table: Array<[number, Difficulty]> = [
    [9, 'hard'], // Sun
    [7, 'medium'], // Mon
    [7, 'medium'], // Tue
    [7, 'hard'], // Wed
    [8, 'medium'], // Thu
    [8, 'hard'], // Fri
    [9, 'medium'], // Sat
  ];
  const [size, difficulty] = table[dow];
  return { dateKey, size, difficulty, seed: hashString(`daily-${dateKey}`) };
}
