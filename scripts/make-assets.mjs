/**
 * Generates the app icon (1024, opaque RGB), splash images, web touch icon and a store icon from
 * the same original cat & dog art used in the game.
 *
 *   node scripts/make-assets.mjs
 *
 * Icon idea: a little board where the cat and the dog sit diagonally — the one way they may touch.
 */
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const icons = readFileSync('src/game/icons.ts', 'utf8');
const pick = (name) => {
  const base = icons.match(new RegExp(`const ${name}_BASE = \`([\\s\\S]*?)\`;`))[1];
  const face = icons.match(new RegExp(`const ${name}_FACE = \`([\\s\\S]*?)\`;`))[1];
  const consts = Object.fromEntries([...icons.matchAll(/const ([A-Z_0-9]+) = '(#[0-9A-Fa-f]{6})';/g)].map((m) => [m[1], m[2]]));
  return (base + face).replace(/\$\{([A-Z_0-9]+)\}/g, (_, k) => consts[k]);
};
const CAT = pick('CAT');
const DOG = pick('DOG');
const faceCss = `.eye-happy,.brow,.cheek,.mouth{opacity:0}.mouth--smile{opacity:1}.cheek{opacity:.55}.lid{display:none}`;

function iconSvg(size) {
  const cell = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <style>${faceCss}</style>
    <rect width="${size}" height="${size}" fill="#FBF7EF"/>
    <rect x="0" y="0" width="${cell}" height="${cell}" fill="#FFD6D6"/>
    <rect x="${cell}" y="0" width="${cell}" height="${cell}" fill="#BFE3F6"/>
    <rect x="0" y="${cell}" width="${cell}" height="${cell}" fill="#C9EFB8"/>
    <rect x="${cell}" y="${cell}" width="${cell}" height="${cell}" fill="#FFE1AD"/>
    <path d="M${cell} 0 V${size} M0 ${cell} H${size}" stroke="#2B2420" stroke-width="${size * 0.03}"/>
    <svg x="${cell * 0.06}" y="${cell * 0.06}" width="${cell * 0.88}" height="${cell * 0.88}" viewBox="0 0 64 64">${CAT}</svg>
    <svg x="${cell * 1.06}" y="${cell * 1.06}" width="${cell * 0.88}" height="${cell * 0.88}" viewBox="0 0 64 64">${DOG}</svg>
  </svg>`;
}

function splashSvg(size) {
  const art = size * 0.16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <style>${faceCss}</style>
    <rect width="${size}" height="${size}" fill="#FBF7EF"/>
    <svg x="${size / 2 - art * 1.05}" y="${size / 2 - art / 2}" width="${art}" height="${art}" viewBox="0 0 64 64">${CAT}</svg>
    <svg x="${size / 2 + art * 0.05}" y="${size / 2 - art / 2}" width="${art}" height="${art}" viewBox="0 0 64 64">${DOG}</svg>
  </svg>`;
}

async function render(page, svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } });
  // Re-encode as opaque RGB (App Store rejects icons with an alpha channel).
  const src = PNG.sync.read(buf);
  const out = new PNG({ width: size, height: size, colorType: 2, inputColorType: 6, inputHasAlpha: true });
  out.data = src.data;
  return PNG.sync.write(out, { colorType: 2, inputColorType: 6, inputHasAlpha: true });
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
const icon1024 = await render(page, iconSvg(1024), 1024);
writeFileSync('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', icon1024);
mkdirSync('docs/store', { recursive: true });
writeFileSync('docs/store/icon-1024.png', icon1024);
writeFileSync('public/apple-touch-icon.png', await render(page, iconSvg(180), 180));
const splash = await render(page, splashSvg(2732), 2732);
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) writeFileSync(`ios/App/App/Assets.xcassets/Splash.imageset/${f}`, splash);
await browser.close();
console.log('icon, touch icon and splash written');
