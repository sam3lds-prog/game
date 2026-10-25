import { expect, test } from '@playwright/test';
import { generatePuzzle } from '../src/engine/generator';
import { levelSpec } from '../src/engine/levels';
import { CAT, EMPTY } from '../src/engine/types';

test('closing the app mid-level and returning restores board, tool, hearts and timer', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('cvd.seenRules', '1');
  });
  await page.reload();
  await page.click('[data-act="play"]');

  const spec = levelSpec(1);
  const p = generatePuzzle({ size: spec.size, seed: spec.seed, difficulty: spec.difficulty });
  const given = new Set(p.givens.map((g) => `${g.r},${g.c}`));
  let markCell = '';
  let catCell = '';
  for (let r = 0; r < p.size; r++)
    for (let c = 0; c < p.size; c++) {
      if (given.has(`${r},${c}`)) continue;
      if (!markCell && p.solution[r][c] === EMPTY) markCell = `.cell[data-r="${r}"][data-c="${c}"]`;
      if (!catCell && p.solution[r][c] === CAT) catCell = `.cell[data-r="${r}"][data-c="${c}"]`;
    }
  await page.click(markCell);
  await page.click(catCell);
  await page.click(catCell);
  await page.click('[data-tool="dog"]');
  await page.waitForTimeout(2200);

  await page.reload(); // like the app being closed and reopened
  await expect(page.locator('[data-act="play"] .left > span').first()).toHaveText('Continue');
  await page.click('[data-act="play"]');
  await expect(page.locator(markCell)).toHaveClass(/mark/);
  await expect(page.locator(catCell)).toHaveClass(/has-pet/);
  await expect(page.locator('[data-tool="dog"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-hearts]')).toHaveAttribute('aria-label', '3 of 3 hearts left');
  const t = await page.locator('[data-timer]').textContent();
  expect(t).toMatch(/^0:0[2-9]$/);
});
