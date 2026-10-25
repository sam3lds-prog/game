// @vitest-environment happy-dom
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimalFaceController, type FaceHost } from '../src/game/animalFaces';
import { EVENT_PRIORITY, LIMITS, REACTIONS, SPEC_RANGES, wavePlan, type FaceEvent } from '../src/game/faceExpressions';
import { CAT_SVG, DOG_SVG, FACE_GEOMETRY } from '../src/game/icons';
import { faceCuesFor } from '../src/game/events';

// ---------------------------------------------------------------- test host
function makeHost(n: number, pets: Array<[number, number, 'cat' | 'dog']>): FaceHost & { root: HTMLElement; els: Map<string, SVGSVGElement> } {
  const root = document.createElement('div');
  const els = new Map<string, SVGSVGElement>();
  for (const [r, c, sp] of pets) {
    const cell = document.createElement('div');
    cell.innerHTML = sp === 'cat' ? CAT_SVG : DOG_SVG;
    root.appendChild(cell);
    els.set(`${r},${c}`, cell.querySelector('svg')!);
  }
  return {
    root,
    els,
    size: n,
    petEl: (r, c) => els.get(`${r},${c}`) ?? null,
    occupied: () => [...els.keys()].map((k) => k.split(',').map(Number)).map(([r, c]) => ({ r, c })),
  };
}
const face = (h: ReturnType<typeof makeHost>, r: number, c: number) => h.els.get(`${r},${c}`)!.getAttribute('data-face');
const activeFaces = (h: ReturnType<typeof makeHost>) => [...h.els.values()].filter((e) => e.hasAttribute('data-face')).length;

let clock = 0;
beforeEach(() => {
  vi.useFakeTimers();
  clock = 0;
});
afterEach(() => vi.useRealTimers());
function advance(ms: number) {
  clock += ms;
  vi.advanceTimersByTime(ms);
}

// ---------------------------------------------------------------- tables
describe('expression tables', () => {
  it('every reaction duration is inside the spec range', () => {
    for (const sp of ['cat', 'dog'] as const)
      for (const ev of Object.keys(SPEC_RANGES) as FaceEvent[]) {
        const [lo, hi] = SPEC_RANGES[ev];
        expect(REACTIONS[sp][ev].ms, `${sp}/${ev}`).toBeGreaterThanOrEqual(lo);
        expect(REACTIONS[sp][ev].ms, `${sp}/${ev}`).toBeLessThanOrEqual(hi);
      }
  });

  it('priority order is won > lost > invalid > correct > hint > pet > idle', () => {
    const p = EVENT_PRIORITY;
    expect(p.won > p.lost && p.lost > p.invalid_adjacent && p.invalid_adjacent === p.invalid_other).toBe(true);
    expect(p.invalid_other > p.placed_correct && p.placed_correct > p.hint && p.hint > p.pet && p.pet > p.idle).toBe(true);
  });

  it('victory sequences fit 0.8–1.5 s with at most 6 faces at once, for every board size', () => {
    for (let n = 1; n <= 18; n++) {
      const plan = wavePlan(n, 'won');
      expect(plan.totalMs, `n=${n}`).toBeGreaterThanOrEqual(800);
      expect(plan.totalMs, `n=${n}`).toBeLessThanOrEqual(1500);
      expect(Math.ceil(n / plan.waves)).toBeLessThanOrEqual(LIMITS.waveSize);
    }
  });

  it('cat and dog react differently to a proximity violation, as specified', () => {
    expect(REACTIONS.cat.invalid_adjacent.state).toBe('annoyed');
    expect(REACTIONS.dog.invalid_adjacent.state).toBe('surprised');
  });
});

