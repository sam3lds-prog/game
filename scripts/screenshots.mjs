/**
 * Captures home + game screens at real iPhone point sizes from a running preview server.
 *
 *   npx vite preview --port 4173 &
 *   node scripts/screenshots.mjs docs/baseline
 *
 * Optional: SHOTS_URL (default http://localhost:4173), SHOTS_SCALE (default 2).
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'docs/screens';
const base = process.env.SHOTS_URL ?? 'http://localhost:4173';
const scale = Number(process.env.SHOTS_SCALE ?? 2);
mkdirSync(out, { recursive: true });

const devices = [
  { name: 'se1-320', width: 320, height: 568 },
  { name: 'se3-375', width: 375, height: 667 },
  { name: 'iphone15-393', width: 393, height: 852 },
  { name: 'promax-430', width: 430, height: 932 },
];

// Each scenario seeds storage, then runs steps. Keys cover v1 and v2 storage layouts.
const scenarios = [
  { name: 'home', storage: {}, steps: [] },
  { name: 'board-5x5', storage: {}, steps: ['[data-act="play"]'] },
  {
    name: 'board-9x9',
    storage: { 'cvd.progress.v1': JSON.stringify({ level: 80, installDate: new Date().toISOString() }) },
    steps: ['[data-act="play"]'],
  },
];

const browser = await chromium.launch();
for (const d of devices) {
  const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: scale, isMobile: true, hasTouch: true });
  for (const s of scenarios) {
    const page = await ctx.newPage();
    await page.goto(base);
    await page.evaluate((st) => {
      localStorage.clear();
      localStorage.setItem('cvd.seenRules', '1');
      for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v);
    }, s.storage);
    await page.reload();
    for (const sel of s.steps) await page.click(sel);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${s.name}-${d.name}.png` });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(`screenshots → ${out}`);
