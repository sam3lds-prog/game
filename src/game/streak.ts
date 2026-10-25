/**
 * Daily streaks, with one forgiving rule:
 *
 *   Your streak counts the days you solve that day's Daily. Miss a single day and the streak keeps
 *   going (a "rest day"), at most once in any 7 days. Miss two days in a row and it starts over.
 *   Solving an old Daily from the calendar never changes your streak.
 *
 * Days are the player's local calendar dates (YYYY-MM-DD). Today not being solved yet never breaks
 * a streak — the day isn't over.
 */
import { addDaysKey } from '../engine/levels';

export const REST_DAY_WINDOW = 7;

export interface StreakInfo {
  current: number;
  /** Rest days used inside the current streak (dates). */
  restDays: string[];
  /** True when today still needs solving to keep the streak alive. */
  atRisk: boolean;
}

/** Streak ending at `end` (inclusive) walking backwards; `end` must be solved to count. */
function streakEndingAt(solved: Set<string>, end: string): { count: number; rests: string[] } {
  let count = 0;
  const rests: string[] = [];
  let day = end;
  let steps = 0;
  let lastRestStep = -Infinity;
  for (;;) {
    if (solved.has(day)) {
      count++;
    } else {
      const older = addDaysKey(day, -1);
      const restAllowed = count > 0 && steps - lastRestStep >= REST_DAY_WINDOW && solved.has(older);
      if (!restAllowed) break;
      rests.push(day);
      lastRestStep = steps;
    }
    day = addDaysKey(day, -1);
    steps++;
    if (steps > 4000) break;
  }
  return { count, rests };
}

export function currentStreak(solved: Set<string>, today: string): StreakInfo {
  if (solved.has(today)) {
    const s = streakEndingAt(solved, today);
    return { current: s.count, restDays: s.rests, atRisk: false };
  }
  const yesterday = addDaysKey(today, -1);
  if (solved.has(yesterday)) {
    const s = streakEndingAt(solved, yesterday);
    return { current: s.count, restDays: s.rests, atRisk: true };
  }
  // Yesterday missed: it can be today's rest day if the day before was solved.
  const before = addDaysKey(today, -2);
  if (solved.has(before)) {
    const s = streakEndingAt(solved, before);
    const recentRest = s.rests.some((r) => r >= addDaysKey(today, -REST_DAY_WINDOW));
    if (!recentRest && s.count > 0) return { current: s.count, restDays: [yesterday, ...s.rests], atRisk: true };
  }
  return { current: 0, restDays: [], atRisk: false };
}

export function bestStreak(solved: Set<string>): number {
  let best = 0;
  for (const d of solved) best = Math.max(best, streakEndingAt(solved, d).count);
  return best;
}

/**
 * The day a Daily solve counts for. Normally the day it was solved. One grace case: a Daily opened
 * on its own day and finished the next day (playing across midnight) still counts for its day.
 */
export function dailyCreditDay(dateKey: string, openedOn: string | null | undefined, today: string): string {
  if (today === dateKey) return dateKey;
  if (openedOn === dateKey && today === addDaysKey(dateKey, 1)) return dateKey;
  return today;
}
