import { describe, expect, it } from 'vitest';
import { recordDailyWin, recordLevelWin } from '../src/game/progression';
import { defaultProgress } from '../src/services/storage';

describe('recordLevelWin', () => {
  it('points Next at the following level', () => {
    const r = recordLevelWin(defaultProgress(), 1, 42);
    expect(r.nextLevel).toBe(2);
    expect(r.progress.level).toBe(2);
    expect(r.firstCompletion).toBe(true);
  });

  it('does not advance twice when a level is replayed', () => {
    const once = recordLevelWin(defaultProgress(), 1, 42).progress;
    const twice = recordLevelWin(once, 1, 30);
    expect(twice.progress.level).toBe(2);
    expect(twice.firstCompletion).toBe(false);
    expect(twice.isBest).toBe(true);
  });

  it('replaying an old level never moves progress backwards', () => {
    const p = { ...defaultProgress(), level: 10 };
    expect(recordLevelWin(p, 3, 50).progress.level).toBe(10);
  });

  it('keeps the best time', () => {
    const a = recordLevelWin(defaultProgress(), 1, 30).progress;
    const b = recordLevelWin(a, 1, 60);
    expect(b.isBest).toBe(false);
    expect(b.progress.bestTimes.L1).toBe(30);
  });
});

describe('recordDailyWin', () => {
  it('extends the streak on consecutive days and counts a day once', () => {
    let p = defaultProgress();
    p = recordDailyWin(p, '2026-10-24', 100, new Date(2026, 9, 24)).progress;
    expect(p.streak).toBe(1);
    p = recordDailyWin(p, '2026-10-25', 100, new Date(2026, 9, 25)).progress;
    expect(p.streak).toBe(2);
    p = recordDailyWin(p, '2026-10-25', 80, new Date(2026, 9, 25)).progress;
    expect(p.streak).toBe(2);
  });

  it('restarts the streak after a missed day', () => {
    let p = defaultProgress();
    p = recordDailyWin(p, '2026-10-20', 100, new Date(2026, 9, 20)).progress;
    p = recordDailyWin(p, '2026-10-25', 100, new Date(2026, 9, 25)).progress;
    expect(p.streak).toBe(1);
  });
});
