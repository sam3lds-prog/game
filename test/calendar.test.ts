// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { emptyRecords, recordSolve } from '../src/game/records';

describe('daily calendar', () => {
  it('shows solved, late, rest, open, today and future days for the current month', () => {
    localStorage.clear();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const now = new Date(2026, 10, 6, 9).getTime(); // Nov 6, 2026
    const app = new App(root, { ads: { maybeShowInterstitial: async () => false, showRewarded: async () => false }, iap: { purchaseRemoveAds: async () => false, restore: async () => false }, haptics: { play() {} }, now: () => now });
    let r = emptyRecords();
    const add = (date: string, on: string) => (r = recordSolve(r, { id: `daily-${date}`, kind: 'daily', size: 7, difficulty: 'medium', mode: 'zen', seconds: 100, mistakes: 0, hints: 0, on }, date).records);
    add('2026-10-28', '2026-10-29'); // solved the next day: "solved later", outside the streak
    add('2026-11-01', '2026-11-01');
    add('2026-11-02', '2026-11-02');
    // 11-03 not solved: forgiven as a rest day
    add('2026-11-04', '2026-11-04');
    add('2026-11-05', '2026-11-05');
    app.ctx.records = r;
    app.ctx.nav.calendar();
    const day = (d: number) => root.querySelector(`[aria-label^="November ${d}:"]`)!;
    expect(day(1).className).toContain('cal__day--solved');
    expect(day(3).className).toContain('cal__day--rest');
    expect(day(6).className).toContain('is-today');
    expect(day(6).className).toContain('cal__day--open');
    expect(day(7).className).toContain('cal__day--future');
    expect(day(7).tagName).toBe('SPAN'); // future days can't be opened
    expect(root.querySelector('.streak-card .v')!.textContent).toBe('4');
    // October has earlier dailies (the catalog starts Oct 25); November has no earlier days to go back past.
    (root.querySelector('[data-act="prev"]') as HTMLElement).click();
    expect(root.querySelector('.cal__head h2')!.textContent).toBe('October 2026');
    expect(root.querySelector('[aria-label^="October 24:"]')!.className).toContain('cal__day--none');
    expect(root.querySelector('[aria-label^="October 25:"]')!.className).toContain('cal__day--missed');
    expect(root.querySelector('[aria-label^="October 28:"]')!.className).toContain('cal__day--late');
    app.destroy();
  });
});
