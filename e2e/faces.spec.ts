/**
 * Facial-only motion audit in a real browser.
 *
 * While a level is played (placements, a proximity conflict, a long-press, hints, the win),
 * every running animation/transition reported by document.getAnimations() must target a part
 * inside `.board .pet .face`, and no cell or pet <svg> may change position or size.
 */
import { expect, test, type Page } from '@playwright/test';
import { campaignPuzzle, firstLevelOfSize } from './helpers';
import { CAT, DOG, EMPTY } from '../src/engine/types';

async function start(page: Page, level: number, extra: Record<string, string> = {}) {
  await page.goto('/');
  await page.evaluate(
    ([lvl, more]) => {
      localStorage.clear();
      localStorage.setItem('cd.v2.flags', JSON.stringify({ seenRules: true, tutorialDone: true }));
      localStorage.setItem('cd.v2.settings', JSON.stringify({ inputMode: 'cycle', defaultMode: 'challenge' }));
      localStorage.setItem('cd.v2.progress', JSON.stringify({ v: 2, level: lvl, bestTimes: {}, dailyDone: {}, streak: 0, lastDailyDate: null, installDate: new Date().toISOString(), removeAds: false }));
      for (const [k, v] of Object.entries(more)) localStorage.setItem(k, v);
    },
    [level, extra] as const,
  );
  await page.reload();
  await page.click('[data-act="play"]');
}

function puzzle(level: number) {
  return campaignPuzzle(level);
}

const cell = (r: number, c: number) => `.cell[data-r="${r}"][data-c="${c}"]`;

async function place(page: Page, r: number, c: number, species: number) {
  await page.click(`[data-tool="${species === CAT ? 'cat' : 'dog'}"]`);
  await page.click(cell(r, c));
  await page.click(cell(r, c));
}

