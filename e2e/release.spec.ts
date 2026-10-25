/** The production build ships with ads and purchases off: no store UI, no ad screens, never blocked. */
import { expect, test, type Page } from '@playwright/test';
import { campaignPuzzle } from './helpers';
import { CAT, EMPTY } from '../src/engine/types';

async function fresh(page: Page, storage: Record<string, string>) {
  await page.goto('/');
  await page.evaluate((st) => {
    localStorage.clear();
    localStorage.setItem('cd.v2.flags', JSON.stringify({ seenRules: true, tutorialDone: true }));
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v);
  }, storage);
  await page.reload();
}

const progress = (level: number) => JSON.stringify({ v: 2, level, bestTimes: {}, dailyDone: {}, streak: 0, lastDailyDate: null, installDate: '2026-01-01T00:00:00Z', removeAds: false });

test('settings: no purchase buttons, analytics off by default, privacy explained', async ({ page }) => {
  await fresh(page, {});
  await page.click('[data-act="settings"]');
  await expect(page.locator('.overlay [data-act="buy"]')).toHaveCount(0);
  await expect(page.locator('.overlay [data-act="restore"]')).toHaveCount(0);
  await expect(page.locator('#set-analytics')).not.toBeChecked();
  await expect(page.locator('#set-reminder')).toHaveCount(0); // reminders exist only in the iOS app
  await page.click('.overlay [data-act="privacy"]');
  await expect(page.locator('.overlay').last()).toContainText('No account');
});

test('out of hearts: no ad offered, “Keep going in Zen” keeps the board', async ({ page }) => {
  await fresh(page, { 'cd.v2.settings': JSON.stringify({ defaultMode: 'challenge', faces: 'off' }), 'cd.v2.progress': progress(8) });
  await page.click('[data-act="play"]');
  const p = campaignPuzzle(8);
  const given = new Set(p.givens.map((g) => `${g.r},${g.c}`));
  let wrong = '';
  for (let r = 0; r < p.size && !wrong; r++) for (let c = 0; c < p.size && !wrong; c++) if (!given.has(`${r},${c}`) && p.solution[r][c] !== CAT) wrong = `.cell[data-r="${r}"][data-c="${c}"]`;
  await page.click('[data-tool="cat"]');
  for (let i = 0; i < 3; i++) await page.click(wrong);
  await expect(page.locator('.overlay')).toContainText('Out of hearts');
  await expect(page.locator('.overlay [data-act="revive"]')).toHaveCount(0);
  await page.click('.overlay [data-act="zen"]');
  await expect(page.locator('[data-mode]')).toHaveText('Zen');
  await expect(page.locator('.title')).toHaveText('Level 8');
});

test('winning past level 5 with ads “due” shows no ad and goes straight to the next level', async ({ page }) => {
  await fresh(page, {
    'cd.v2.settings': JSON.stringify({ faces: 'off' }),
    'cd.v2.progress': progress(12),
    'cd.v2.adstate': JSON.stringify({ solvesSinceInterstitial: 50, lastInterstitialAt: 0 }),
  });
  await page.click('[data-act="play"]');
  const p = campaignPuzzle(12);
  const given = new Set(p.givens.map((g) => `${g.r},${g.c}`));
  for (let r = 0; r < p.size; r++)
    for (let c = 0; c < p.size; c++) {
      const v = p.solution[r][c];
      if (v === EMPTY || given.has(`${r},${c}`)) continue;
      await page.click(`[data-tool="${v === CAT ? 'cat' : 'dog'}"]`);
      await page.click(`.cell[data-r="${r}"][data-c="${c}"]`);
    }
  await page.click('.overlay [data-act="next"]');
  await expect(page.locator('.title')).toHaveText('Level 13');
  await expect(page.locator('.demo-ad')).toHaveCount(0);
});