// ---------------------------------------------------------------- controller
describe('AnimalFaceController', () => {
  it('reacts only on cells that hold a pet', () => {
    const h = makeHost(6, [[0, 0, 'cat']]);
    const f = new AnimalFaceController(h, { level: 'on', reducedMotion: false, now: () => clock, random: () => 0.5 });
    expect(f.react(3, 3, 'placed_correct')).toBe(false);
    expect(f.react(0, 0, 'placed_correct')).toBe(true);
    expect(face(h, 0, 0)).toBe('happy');
    advance(600);
    expect(face(h, 0, 0)).toBeNull(); // back to neutral
    f.dispose();
  });

  it('a higher-priority event interrupts a lower one, never the reverse', () => {
    const h = makeHost(6, [[0, 0, 'cat']]);
    const f = new AnimalFaceController(h, { level: 'on', reducedMotion: false, now: () => clock });
    f.react(0, 0, 'hint');
    expect(face(h, 0, 0)).toBe('thinking');
    f.react(0, 0, 'invalid_adjacent');
    expect(face(h, 0, 0)).toBe('annoyed');
    expect(f.react(0, 0, 'placed_correct')).toBe(false);
    expect(face(h, 0, 0)).toBe('annoyed');
    f.dispose();
  });

  it('debounces repeated invalid reactions on the same pet', () => {
    const h = makeHost(6, [[0, 0, 'dog']]);
    const f = new AnimalFaceController(h, { level: 'on', reducedMotion: false, now: () => clock });
    expect(f.react(0, 0, 'invalid_adjacent')).toBe(true);
    advance(100);
    expect(f.react(0, 0, 'invalid_adjacent')).toBe(false);
    advance(600);
    expect(f.react(0, 0, 'invalid_adjacent')).toBe(true);
    f.dispose();
  });

  it('caps concurrent reactions at 3 while solving', () => {
    const pets: Array<[number, number, 'cat' | 'dog']> = [0, 1, 2, 3, 4, 5].map((i) => [i, i, i % 2 ? 'dog' : 'cat']);
    const h = makeHost(6, pets);
    const f = new AnimalFaceController(h, { level: 'on', reducedMotion: false, now: () => clock });
    for (let i = 0; i < 6; i++) f.react(i, i, 'hint');
    expect(activeFaces(h)).toBe(3);
    // A higher-priority reaction displaces a lower one instead of exceeding the cap.
    f.react(5, 5, 'invalid_other');
    expect(activeFaces(h)).toBe(3);
    expect(face(h, 5, 5)).toBe('puzzled');
    f.dispose();
  });

  it('idle blinks are random per animal, 10–20 s apart, and never exceed two at once', () => {
    const pets: Array<[number, number, 'cat' | 'dog']> = [];
    for (let i = 0; i < 10; i++) pets.push([i % 7, (i * 3) % 7, i % 2 ? 'dog' : 'cat']);
    const h = makeHost(7, pets);
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const f = new AnimalFaceController(h, { level: 'on', reducedMotion: false, now: () => clock, random });
    let maxConcurrent = 0;
    const blinkStarts = new Map<string, number[]>();
    for (let t = 0; t < 60_000; t += 20) {
      advance(20);
      maxConcurrent = Math.max(maxConcurrent, activeFaces(h));
      for (const [k, el] of h.els) if (el.getAttribute('data-face') === 'blink') {
        const list = blinkStarts.get(k) ?? [];
        if (!list.length || clock - list[list.length - 1] > 300) list.push(clock);
        blinkStarts.set(k, list);
      }
    }
    expect(maxConcurrent).toBeLessThanOrEqual(LIMITS.maxIdleActive);
    let total = 0;
    for (const starts of blinkStarts.values()) {
      total += starts.length;
      for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(LIMITS.idleMinMs - 50);
    }
    expect(total).toBeGreaterThan(10); // they do blink
    const firstBlinks = [...blinkStarts.values()].map((s) => s[0]);
    expect(new Set(firstBlinks).size).toBeGreaterThan(firstBlinks.length / 2); // not synchronized
    f.dispose();
  });

  it('victory runs in waves of ≤ 6 faces, finishes within 1.5 s, then returns to neutral', () => {
    const pets: Array<[number, number, 'cat' | 'dog']> = [];
    for (let r = 0; r < 9; r++) {
      pets.push([r, r, 'cat']);
      pets.push([r, (r + 4) % 9, 'dog']);
    }
    const h = makeHost(9, pets);
    const f = new AnimalFaceController(h, { level: 'on', reducedMotion: false, now: () => clock });
    let done = false;
    const total = f.reactAllOccupied('won', () => (done = true));
    expect(total).toBeLessThanOrEqual(1500);
    let maxAt = 0;
    for (let t = 0; t <= 1500; t += 10) {
      advance(10);
      maxAt = Math.max(maxAt, activeFaces(h));
    }
    expect(maxAt).toBeLessThanOrEqual(6);
    expect(maxAt).toBeGreaterThan(0);
    expect(done).toBe(true);
    expect(activeFaces(h)).toBe(0);
    f.dispose();
  });

  it('pause and dispose cancel everything and return faces to neutral', () => {
    const h = makeHost(6, [[0, 0, 'cat'], [1, 3, 'dog']]);
    const f = new AnimalFaceController(h, { level: 'on', reducedMotion: false, now: () => clock });
    f.react(0, 0, 'placed_correct');
    f.react(1, 3, 'pet');
    f.pause();
    expect(activeFaces(h)).toBe(0);
    expect(f.react(0, 0, 'placed_correct')).toBe(false);
    f.resume();
    expect(f.react(0, 0, 'placed_correct')).toBe(true);
    const before = vi.getTimerCount();
    expect(before).toBeGreaterThan(0);
    f.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(activeFaces(h)).toBe(0);
  });

  it('pausing mid-celebration still completes the sequence callback', () => {
    const h = makeHost(5, [[0, 0, 'cat'], [2, 2, 'dog']]);
    const f = new AnimalFaceController(h, { level: 'on', reducedMotion: false, now: () => clock });
    let done = false;
    f.reactAllOccupied('won', () => (done = true));
    advance(100);
    f.pause();
    expect(done).toBe(true);
    expect(activeFaces(h)).toBe(0);
    f.dispose();
  });

  it('reduced motion: no idle blinks, no timed sequences; outcome faces are static', () => {
    const h = makeHost(6, [[0, 0, 'cat'], [2, 4, 'dog']]);
    const f = new AnimalFaceController(h, { level: 'on', reducedMotion: true, now: () => clock });
    advance(60_000);
    expect(activeFaces(h)).toBe(0);
    let done = false;
    expect(f.reactAllOccupied('won', () => (done = true))).toBe(0);
    expect(done).toBe(true);
    expect(face(h, 0, 0)).toBe('happy');
    expect(vi.getTimerCount()).toBe(0);
    f.dispose();
  });

  it('Off: no reactions at all; outcomes show static faces', () => {
    const h = makeHost(6, [[0, 0, 'cat']]);
    const f = new AnimalFaceController(h, { level: 'off', reducedMotion: false, now: () => clock });
    expect(f.react(0, 0, 'placed_correct')).toBe(false);
    f.reactAllOccupied('lost');
    expect(face(h, 0, 0)).toBe('worried');
    f.clearOutcome();
    expect(face(h, 0, 0)).toBeNull();
    f.dispose();
  });

  it('Minimal: direct reactions only — no idle blinks, no petting', () => {
    const h = makeHost(6, [[0, 0, 'cat']]);
    const f = new AnimalFaceController(h, { level: 'minimal', reducedMotion: false, now: () => clock });
    expect(f.react(0, 0, 'pet')).toBe(false);
    expect(f.react(0, 0, 'placed_correct')).toBe(true);
    advance(60_000);
    expect(activeFaces(h)).toBe(0);
    f.dispose();
  });

  it('never replaces the pet element it animates', () => {
    const h = makeHost(6, [[0, 0, 'dog']]);
    const el = h.els.get('0,0')!;
    const html = el.innerHTML;
    const f = new AnimalFaceController(h, { level: 'on', reducedMotion: false, now: () => clock });
    f.react(0, 0, 'placed_correct');
    expect(h.els.get('0,0')).toBe(el);
    expect(el.innerHTML).toBe(html); // only the data-face attribute changes
    f.dispose();
  });
});

