/**
 * Original cat & dog art as layered inline SVG (viewBox 0 0 64 64).
 *
 * Contract (see docs/faces.md):
 *  - `.pet__base` holds the stationary silhouette: ears, head, muzzle, nose, markings.
 *    Nothing in it may ever animate.
 *  - `.face` holds the only parts that may change: `.pupil`, `.shine`, `.eye-happy`, `.lid`,
 *    `.brow`, `.mouth--*`, `.cheek`.
 *  - No `id` attributes (many copies live on one page). Colorable parts use classes
 *    (`.fur`, `.fur-2`, `.muzzle`, `.nose`) so coats can be swapped by CSS.
 *  - `.detail` marks micro-details hidden on compact boards.
 *
 * FACE_GEOMETRY records each animatable part's bounding box so tests can prove that every
 * expression stays inside the head and inside the tile.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const VIEWBOX: Box = { x0: 0, y0: 0, x1: 64, y1: 64 };

const INK = '#2B2420';

// ---------------------------------------------------------------- cat
const CAT_FUR = '#F4A261';
const CAT_FUR2 = '#F7C9A3';
const CAT_MUZZLE = '#FBE3C9';

const CAT_BASE = `
  <g class="pet__base">
    <path class="fur" fill="${CAT_FUR}" d="M12 32 L10 8 L28 19 Z"/>
    <path class="fur" fill="${CAT_FUR}" d="M52 32 L54 8 L36 19 Z"/>
    <path class="fur-2" fill="${CAT_FUR2}" d="M14.5 28 L13.5 14 L24.5 20.5 Z"/>
    <path class="fur-2" fill="${CAT_FUR2}" d="M49.5 28 L50.5 14 L39.5 20.5 Z"/>
    <ellipse class="fur" fill="${CAT_FUR}" cx="32" cy="37" rx="22" ry="19"/>
    <path class="detail stripe" stroke="#E08A45" stroke-width="1.6" stroke-linecap="round" fill="none" d="M28 20 q1.2 2.5 0 5 M32 19 v5.5 M36 20 q-1.2 2.5 0 5"/>
    <ellipse class="muzzle" fill="${CAT_MUZZLE}" cx="32" cy="47" rx="11.5" ry="7.5"/>
    <path class="nose" fill="#E76F51" d="M29.4 41.6 h5.2 l-2.6 3 Z"/>
    <path class="detail whiskers" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" fill="none" d="M7 43 L19 45 M7 49 L19 48.5 M57 43 L45 45 M57 49 L45 48.5"/>
  </g>`;

const CAT_FACE = `
  <g class="face">
    <ellipse class="cheek" fill="#F28B82" cx="18.5" cy="45" rx="3.6" ry="2.2"/>
    <ellipse class="cheek" fill="#F28B82" cx="45.5" cy="45" rx="3.6" ry="2.2"/>
    <g class="eye eye--l">
      <ellipse class="pupil" fill="${INK}" cx="24" cy="34" rx="3.4" ry="4"/>
      <circle class="shine detail" fill="#fff" cx="25.2" cy="32.4" r="1.1"/>
    </g>
    <g class="eye eye--r">
      <ellipse class="pupil" fill="${INK}" cx="40" cy="34" rx="3.4" ry="4"/>
      <circle class="shine detail" fill="#fff" cx="41.2" cy="32.4" r="1.1"/>
    </g>
    <path class="eye-happy" stroke="${INK}" stroke-width="2" stroke-linecap="round" fill="none" d="M20.4 35 q3.6 -4.2 7.2 0 M36.4 35 q3.6 -4.2 7.2 0"/>
    <g class="lid lid--l"><ellipse class="fur" fill="${CAT_FUR}" cx="24" cy="34" rx="4.6" ry="5"/><path stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none" d="M19.6 37.6 q4.4 2.4 8.8 0"/></g>
    <g class="lid lid--r"><ellipse class="fur" fill="${CAT_FUR}" cx="40" cy="34" rx="4.6" ry="5"/><path stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none" d="M35.6 37.6 q4.4 2.4 8.8 0"/></g>
    <path class="brow brow--l" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" fill="none" d="M20 27.4 q4 -1.6 8 0"/>
    <path class="brow brow--r" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" fill="none" d="M36 27.4 q4 -1.6 8 0"/>
    <path class="mouth mouth--neutral" stroke="${INK}" stroke-width="1.7" stroke-linecap="round" fill="none" d="M32 44.6 q-2.6 3 -5.2 1.2 M32 44.6 q2.6 3 5.2 1.2"/>
    <path class="mouth mouth--smile" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" fill="none" d="M32 44.6 q-3.2 4.4 -6.8 1.6 M32 44.6 q3.2 4.4 6.8 1.6"/>
    <path class="mouth mouth--grin" fill="#7A2E22" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round" d="M26.2 46 q5.8 6.6 11.6 0 Z"/>
    <path class="mouth mouth--frown" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" fill="none" d="M27.6 49.4 q4.4 -4 8.8 0"/>
    <path class="mouth mouth--flat" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" fill="none" d="M28.4 48.2 L35.6 47.2"/>
    <path class="mouth mouth--wavy" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none" d="M27 48.4 q1.25 -1.5 2.5 0 t2.5 0 t2.5 0 t2.5 0"/>
    <ellipse class="mouth mouth--o" fill="#5A2A20" cx="32" cy="48" rx="2.1" ry="2.5"/>
  </g>`;

// ---------------------------------------------------------------- dog
const DOG_FUR = '#A67B5B';
const DOG_FUR2 = '#6D4C3D';
const DOG_MUZZLE = '#E9D3BC';

const DOG_BASE = `
  <g class="pet__base">
    <ellipse class="fur-2" fill="${DOG_FUR2}" cx="13" cy="34" rx="7" ry="13"/>
    <ellipse class="fur-2" fill="${DOG_FUR2}" cx="51" cy="34" rx="7" ry="13"/>
    <ellipse class="fur" fill="${DOG_FUR}" cx="32" cy="36" rx="20" ry="18.5"/>
    <path class="detail blaze" fill="#C49A76" d="M29.6 18.4 q2.4 -0.8 4.8 0 l-0.8 9 h-3.2 Z"/>
    <ellipse class="muzzle" fill="${DOG_MUZZLE}" cx="32" cy="46" rx="11" ry="7.6"/>
    <ellipse class="nose" fill="${INK}" cx="32" cy="41.6" rx="4.2" ry="3"/>
  </g>`;

const DOG_FACE = `
  <g class="face">
    <ellipse class="cheek" fill="#F28B82" cx="19.6" cy="44" rx="3.4" ry="2.1"/>
    <ellipse class="cheek" fill="#F28B82" cx="44.4" cy="44" rx="3.4" ry="2.1"/>
    <g class="eye eye--l">
      <ellipse class="pupil" fill="${INK}" cx="24.5" cy="32.4" rx="3.3" ry="3.8"/>
      <circle class="shine detail" fill="#fff" cx="25.6" cy="31" r="1.05"/>
    </g>
    <g class="eye eye--r">
      <ellipse class="pupil" fill="${INK}" cx="39.5" cy="32.4" rx="3.3" ry="3.8"/>
      <circle class="shine detail" fill="#fff" cx="40.6" cy="31" r="1.05"/>
    </g>
    <path class="eye-happy" stroke="${INK}" stroke-width="2" stroke-linecap="round" fill="none" d="M21 33.4 q3.5 -4 7 0 M36 33.4 q3.5 -4 7 0"/>
    <g class="lid lid--l"><ellipse class="fur" fill="${DOG_FUR}" cx="24.5" cy="32.4" rx="4.4" ry="4.8"/><path stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none" d="M20.3 35.8 q4.2 2.3 8.4 0"/></g>
    <g class="lid lid--r"><ellipse class="fur" fill="${DOG_FUR}" cx="39.5" cy="32.4" rx="4.4" ry="4.8"/><path stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none" d="M35.3 35.8 q4.2 2.3 8.4 0"/></g>
    <path class="brow brow--l" stroke="${DOG_FUR2}" stroke-width="2.2" stroke-linecap="round" fill="none" d="M20.6 26 q3.9 -1.6 7.8 0"/>
    <path class="brow brow--r" stroke="${DOG_FUR2}" stroke-width="2.2" stroke-linecap="round" fill="none" d="M35.6 26 q3.9 -1.6 7.8 0"/>
    <path class="mouth mouth--neutral" stroke="${INK}" stroke-width="1.7" stroke-linecap="round" fill="none" d="M32 44.6 v2.4 M32 47 q-3 2.6 -6 0.4 M32 47 q3 2.6 6 0.4"/>
    <path class="mouth mouth--smile" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" fill="none" d="M32 44.6 v2 M24.8 46.4 q7.2 6.4 14.4 0"/>
    <g class="mouth mouth--grin"><path fill="#7A2E22" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round" d="M25.4 46.4 q6.6 8 13.2 0 Z"/><ellipse fill="#E76F51" cx="32" cy="50.6" rx="3" ry="1.9"/></g>
    <path class="mouth mouth--frown" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" fill="none" d="M32 44.6 v2.4 M27.2 50.4 q4.8 -4 9.6 0"/>
    <path class="mouth mouth--flat" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" fill="none" d="M32 44.6 v2.4 M28.4 49 L35.6 48"/>
    <path class="mouth mouth--wavy" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none" d="M32 44.6 v2 M26.6 49.4 q1.35 -1.5 2.7 0 t2.7 0 t2.7 0 t2.7 0"/>
    <g class="mouth mouth--o"><path stroke="${INK}" stroke-width="1.7" stroke-linecap="round" d="M32 44.6 v2"/><ellipse fill="#5A2A20" cx="32" cy="49" rx="2.1" ry="2.5"/></g>
  </g>`;

export const CAT_SVG = `<svg class="pet pet--cat" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${CAT_BASE}${CAT_FACE}</svg>`;
export const DOG_SVG = `<svg class="pet pet--dog" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${DOG_BASE}${DOG_FACE}</svg>`;

export const MARK_SVG = `<svg class="mark-x" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <path d="M20 20 L44 44 M44 20 L20 44" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
</svg>`;

export const HEART_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 21s-7.5-4.6-9.6-9.1C.8 8.3 3 4.5 6.6 4.5c2 0 3.5 1.1 4.4 2.5.9-1.4 2.4-2.5 4.4-2.5 3.6 0 5.8 3.8 4.2 7.4C19.5 16.4 12 21 12 21z"/></svg>`;

/**
 * Bounding boxes (viewBox units) of the head silhouette and each animatable part, including
 * stroke half-widths. Kept next to the markup they describe; test/animal-faces.test.ts checks
 * that every expression transform keeps these parts inside the head box.
 */
