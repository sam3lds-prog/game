/**
 * Pure progression rules, separated from the UI so they can be tested.
 * Every function returns a new Progress object; callers persist it.
 */
import type { Progress } from '../services/storage';

export interface LevelWinResult {
  progress: Progress;
  isBest: boolean;
  /** The level the "Next level" button should open. */
  nextLevel: number;
  /** True only the first time this level is completed. */
  firstCompletion: boolean;
}

export function recordLevelWin(prev: Progress, level: number, seconds: number): LevelWinResult {
  const key = `L${level}`;
  const best = prev.bestTimes[key];
  const isBest = best === undefined || seconds < best;
  const firstCompletion = level >= prev.level;
  const progress: Progress = {
    ...prev,
    level: Math.max(prev.level, level + 1),
    bestTimes: isBest ? { ...prev.bestTimes, [key]: seconds } : prev.bestTimes,
  };
  return { progress, isBest, nextLevel: level + 1, firstCompletion };
}

export function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function recordDailyWin(prev: Progress, dateKey: string, seconds: number, now = new Date()): { progress: Progress; isBest: boolean } {
  const key = `D${dateKey}`;
  const best = prev.bestTimes[key];
  const isBest = best === undefined || seconds < best;
  let { streak, lastDailyDate } = prev;
  const dailyDone = { ...prev.dailyDone };
  if (!dailyDone[dateKey]) {
    dailyDone[dateKey] = true;
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    streak = lastDailyDate === localKey(y) ? streak + 1 : lastDailyDate === dateKey ? streak : 1;
    lastDailyDate = dateKey;
  }
  return {
    progress: { ...prev, dailyDone, streak, lastDailyDate, bestTimes: isBest ? { ...prev.bestTimes, [key]: seconds } : prev.bestTimes },
    isBest,
  };
}