// ---------------------------------------------------------------- event mapping
describe('gameplay events → face cues', () => {
  it('maps adjacency to the neighbor, duplicates to the existing pet, and invents no pet', () => {
    expect(faceCuesFor({ type: 'rejected', r: 0, c: 0, violation: 'adjacent_conflict', conflicts: [{ r: 0, c: 1 }] })).toEqual([{ r: 0, c: 1, event: 'invalid_adjacent' }]);
    expect(faceCuesFor({ type: 'rejected', r: 0, c: 0, violation: 'duplicate_species_in_row', conflicts: [{ r: 0, c: 4 }] })).toEqual([{ r: 0, c: 4, event: 'invalid_other' }]);
    expect(faceCuesFor({ type: 'rejected', r: 0, c: 0, violation: 'solution_mismatch', conflicts: [] })).toEqual([]);
    expect(faceCuesFor({ type: 'placed', r: 2, c: 3, species: 1 })).toEqual([{ r: 2, c: 3, event: 'placed_correct' }]);
    expect(faceCuesFor({ type: 'hint', focus: [{ r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 }] })).toHaveLength(2);
  });
});

// ---------------------------------------------------------------- static invariants
function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...cssFiles(p));
    else if (p.endsWith('.css')) out.push(p);
  }
  return out;
}

interface Rule {
  selector: string;
  body: string;
}
function parseRules(css: string): Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) rules.push({ selector: m[1].trim(), body: m[2] });
  return rules;
}

const FACE_PART = /(\.pupil|\.shine|\.eye-happy|\.lid(--[lr])?|\.brow(--[lr])?|\.mouth(--[a-z]+)?|\.cheek|\.face \*)$/;