export const FACE_GEOMETRY = {
  cat: {
    head: { x0: 10, y0: 8, x1: 54, y1: 56 },
    parts: {
      pupil: { x0: 20.6, y0: 30, x1: 43.4, y1: 38 },
      shine: { x0: 24.1, y0: 31.3, x1: 42.3, y1: 33.5 },
      'eye-happy': { x0: 19.4, y0: 30.8, x1: 44.6, y1: 36 },
      lid: { x0: 19.4, y0: 29, x1: 44.6, y1: 40.2 },
      brow: { x0: 19.1, y0: 25.3, x1: 44.9, y1: 28.3 },
      mouth: { x0: 25.4, y0: 43.7, x1: 38.6, y1: 51.7 },
      cheek: { x0: 14.9, y0: 42.8, x1: 49.1, y1: 47.2 },
    },
  },
  dog: {
    head: { x0: 6, y0: 17.5, x1: 58, y1: 54.5 },
    parts: {
      pupil: { x0: 21.2, y0: 28.6, x1: 42.8, y1: 36.2 },
      shine: { x0: 24.5, y0: 29.9, x1: 41.7, y1: 32.1 },
      'eye-happy': { x0: 20, y0: 29.4, x1: 44, y1: 34.4 },
      lid: { x0: 20.1, y0: 27.6, x1: 43.9, y1: 38.1 },
      brow: { x0: 19.5, y0: 23.7, x1: 44.5, y1: 27.1 },
      mouth: { x0: 24, y0: 43.7, x1: 40, y1: 53.6 },
      cheek: { x0: 16.2, y0: 41.9, x1: 47.8, y1: 46.1 },
    },
  },
} as const;
