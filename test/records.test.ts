// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AWARDS, COATS, emptyRecords, loadRecords, recordSolve, sizeStats, streakFor, type SolveRecord } from '../src/game/records';
import { loadPuzzle, puzzleKey } from '../src/game/puzzles';
import { Session } from '../src/game/session';
import { shareText } from '../src/screens/game';
import { App } from '../src/app/app';
import { campaignPuzzle } from '../src/game/catalog';
import { EMPTY } from '../src/engine/types';

const solve = (over: Partial<SolveRecord> = {}): SolveRecord => ({ id: 'campaign-0001', kind: 'level', size: 5, difficulty: 'easy', mode: 'zen', seconds: 60, mistakes: 1, hints: 1, on: '2026-10-25', ...over });

describe('records are idempotent', () => {
  it('replaying a puzzle adds to totals but never to first-time counts, awards or coats', () => {
    let r = emptyRecords();
    for (let i = 1; i <= 5; i++) r = recordSolve(r, solve({ id: `campaign-000${i}` })).records;
    expect(r.firstTime).toBe(5);
    expect(r.coats.dog).toContain('golden');
    const again = recordSolve(r, solve({ id: 'campaign-0001' }));
    expect(again.firstTime).toBe(false);
    expect(again.records.total).toBe(6);
    expect(again.records.firstTime).toBe(5);
    expect(again.newAwards).toEqual([]);
    expect(again.newCoats).toEqual([]);
  });

  it('awards unlock exactly once, on the right condition', () => {
    let out = recordSolve(emptyRecords(), solve({ mistakes: 0, hints: 0, mode: 'challenge', difficulty: 'expert' }));
    const ids = out.newAwards.map((a) => a.id).sort();
    expect(ids).toEqual(['first-expert', 'first-perfect', 'first-solve', 'no-hint-challenge']);
    out = recordSolve(out.records, solve({ id: 'x2', mistakes: 0, hints: 0, mode: 'challenge', difficulty: 'expert' }));
    expect(out.newAwards).toEqual([]);
    expect(out.newCoats.map((c) => c.id).sort()).toEqual([]);
    expect(out.records.coats.cat).toContain('cream');
    expect(out.records.coats.dog).toEqual(expect.arrayContaining(['slate', 'biscuit']));
  });

  it('only dailies solved on their own day count toward the streak', () => {
    let r = emptyRecords();
    r = recordSolve(r, solve({ id: 'daily-2026-10-23', kind: 'daily', on: '2026-10-23' }), '2026-10-23').records;
    r = recordSolve(r, solve({ id: 'daily-2026-10-24', kind: 'daily', on: '2026-10-25' }), '2026-10-24').records; // solved late
    r = recordSolve(r, solve({ id: 'daily-2026-10-25', kind: 'daily', on: '2026-10-25' }), '2026-10-25').records;
    expect(r.dailyTotal).toBe(3);
    // 10-24 was solved late, so it is a rest day between two on-day solves
    const s = streakFor(r, '2026-10-25');
    expect(s.current).toBe(2);
    expect(s.restDays).toEqual(['2026-10-24']);
    // a second record for the same daily is ignored
    const dup = recordSolve(r, solve({ id: 'daily-2026-10-25', kind: 'daily', on: '2026-10-26' }), '2026-10-25').records;
    expect(dup.daily['2026-10-25'].solvedOn).toBe('2026-10-25');
    expect(dup.dailyTotal).toBe(3);
  });

  it('carries over dailies completed before records existed', () => {
    localStorage.clear();
    const r = loadRecords({ '2026-10-24': true, '2026-10-25': true });
    expect(r.dailyTotal).toBe(2);
    expect(streakFor(r, '2026-10-25').current).toBe(2);
  });

  it('times by board size: median, average and best', () => {
    let r = emptyRecords();
    for (const [i, secs] of [30, 90, 60, 300].entries()) r = recordSolve(r, solve({ id: `p${i}`, size: 7, seconds: secs })).records;
    const [s] = sizeStats(r);
    expect(s).toEqual({ size: 7, solves: 4, medianSeconds: 75, averageSeconds: 120, bestSeconds: 30 });
  });

  it('every award and coat is defined once', () => {
    expect(new Set(AWARDS.map((a) => a.id)).size).toBe(AWARDS.length);
    expect(new Set(COATS.map((c) => c.id)).size).toBe(COATS.length);
  });
});

describe('coats are recolors only', () => {
  it('coats.css sets only colors (fill, stroke, custom properties)', () => {
    const css = readFileSync('src/style/coats.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const props = [...css.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    for (const p of props) expect(['fill', 'stroke'].includes(p) || p.startsWith('--'), p).toBe(true);
    for (const c of COATS) expect(css, c.id).toContain(`[data-${c.species}-coat='${c.id}']`);
  });
});

describe('unlimited', () => {
  it('is deterministic per seed and labeled with its real difficulty', () => {
    const ref = { kind: 'unlimited', difficulty: 'hard', seed: 12345 } as const;
    const a = loadPuzzle(ref)!;
    const b = loadPuzzle(ref)!;
    expect(a.regions).toEqual(b.regions);
    expect(a.id).toBe(puzzleKey(ref));
    expect(a.size).toBe(8);
    expect(['easy', 'medium', 'hard', 'expert']).toContain(a.difficulty);
  });
});

describe('sharing', () => {
  it('never reveals positions', () => {
    const s = new Session(campaignPuzzle(12)!, 'zen');
    const text = shareText({ kind: 'level', level: 12 }, s, 125);
    expect(text).toContain('2:05');
    expect(text).toMatch(/0 mistakes · 0 hints · clean sweep/);
    expect(text).not.toMatch(/row|column|r\d|c\d|\(\d/i);
  });
});

describe('win flow records once', () => {
  it('a win updates records and progress exactly once and shows new awards', async () => {
    localStorage.clear();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new App(root, { ads: { maybeShowInterstitial: async () => false, showRewarded: async () => false }, iap: { purchaseRemoveAds: async () => false, restore: async () => false }, haptics: { play() {} }, now: () => new Date(2026, 9, 25, 12).getTime() });
    app.ctx.flags.tutorialDone = true;
    app.ctx.settings.faces = 'off';
    app.ctx.nav.play({ kind: 'daily', dateKey: '2026-10-25' });
    const g = app.screen as unknown as { debug: { session: Session }; checkOutcome(): void };
    const s = g.debug.session;
    for (let r = 0; r < s.size; r++)
      for (let c = 0; c < s.size; c++) {
        const v = s.puzzle.solution[r][c];
        if (v !== EMPTY && !s.givenMask[r][c]) s.setCell(r, c, v);
      }
    g.checkOutcome();
    g.checkOutcome();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(app.ctx.records.total).toBe(1);
    expect(app.ctx.records.dailyTotal).toBe(1);
    expect(streakFor(app.ctx.records, '2026-10-25').current).toBe(1);
    expect(document.querySelector('.rewards')?.textContent).toContain('First steps');
    app.destroy();
  });
});
