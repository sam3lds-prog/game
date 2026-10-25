/**
 * Sprint 0 regression suite. Pins the behaviors the v2 rewrite must keep (or fix):
 * next level, replay, duplicate win, game over, undo, hints, scoped reset.
 */
import { expect, test, type Page } from '@playwright/test';
import { campaignPuzzle } from './helpers';
import { CAT, DOG } from '../src/engine/types';

async function freshStart(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('cvd.seenRules', '1');
    // These regression tests pin v1 behavior: tap-cycle input and Challenge rules.
    localStorage.setItem('cd.v2.settings', JSON.stringify({ inputMode: 'cycle', defaultMode: 'challenge' }));
  });
  await page.reload();
}

function puzzleFor(level: number) {
  return campaignPuzzle(level);
}

async function solve(page: Page, level: number) {
  const p = puzzleFor(level);
  const given = new Set(p.givens.map((g) => `${g.r},${g.c}`));
  for (const species of [CAT, DOG]) {
    await page.click(`[data-tool="${species === CAT ? 'cat' : 'dog'}"]`);
    for (let r = 0; r < p.size; r++)
      for (let c = 0; c < p.size; c++) {
        if (p.solution[r][c] !== species || given.has(`${r},${c}`)) continue;
        const cell = page.locator(`.cell[data-r="${r}"][data-c="${c}"]`);
        await cell.click(); // ✕
        await cell.click(); // pet
      }
  }
}

async function wrongCellFor(level: number) {
  const p = puzzleFor(level);
  const given = new Set(p.givens.map((g) => `${g.r},${g.c}`));
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (p.solution[r][c] !== CAT && !given.has(`${r},${c}`)) return { r, c };
  throw new Error('no wrong cell');
}

test('Next level advances to the following level, not a replay', async ({ page }) => {
  await freshStart(page);
  await page.click('[data-act="play"]');
  await expect(page.locator('.title')).toHaveText('Level 1');
  await solve(page, 1);
  await page.locator('[data-act="next"]').click({ timeout: 10_000 });
  await expect(page.locator('.title')).toHaveText('Level 2');
});

test('Replay replays the same level without advancing twice', async ({ page }) => {
  await freshStart(page);
  await page.click('[data-act="play"]');
  await solve(page, 1);
  await page.locator('[data-act="replay"]').click({ timeout: 10_000 });
  await expect(page.locator('.title')).toHaveText('Level 1');
  await solve(page, 1);
  await page.locator('[data-act="home"]').last().click({ timeout: 10_000 });
  await expect(page.locator('[data-act="play"] .sub')).toHaveText('Level 2');
});

test('A win is recorded once even if the board is tapped again', async ({ page }) => {
  await freshStart(page);
  await page.click('[data-act="play"]');
  await solve(page, 1);
  await expect(page.locator('[data-act="next"]')).toBeVisible({ timeout: 10_000 });
  // Tapping cells after the win must not trigger another result sheet.
  await page.evaluate(() => (document.querySelector('.cell') as HTMLElement).click());
  await expect(page.locator('[data-act="next"]')).toHaveCount(1);
});

test('Three wrong placements end the game in challenge rules', async ({ page }) => {
  await freshStart(page);
  await page.click('[data-act="play"]');
  const bad = await wrongCellFor(1);
  const cell = page.locator(`.cell[data-r="${bad.r}"][data-c="${bad.c}"]`);
  await page.click('[data-tool="cat"]');
  await cell.click(); // ✕
  for (let i = 0; i < 3; i++) await cell.click(); // try the cat three times → three wrong placements
  await expect(page.getByText('Out of hearts')).toBeVisible();
});

test('Undo restores the previous cell state', async ({ page }) => {
  await freshStart(page);
  await page.click('[data-act="play"]');
  const cell = page.locator('.cell:not(.given)').first();
  await cell.click();
  await expect(cell).toHaveClass(/mark/);
  await page.click('[data-act="undo"]');
  await expect(cell).not.toHaveClass(/mark/);
});

test('Reset progress only clears this game’s saved data', async ({ page }) => {
  await freshStart(page);
  await page.evaluate(() => localStorage.setItem('someone-else', 'keep me'));
  await page.click('[data-act="settings"]');
  await page.click('[data-act="reset"]');
  await page.click('[data-act="reset"]'); // confirm
  const other = await page.evaluate(() => localStorage.getItem('someone-else'));
  expect(other).toBe('keep me');
});
