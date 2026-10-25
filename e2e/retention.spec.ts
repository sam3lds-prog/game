/** Sprint 5: calendar + late dailies, streak copy, unlimited, coats, stats. */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { decodeEntry, type Catalog } from '../src/engine/catalogFormat';
import { CAT, EMPTY } from '../src/engine/types';

const catalog = JSON.parse(readFileSync(new URL('../src/content/catalog.v1.json', import.meta.url), 'utf8')) as Catalog;
const daily = (date: string) => decodeEntry(catalog.daily.find((e) => e.date === date)!, 'v1');

async function fresh(page: Page, storage: Record<string, string> = {}) {
  await page.goto('/');
  await page.evaluate((st) => {
    localStorage.clear();
    localStorage.setItem('cd.v2.flags', JSON.stringify({ seenRules: true, tutorialDone: true }));
    localStorage.setItem('cd.v2.settings', JSON.stringify({ faces: 'off' }));
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v);
  }, storage);
  await page.reload();
}

async function solveOnScreen(page: Page, p: ReturnType<typeof daily>) {
  const given = new Set(p.givens.map((g) => `${g.r},${g.c}`));
  for (let r = 0; r < p.size; r++)
    for (let c = 0; c < p.size; c++) {
      const v = p.solution[r][c];
      if (v === EMPTY || given.has(`${r},${c}`)) continue;
      await page.click(`[data-tool="${v === CAT ? 'cat' : 'dog'}"]`);
      await page.click(`.cell[data-r="${r}"][data-c="${c}"]`);
    }
}

test('an old daily can be replayed from the calendar; it counts toward totals but not the streak', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 6, 10, 0, 0));
  await fresh(page);
  await page.click('[data-act="calendar"]');
  await expect(page.locator('.cal__head h2')).toHaveText('November 2026');
  await expect(page.locator('[aria-label^="November 7:"]')).toHaveClass(/cal__day--future/);
  await page.click('[data-act="prev"]');
  await page.click('[aria-label^="October 30:"]');
  await expect(page.locator('.title')).toHaveText('Daily · 2026-10-30');
  await solveOnScreen(page, daily('2026-10-30'));
  await expect(page.locator('.overlay')).toContainText('counts toward your totals, not your streak', { timeout: 5000 });
  await page.click('.overlay [data-act="home"]');
  await page.click('[data-act="calendar"]');
  await page.click('[data-act="prev"]');
  await expect(page.locator('[aria-label^="October 30:"]')).toHaveClass(/cal__day--late/);
  await expect(page.locator('.streak-card .v').first()).toHaveText('0');
});

test('solving today’s daily starts a streak shown on Home and in the calendar', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 6, 10, 0, 0));
  await fresh(page);
  await page.click('[data-act="daily"]');
  await solveOnScreen(page, daily('2026-11-06'));
  await expect(page.locator('.overlay')).toContainText('Streak: 1', { timeout: 5000 });
  await page.click('.overlay [data-act="next"]');
  await expect(page.locator('[data-act="daily"] .sub')).toContainText('Done today');
  await expect(page.locator('[data-act="daily"] .sub')).toContainText('streak 1');
});

test('unlimited: pick a difficulty and get a fresh board of the right size', async ({ page }) => {
  await fresh(page);
  await page.click('[data-act="unlimited"]');
  await page.click('[data-act="u-easy"]');
  await expect(page.locator('.title')).toHaveText('Unlimited · Easy');
  await expect(page.locator('.board .cell')).toHaveCount(36);
  await page.click('[data-act="home"]');
  await page.click('[data-act="unlimited"]');
  await expect(page.locator('[data-act="u-continue"]')).toBeVisible();
});

test('coats: an unlocked coat recolors every pet without changing its shape or size', async ({ page }) => {
  const records = { v: 1, total: 5, firstTime: 5, zeroMistake: 0, perfect: 0, hints: 0, expert: 0, noHintChallenge: 0, dailyTotal: 0, completed: {}, daily: {}, bestStreak: 0, recent: [], awards: { 'first-solve': '2026-10-25' }, coats: { cat: ['ginger'], dog: ['cocoa', 'golden'] }, selected: { cat: 'ginger', dog: 'cocoa' } };
  await fresh(page, { 'cd.v2.records': JSON.stringify(records) });
  await page.click('[data-act="collection"]');
  await expect(page.locator('[data-coat="slate"]')).toHaveAttribute('aria-disabled', 'true');
  await page.click('[data-coat="golden"]');
  await expect(page.locator('[data-coat="golden"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('[data-act="home"]');
  const heroBefore = await page.locator('.home__hero svg.pet--dog').boundingBox();
  const fill = await page.evaluate(() => getComputedStyle(document.querySelector('.home__hero svg.pet--dog .fur')!).fill);
  expect(fill).toBe('rgb(217, 164, 65)');
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-dog-coat'))).toBe('golden');
  expect(await page.locator('.home__hero svg.pet--dog').boundingBox()).toEqual(heroBefore);
});

test('stats show totals, times by board size and awards', async ({ page }) => {
  await fresh(page);
  await page.click('[data-act="unlimited"]');
  await page.click('[data-act="u-easy"]');
  const p = await page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('cd.v2.sessions') ?? '{}');
    const key = Object.keys(idx)[0];
    return key ? JSON.parse(localStorage.getItem(`cd.v2.session.${key}`)!).puzzle : null;
  });
  // Session is saved on the first move; make one so it exists, then read the puzzle.
  expect(p === null || p.size === 6).toBe(true);
  await page.click('[data-tool="mark"]');
  await page.click('.cell[data-r="0"][data-c="0"]');
  await page.click('.cell[data-r="0"][data-c="0"]');
  const puzzle = await page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('cd.v2.sessions') ?? '{}');
    const key = Object.keys(idx)[0];
    return JSON.parse(localStorage.getItem(`cd.v2.session.${key}`)!).puzzle;
  });
  await solveOnScreen(page, puzzle);
  await page.click('.overlay [data-act="home"]', { timeout: 5000 });
  await page.click('[data-act="stats"]');
  await expect(page.locator('.tile').first()).toContainText('1');
  await expect(page.locator('.table')).toContainText('6×6');
  await expect(page.locator('.award.is-earned', { hasText: 'First steps' })).toHaveCount(1);
  await expect(page.locator('.award.is-earned', { hasText: 'Clean sweep' })).toHaveCount(1); // 0 mistakes, 0 hints
});
