import { describe, expect, it } from 'vitest';
import { bestStreak, currentStreak } from '../src/game/streak';
import { addDaysKey } from '../src/engine/levels';

const days = (start: string, n: number, skip: number[] = []) => {
  const out: string[] = [];
  for (let i = 0; i < n; i++) if (!skip.includes(i)) out.push(addDaysKey(start, i));
  return new Set(out);
};

describe('streaks', () => {
  it('counts consecutive solved days', () => {
    expect(currentStreak(days('2026-10-20', 6), '2026-10-25').current).toBe(6);
  });

  it('an unsolved today does not break the streak yet', () => {
    const s = currentStreak(days('2026-10-20', 5), '2026-10-25');
    expect(s.current).toBe(5);
    expect(s.atRisk).toBe(true);
  });

  it('one missed day is forgiven, once per 7 days', () => {
    // 10-20 .. 10-25 with 10-22 missed
    expect(currentStreak(days('2026-10-20', 6, [2]), '2026-10-25').current).toBe(5);
    // two single misses 3 days apart: only the most recent is forgiven
    expect(currentStreak(days('2026-10-15', 11, [2, 6]), '2026-10-25').current).toBe(4 + 3 - 0);
  });

  it('two missed days in a row end the streak', () => {
    expect(currentStreak(days('2026-10-15', 11, [5, 6]), '2026-10-25').current).toBe(4);
  });

  it('yesterday can be a rest day while today is still open', () => {
    const solved = days('2026-10-18', 6); // through 10-23; 10-24 missed; today 10-25 open
    const s = currentStreak(solved, '2026-10-25');
    expect(s.current).toBe(6);
    expect(s.restDays).toContain('2026-10-24');
  });

  it('missing yesterday and today’s window with a recent rest ends it', () => {
    const solved = days('2026-10-18', 6, [3]); // 10-21 already a rest day, 10-24 missed too
    expect(currentStreak(solved, '2026-10-25').current).toBe(0);
  });

  it('best streak finds the longest run in history', () => {
    const solved = new Set([...days('2026-01-01', 12), ...days('2026-03-01', 5)]);
    expect(bestStreak(solved)).toBe(12);
  });

  it('survives month ends, year ends and daylight-saving changes', () => {
    expect(currentStreak(days('2026-12-28', 7), '2027-01-03').current).toBe(7);
    expect(currentStreak(days('2026-10-30', 5), '2026-11-03').current).toBe(5); // US DST ends 11-01
    expect(currentStreak(days('2027-03-12', 4), '2027-03-15').current).toBe(4); // US DST starts 03-14
  });
});