describe('motion lives only in facial parts', () => {
  const files = cssFiles('src');

  it('no stylesheet other than animal-faces.css contains animation, transition, transform or keyframes', () => {
    for (const f of files) {
      if (f.endsWith('animal-faces.css')) continue;
      const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css, f).not.toMatch(/@keyframes|(^|[^-\w])(animation|transition|transform)\s*:/m);
    }
  });

  it('every moving rule in animal-faces.css targets a facial part, never the pet, cell or board', () => {
    const css = readFileSync('src/style/animal-faces.css', 'utf8');
    const rules = parseRules(css).filter((r) => !r.selector.startsWith('@') && !/^\d+%|^(from|to)$|^0%/.test(r.selector));
    let checked = 0;
    for (const rule of rules) {
      if (!/animation|transition|transform/.test(rule.body)) continue;
      if (/transform-box|transform-origin/.test(rule.body) && !/transform\s*:|animation\s*:|transition\s*:/.test(rule.body)) continue;
      for (const sel of rule.selector.split(',').map((x) => x.trim())) {
        checked++;
        expect(sel, `selector "${sel}"`).toMatch(FACE_PART);
        expect(sel).not.toMatch(/(\.pet|\.cell|\.board|svg|\.pet__base)$/);
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('keyframes only change face-part transforms', () => {
    const css = readFileSync('src/style/animal-faces.css', 'utf8');
    const kfs = css.match(/@keyframes\s+([\w-]+)/g) ?? [];
    expect(kfs).toEqual(['@keyframes face-blink']);
  });

  it('every transform keeps each facial part inside the head (and therefore the tile)', () => {
    const css = readFileSync('src/style/animal-faces.css', 'utf8');
    type Motion = { shift: number; scale: number; rotate: number };
    const perPart: Record<string, Motion> = {};
    const partOf = (sel: string) => (sel.match(/\.(pupil|shine|eye-happy|lid|brow|mouth|cheek)/) ?? [])[1];
    for (const rule of parseRules(css)) {
      const t = rule.body.match(/transform\s*:\s*([^;]+)/);
      if (!t || /^\d|from|to/.test(rule.selector)) continue;
      const shift = Math.max(0, ...[...t[1].matchAll(/translate[XY]?\(([^)]*)\)/g)].flatMap((m) => m[1].split(',').map((v) => Math.abs(parseFloat(v)))));
      const scale = Math.max(1, ...[...t[1].matchAll(/scale[XY]?\(([^)]*)\)/g)].map((m) => parseFloat(m[1])));
      const rotate = Math.max(0, ...[...t[1].matchAll(/rotate\(([^)]*)deg\)/g)].map((m) => Math.abs(parseFloat(m[1]))));
      for (const sel of rule.selector.split(',')) {
        const part = partOf(sel);
        if (!part) continue;
        const m = (perPart[part] ??= { shift: 0, scale: 1, rotate: 0 });
        m.shift = Math.max(m.shift, shift);
        m.scale = Math.max(m.scale, scale);
        m.rotate = Math.max(m.rotate, rotate);
      }
    }
    // The blink keyframes scale lids up to 1 from the top edge: never larger than the lid itself.
    expect(perPart.lid?.scale ?? 1).toBeLessThanOrEqual(1);
    for (const species of ['cat', 'dog'] as const) {
      const g = FACE_GEOMETRY[species];
      for (const [name, b] of Object.entries(g.parts)) {
        const m = perPart[name] ?? { shift: 0, scale: 1, rotate: 0 };
        // Pairs (eyes, brows) are recorded as one box; each element is about half of it.
        const w = name === 'pupil' || name === 'shine' || name === 'brow' || name === 'lid' ? (b.x1 - b.x0) / 2.6 : b.x1 - b.x0;
        const hgt = b.y1 - b.y0;
        const sin = Math.sin((m.rotate * Math.PI) / 180);
        const growX = (w * (m.scale - 1)) / 2 + (hgt * sin) / 2 + m.shift;
        const growY = (hgt * (m.scale - 1)) / 2 + (w * sin) / 2 + m.shift;
        const box = { x0: b.x0 - growX, y0: b.y0 - growY, x1: b.x1 + growX, y1: b.y1 + growY };
        expect(box.x0, `${species}.${name}`).toBeGreaterThanOrEqual(g.head.x0);
        expect(box.y0, `${species}.${name}`).toBeGreaterThanOrEqual(g.head.y0);
        expect(box.x1, `${species}.${name}`).toBeLessThanOrEqual(g.head.x1);
        expect(box.y1, `${species}.${name}`).toBeLessThanOrEqual(g.head.y1);
      }
    }
    expect(Object.keys(perPart).sort()).toEqual(['brow', 'lid', 'pupil', 'shine']);
  });

  it('pet art has no id attributes and keeps animatable parts inside .face', () => {
    for (const svg of [CAT_SVG, DOG_SVG]) {
      expect(svg).not.toMatch(/\sid=/);
      const div = document.createElement('div');
      div.innerHTML = svg;
      for (const sel of ['.pupil', '.shine', '.eye-happy', '.lid', '.brow', '.mouth', '.cheek']) {
        const parts = div.querySelectorAll(sel);
        expect(parts.length, sel).toBeGreaterThan(0);
        parts.forEach((p) => expect(p.closest('.face'), sel).not.toBeNull());
      }
      expect(div.querySelector('.pet__base .pupil, .pet__base .mouth')).toBeNull();
    }
  });
});
