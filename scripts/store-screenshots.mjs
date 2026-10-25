/**
 * App Store screenshots at 1290×2796 (6.7"/6.9" iPhone slot) from the production build.
 *   npx vite preview --port 4173 &  node scripts/store-screenshots.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const base = process.env.SHOTS_URL ?? 'http://localhost:4173';
const out = 'docs/store/screenshots';
mkdirSync(out, { recursive: true });
const catalog = JSON.parse(readFileSync('src/content/catalog.v1.json', 'utf8'));
const decode = (e) => ({ n: e.size, sol: e.solution, givens: new Set(e.givens.split(',').map((g) => Number(g.slice(1)))) });

const veteran = (level, extra = {}) => ({
  'cd.v2.flags': JSON.stringify({ seenRules: true, tutorialDone: true }),
  'cd.v2.progress': JSON.stringify({ v: 2, level, bestTimes: {}, dailyDone: {}, streak: 6, lastDailyDate: null, installDate: '2026-10-01T00:00:00Z', removeAds: false }),
  ...extra,
});
const daily = {};
for (const d of ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']) daily[d] = { solvedOn: d, seconds: 240 };
const records = {
  v: 1, total: 31, firstTime: 27, zeroMistake: 14, perfect: 8, hints: 12, expert: 1, noHintChallenge: 3, dailyTotal: 7, completed: {}, daily, bestStreak: 7,
  recent: [5, 6, 6, 7, 7, 7, 8, 8, 9].map((size, i) => ({ id: `c${i}`, kind: 'level', size, difficulty: 'medium', mode: 'zen', seconds: 50 + size * 22 + i * 9, mistakes: 0, hints: 0, on: '2026-11-0' + (1 + (i % 6)) })),
  awards: { 'first-solve': '2026-10-20', 'solves-10': '2026-10-24', 'solves-25': '2026-11-05', 'daily-7': '2026-11-07', 'first-perfect': '2026-10-21', 'first-expert': '2026-11-03', 'no-hint-challenge': '2026-10-28', 'streak-7': '2026-11-07' },
  coats: { cat: ['ginger', 'smoke', 'shadow', 'cream', 'snow'], dog: ['cocoa', 'golden', 'slate', 'biscuit'] },
  selected: { cat: 'ginger', dog: 'cocoa' },
};

async function partlySolved(page, level, fraction) {
  const e = decode(catalog.campaign[level - 1]);
  let placed = 0;
  const total = [...e.sol].filter((ch) => ch !== '.').length - e.givens.size;
  for (let i = 0; i < e.sol.length && placed < total * fraction; i++) {
    const ch = e.sol[i];
    if (ch === '.' || e.givens.has(i)) continue;
    await page.click(`[data-tool="${ch === 'c' ? 'cat' : 'dog'}"]`);
    await page.click(`.cell[data-r="${Math.floor(i / e.n)}"][data-c="${i % e.n}"]`);
    placed++;
  }
  await page.waitForTimeout(800);
}

const shots = [
  { name: '1-play', storage: veteran(40, { 'cd.v2.settings': JSON.stringify({ faces: 'on' }) }), run: async (p) => { await p.click('[data-act="play"]'); await partlySolved(p, 40, 0.55); await p.evaluate(() => { const pets = [...document.querySelectorAll('.board svg.pet')]; pets.slice(-3).forEach((el, i) => el.setAttribute('data-face', ['happy', 'content', 'happy'][i])); }); } },
  { name: '2-tutorial', storage: {}, run: async (p) => { await p.click('[data-act="tutorial"]'); } },
  { name: '3-hint', storage: veteran(60), run: async (p) => { await p.click('[data-act="play"]'); await partlySolved(p, 60, 0.3); await p.click('[data-act="hint"]'); } },
  { name: '4-calendar', storage: veteran(28, { 'cd.v2.records': JSON.stringify(records) }), run: async (p) => { await p.click('[data-act="calendar"]'); } },
  { name: '5-pets', storage: veteran(28, { 'cd.v2.records': JSON.stringify(records) }), run: async (p) => { await p.click('[data-act="collection"]'); } },
  { name: '6-dark-9x9', storage: veteran(120, { 'cd.v2.settings': JSON.stringify({ theme: 'dark', defaultMode: 'challenge' }) }), run: async (p) => { await p.click('[data-act="play"]'); await partlySolved(p, 120, 0.4); } },
];

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(2026, 10, 7, 10));
  await page.goto(base);
  await page.evaluate((st) => { localStorage.clear(); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, s.storage);
  await page.reload();
  await s.run(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${s.name}.png` });
  await ctx.close();
}
await browser.close();
console.log(`store screenshots → ${out}`);