async function installAudit(page: Page) {
  await page.evaluate(() => {
    const audit = { violations: [] as string[], maxFaces: 0, faceAnimations: 0, moved: [] as string[] };
    (window as unknown as { __audit: typeof audit }).__audit = audit;
    const rects = new WeakMap<Element, string>();
    const sig = (el: Element) => {
      const r = el.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map((v) => v.toFixed(1)).join(',');
    };
    const describe = (t: Element | null) => (t ? `${t.tagName}.${(t.getAttribute('class') ?? '').replace(/\s+/g, '.')}` : 'null');
    function tick() {
      for (const a of document.getAnimations()) {
        const t = (a.effect as KeyframeEffect | null)?.target ?? null;
        if (!t || !t.closest('.board .pet .face')) audit.violations.push(describe(t));
        else audit.faceAnimations++;
      }
      audit.maxFaces = Math.max(audit.maxFaces, document.querySelectorAll('.board svg.pet[data-face]').length);
      for (const el of document.querySelectorAll('.board .cell, .board svg.pet, .board')) {
        const now = sig(el);
        const before = rects.get(el);
        if (before && before !== now) audit.moved.push(`${describe(el)} ${before} → ${now}`);
        rects.set(el, now);
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

async function audit(page: Page) {
  return page.evaluate(() => (window as unknown as { __audit: { violations: string[]; maxFaces: number; faceAnimations: number; moved: string[] } }).__audit);
}

for (const level of [1, firstLevelOfSize(9)]) {
  test(`only facial parts move while playing a ${level === 1 ? '5×5' : '9×9'} level to the win`, async ({ page }) => {
    const p = puzzle(level);
    await start(page, level);
    await installAudit(page);
    const given = new Set(p.givens.map((g) => `${g.r},${g.c}`));
    const todo: Array<[number, number, number]> = [];
    for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (p.solution[r][c] !== EMPTY && !given.has(`${r},${c}`)) todo.push([r, c, p.solution[r][c]]);

    // One correct placement → happy face.
    for (const [r, c, s] of todo.slice(0, 1)) await place(page, r, c, s);

    // A proximity conflict: put the other species beside a placed pet where nothing else is
    // violated (no same-species pet in that row, column or region), so adjacency is the reason.
    const placed = new Map<string, number>();
    for (const g of p.givens) placed.set(`${g.r},${g.c}`, g.kind);
    for (const [r, c, s] of todo.slice(0, 1)) placed.set(`${r},${c}`, s);
    const onlyAdjacency = (r: number, c: number, s: number) => {
      for (const [k, v] of placed) {
        if (v !== s) continue;
        const [pr, pc] = k.split(',').map(Number);
        if (pr === r || pc === c || p.regions[pr][pc] === p.regions[r][c]) return false;
      }
      return !placed.has(`${r},${c}`) && !given.has(`${r},${c}`);
    };
    let conflict: { pet: [number, number]; at: [number, number]; s: number } | null = null;
    const candidates: Array<[number, number, number]> = [...todo.slice(0, 1), ...p.givens.map((g) => [g.r, g.c, g.kind] as [number, number, number])];
    for (const [r, c, s] of candidates) {
      const other = s === CAT ? DOG : CAT;
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= p.size || cc >= p.size) continue;
        if (onlyAdjacency(rr, cc, other)) {
          conflict = { pet: [r, c], at: [rr, cc], s: other };
          break;
        }
      }
      if (conflict) break;
    }
    expect(conflict).not.toBeNull();
    const [cr, cc] = conflict!.pet;
    const [br, bc] = conflict!.at;
    await page.click(`[data-tool="${conflict!.s === CAT ? 'cat' : 'dog'}"]`);
    await page.click(cell(br, bc));
    await page.click(cell(br, bc));
    await page.waitForTimeout(100);
    // The crowded pet reacts with a face (annoyed cat / surprised dog); the empty cell gets none.
    const reacted = await page.locator(`${cell(cr, cc)} svg.pet`).getAttribute('data-face');
    expect(['annoyed', 'surprised']).toContain(reacted);
    await expect(page.locator(`${cell(br, bc)} svg.pet`)).toHaveCount(0);
    await expect(page.locator('[data-status]')).toContainText('side by side');
    if (await page.locator(`${cell(br, bc)}.mark`).count()) await page.click(cell(br, bc)); // clear the ✕ again

    // Long-press a pet: content face, cell unchanged.
    const box = (await page.locator(cell(cr, cc)).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
    await expect(page.locator(`${cell(cr, cc)} svg.pet`)).toHaveAttribute('data-face', 'content');
    await expect(page.locator(cell(cr, cc))).toHaveClass(/has-pet/);

    // Finish the board → staggered celebration inside tiles, then the static result.
    for (const [r, c, s] of todo.slice(1)) await place(page, r, c, s);
    await page.waitForTimeout(400);
    const mid = await page.locator('.board svg.pet[data-face="celebrate"]').count();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThanOrEqual(6);
    await expect(page.locator('.overlay [data-act="next"]')).toBeVisible({ timeout: 6000 });

    const a = await audit(page);
    expect(a.violations, `non-face animations: ${a.violations.slice(0, 5).join(' | ')}`).toEqual([]);
    expect(a.moved, `moved: ${a.moved.slice(0, 5).join(' | ')}`).toEqual([]);
    expect(a.faceAnimations).toBeGreaterThan(0);
    expect(a.maxFaces).toBeLessThanOrEqual(6);
  });
}

test('every expression keeps every facial part inside its own tile (5×5 and 9×9)', async ({ page }) => {
  for (const level of [1, firstLevelOfSize(9)]) {
    const p = puzzle(level);
    await start(page, level);
    // Make sure both species are on the board.
    const given = new Set(p.givens.map((g) => `${g.r},${g.c}`));
    let haveCat = p.givens.some((g) => g.kind === CAT);
    let haveDog = p.givens.some((g) => g.kind === DOG);
    for (let r = 0; r < p.size && !(haveCat && haveDog); r++)
      for (let c = 0; c < p.size && !(haveCat && haveDog); c++) {
        const s = p.solution[r][c];
        if (s === EMPTY || given.has(`${r},${c}`)) continue;
        if ((s === CAT && !haveCat) || (s === DOG && !haveDog)) {
          await place(page, r, c, s);
          if (s === CAT) haveCat = true;
          else haveDog = true;
        }
      }
    await page.waitForTimeout(800);
    const result = await page.evaluate(async () => {
      const states = ['neutral', 'blink', 'happy', 'annoyed', 'surprised', 'puzzled', 'thinking', 'worried', 'celebrate', 'content'];
      const problems: string[] = [];
      const pets = [...document.querySelectorAll('.board svg.pet')] as SVGSVGElement[];
      const baseSig = new Map<SVGSVGElement, string>();
      const sig = (el: Element) => {
        const r = el.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map((v) => v.toFixed(2)).join(',');
      };
      for (const pet of pets) baseSig.set(pet, [pet, ...pet.querySelectorAll('.pet__base *')].map(sig).join('|'));
      for (const state of states) {
        for (const pet of pets) state === 'neutral' ? pet.removeAttribute('data-face') : pet.setAttribute('data-face', state);
        await new Promise((r) => setTimeout(r, state === 'blink' ? 80 : 260));
        for (const pet of pets) {
          const cell = pet.closest('.cell')!.getBoundingClientRect();
          for (const part of pet.querySelectorAll('.face *')) {
            const style = getComputedStyle(part);
            if (style.opacity === '0') continue;
            const r = part.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            const eps = 0.6;
            if (r.left < cell.left - eps || r.top < cell.top - eps || r.right > cell.right + eps || r.bottom > cell.bottom + eps)
              problems.push(`${state}: ${part.getAttribute('class')} leaves its tile`);
          }
          const nowSig = [pet, ...pet.querySelectorAll('.pet__base *')].map(sig).join('|');
          if (nowSig !== baseSig.get(pet)) problems.push(`${state}: silhouette or svg moved`);
        }
      }
      for (const pet of pets) pet.removeAttribute('data-face');
      return { problems, pets: pets.length, cellPx: document.querySelector('.board .cell')!.getBoundingClientRect().width };
    });
    expect(result.pets).toBeGreaterThanOrEqual(2);
    expect(result.problems).toEqual([]);
    await page.goto('/');
  }
});

test('reduced motion: playing produces no animations at all', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const p = puzzle(1);
  await start(page, 1);
  await installAudit(page);
  const given = new Set(p.givens.map((g) => `${g.r},${g.c}`));
  let n = 0;
  for (let r = 0; r < p.size && n < 3; r++)
    for (let c = 0; c < p.size && n < 3; c++)
      if (p.solution[r][c] !== EMPTY && !given.has(`${r},${c}`)) {
        await place(page, r, c, p.solution[r][c]);
        n++;
      }
  await page.waitForTimeout(300);
  const a = await audit(page);
  expect(a.faceAnimations).toBe(0);
  expect(a.violations).toEqual([]);
  await ctx.close();
});
