/** Sprint 4: tutorial, Zen mode, explain → reveal hints, layout on small phones, dark mode, keyboard. */
import { expect, test, type Page } from '@playwright/test';
import { campaignPuzzle, firstLevelOfSize, tutorialPoolPuzzles } from './helpers';
import { buildLessons } from '../src/game/tutorial';
import { CAT, EMPTY } from '../src/engine/types';

async function fresh(page: Page, storage: Record<string, string> = {}) {
  await page.goto('/');
  await page.evaluate((st) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v);
  }, storage);
  await page.reload();
}

const veteran = (level = 1, settings: Record<string, unknown> = {}) => ({
  'cd.v2.flags': JSON.stringify({ seenRules: true, tutorialDone: true }),
  'cd.v2.progress': JSON.stringify({ v: 2, level, bestTimes: {}, dailyDone: {}, streak: 0, lastDailyDate: null, installDate: new Date().toISOString(), removeAds: false }),
  'cd.v2.settings': JSON.stringify(settings),
});

const cell = (r: number, c: number) => `.cell[data-r="${r}"][data-c="${c}"]`;

test('a new player is guided through the 5-step tutorial into Level 1', async ({ page }) => {
  await fresh(page);
  await expect(page.locator('[data-act="tutorial"]')).toContainText('Start here');
  await page.click('[data-act="tutorial"]');
  const lessons = buildLessons(tutorialPoolPuzzles())!;
  for (const l of lessons.slice(0, 4)) {
    await expect(page.locator('.lesson__step')).toHaveText(`Step ${l.step} of 5`);
    if (l.decoy) {
      await page.click(`[data-tool="${l.target!.species === CAT ? 'cat' : 'dog'}"]`);
      await page.click(cell(l.decoy.r, l.decoy.c));
      await expect(page.locator('[data-status]')).not.toBeEmpty();
      await expect(page.locator(`${cell(l.decoy.r, l.decoy.c)} svg.pet`)).toHaveCount(0);
    }
    await page.click(`[data-tool="${l.target!.species === CAT ? 'cat' : 'dog'}"]`);
    await page.click(cell(l.target!.r, l.target!.c));
    await page.click('[data-act="next"]');
  }
  await expect(page.locator('.lesson__step')).toHaveText('Step 5 of 5');
  const mini = lessons[4].puzzle;
  const given = new Set(mini.givens.map((g) => `${g.r},${g.c}`));
  for (let r = 0; r < mini.size; r++)
    for (let c = 0; c < mini.size; c++) {
      const v = mini.solution[r][c];
      if (v === EMPTY || given.has(`${r},${c}`)) continue;
      await page.click(`[data-tool="${v === CAT ? 'cat' : 'dog'}"]`);
      await page.click(cell(r, c));
    }
  await page.click('[data-act="start"]', { timeout: 5000 });
  await expect(page.locator('.title')).toHaveText('Level 1');
});

test('Zen mode: no hearts, legal guesses are allowed, hints explain before they reveal', async ({ page }) => {
  await fresh(page, veteran(30));
  await page.click('[data-act="play"]');
  await expect(page.locator('[data-mode]')).toHaveText('Zen');
  await expect(page.locator('[data-hearts]')).toHaveCount(0);
  await expect(page.locator('[data-timer]')).toHaveCount(0);

  const p = campaignPuzzle(30);
  const given = new Set(p.givens.map((g) => `${g.r},${g.c}`));
  // A cat that breaks no visible rule but isn't the answer is accepted in Zen.
  const wrong = await page.evaluate(() => null);
  void wrong;
  let placedWrong = false;
  for (let r = 0; r < p.size && !placedWrong; r++)
    for (let c = 0; c < p.size && !placedWrong; c++) {
      if (given.has(`${r},${c}`) || p.solution[r][c] === CAT) continue;
      await page.click('[data-tool="cat"]');
      await page.click(cell(r, c));
      if (await page.locator(`${cell(r, c)} svg.pet`).count()) placedWrong = true;
    }
  expect(placedWrong).toBe(true);

  // Explain: names the problem without changing the board.
  const petsBefore = await page.locator('.board svg.pet').count();
  await page.click('[data-act="hint"]');
  await expect(page.locator('.hint-panel')).toBeVisible();
  await expect(page.locator('.hint-panel p').first()).toContainText('can’t be part of the answer');
  expect(await page.locator('.board svg.pet').count()).toBe(petsBefore);
  // Reveal: takes the wrong pet back.
  await page.click('[data-act="hint-reveal"]');
  expect(await page.locator('.board svg.pet').count()).toBe(petsBefore - 1);

  // Next hint is a logical step with highlighted units; Reveal places exactly one correct pet.
  await page.click('[data-act="hint"]');
  await expect(page.locator('.cell.in-hint-unit').first()).toBeVisible();
  expect(await page.locator('.board svg.pet').count()).toBe(petsBefore - 1);
  await page.click('[data-act="hint-reveal"]');
  expect(await page.locator('.board svg.pet').count()).toBe(petsBefore);
  await expect(page.locator('.cell.in-hint-unit')).toHaveCount(0);
});

for (const vp of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 430, height: 932 },
]) {
  test(`9×9 fits with every control visible at ${vp.width}×${vp.height}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await fresh(page, veteran(firstLevelOfSize(9)));
    await page.click('[data-act="play"]');
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    const board = await box('.board');
    const status = await box('[data-status]');
    const actions = await box('.actions');
    const cellBox = await box('.board .cell');
    expect(board.x).toBeGreaterThanOrEqual(0);
    expect(board.x + board.width).toBeLessThanOrEqual(vp.width);
    expect(board.y + board.height).toBeLessThanOrEqual(status.y + 1);
    expect(actions.y + actions.height).toBeLessThanOrEqual(vp.height);
    expect(cellBox.width).toBeGreaterThanOrEqual(24);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(vp.width);
    // Opening a hint must not move or resize the board.
    await page.click('[data-act="hint"]');
    const after = await box('.board');
    expect(after).toEqual(board);
    await ctx.close();
  });
}

test('dark appearance follows the system and the setting', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' });
  const page = await ctx.newPage();
  await fresh(page, veteran(1));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(29, 25, 22)');
  await page.click('[data-act="settings"]');
  await page.click('[data-act="choose"][data-key="theme"][data-value="light"]');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(251, 247, 239)');
  await ctx.close();
});

test('the board works from the keyboard', async ({ page }) => {
  await fresh(page, veteran(1));
  await page.click('[data-act="play"]');
  const p = campaignPuzzle(1);
  const given = new Set(p.givens.map((g) => `${g.r},${g.c}`));
  let target: { r: number; c: number; v: number } | null = null;
  for (let r = 0; r < p.size && !target; r++) for (let c = 0; c < p.size && !target; c++) if (p.solution[r][c] !== EMPTY && !given.has(`${r},${c}`)) target = { r, c, v: p.solution[r][c] };
  await page.focus(cell(0, 0));
  for (let i = 0; i < target!.r; i++) await page.keyboard.press('ArrowDown');
  for (let i = 0; i < target!.c; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press(target!.v === CAT ? 'c' : 'd');
  await page.focus(cell(target!.r, target!.c));
  await page.keyboard.press('Enter');
  await expect(page.locator(cell(target!.r, target!.c))).toHaveClass(/has-pet/);
  await expect(page.locator(cell(target!.r, target!.c))).toHaveAttribute('aria-label', /, (cat|dog)/);
});
