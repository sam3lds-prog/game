/**
 * Board view: one stationary button per cell, updated incrementally.
 *
 * - A cell's pet SVG is inserted only when its occupant changes; face reactions rely on stable nodes.
 * - Size comes from the space actually available (ResizeObserver on the container), not the
 *   viewport width, so 9×9 fits under the controls on small phones. Cell size only changes when the
 *   container does (rotation, window resize) — never during play.
 * - Input: pointer events separate tap from long-press (holding a pet never toggles the cell);
 *   keyboard: arrow keys move focus (one tabbable cell), Enter/Space activate.
 * - Counters: two pips per row (right gutter), column (bottom gutter) and region (first cell).
 * - Feedback is static: outlines and tints added and removed, no movement.
 */
import { CAT, DOG, EMPTY, type Cell, type Puzzle } from '../engine/types';
import type { UnitRef } from '../engine/deduce';
import { MARK, type CellValue } from '../game/session';
import { CAT_SVG, DOG_SVG, MARK_SVG } from '../game/icons';
import type { Scope } from '../app/scope';
import { h } from '../app/dom';
import { REGION_NAMES } from '../engine/names';

export { REGION_NAMES };

export interface BoardHandlers {
  tap(r: number, c: number): void;
  longPress?(r: number, c: number): void;
  /** A cell's occupant changed (pet placed/removed, mark toggled). */
  cellChanged?(r: number, c: number): void;
}

export interface BoardRenderState {
  cells: CellValue[][];
  givenMask: boolean[][];
  dead: boolean[][] | null;
}

export interface BoardOptions {
  counters: boolean;
  patterns: boolean;
}

type FlashClass = 'is-conflict' | 'is-hint' | 'is-error' | 'is-lesson-target';
type TintClass = 'in-hint-unit' | 'in-lesson-unit';

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;
const MIN_CELL = 24;
const MAX_CELL = 64;

export class BoardView {
  /** Outer frame (board + counter gutters). Append this. */
  readonly el: HTMLElement;
  /** The grid itself. */
  readonly boardEl: HTMLElement;
  private cellEls: HTMLButtonElement[][] = [];
  private shown: Array<Array<CellValue | -1>> = [];
  private rowPips: HTMLElement[] = [];
  private colPips: HTMLElement[] = [];
  private regionPips: HTMLElement[] = [];
  private flashTimers = new Map<string, number>();
  private focus: Cell = { r: 0, c: 0 };
  private cellPx = 0;
  /** Re-runs the fit (set by fitTo) — needed when options change the board's frame, e.g. pips on/off. */
  private refit: (() => void) | null = null;

  constructor(
    private puzzle: Puzzle,
    private scope: Scope,
    private handlers: BoardHandlers,
    opts: BoardOptions = { counters: true, patterns: false },
  ) {
    const n = puzzle.size;
    this.el = h(`<div class="board-frame"></div>`);
    this.boardEl = h(`<div class="board" role="grid" aria-label="${n} by ${n} puzzle board"></div>`);
    const anchors = new Set<number>();
    const seenRegion = new Set<number>();
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (!seenRegion.has(puzzle.regions[r][c])) {
          seenRegion.add(puzzle.regions[r][c]);
          anchors.add(r * n + c);
        }
    for (let r = 0; r < n; r++) {
      const row = h(`<div class="board__row" role="row"></div>`);
      this.cellEls.push([]);
      this.shown.push([]);
      for (let c = 0; c < n; c++) {
        const reg = puzzle.regions[r][c];
        const cell = h<HTMLButtonElement>(`<button class="cell" role="gridcell" tabindex="-1" data-r="${r}" data-c="${c}" data-region="${reg % 10}"><span class="cell__slot"></span></button>`);
        if (c < n - 1 && reg !== puzzle.regions[r][c + 1]) cell.classList.add('bR');
        if (r < n - 1 && reg !== puzzle.regions[r + 1][c]) cell.classList.add('bB');
        if (anchors.has(r * n + c)) {
          const pips = h(`<span class="region-pips" aria-hidden="true"><span class="pip cat"></span><span class="pip dog"></span></span>`);
          cell.appendChild(pips);
          this.regionPips[reg] = pips;
        }
        row.appendChild(cell);
        this.cellEls[r].push(cell);
        this.shown[r].push(-1);
      }
      this.boardEl.appendChild(row);
    }
    this.cellEls[0][0].tabIndex = 0;

    const rows = h(`<div class="gutter gutter--rows" aria-hidden="true"></div>`);
    const cols = h(`<div class="gutter gutter--cols" aria-hidden="true"></div>`);
    for (let i = 0; i < n; i++) {
      const rp = h(`<span class="gutter__slot"><span class="pip cat"></span><span class="pip dog"></span></span>`);
      const cp = h(`<span class="gutter__slot"><span class="pip cat"></span><span class="pip dog"></span></span>`);
      rows.appendChild(rp);
      cols.appendChild(cp);
      this.rowPips.push(rp);
      this.colPips.push(cp);
    }
    this.el.append(this.boardEl, rows, cols);
    this.setOptions(opts);
    this.bindInput();
  }

  get size(): number {
    return this.puzzle.size;
  }

  setOptions(opts: BoardOptions): void {
    this.el.classList.toggle('no-counters', !opts.counters);
    this.el.querySelectorAll<HTMLElement>('.gutter, .region-pips').forEach((g) => (g.hidden = !opts.counters));
    this.boardEl.classList.toggle('patterns', opts.patterns);
    this.refit?.();
  }

  setFacesStill(still: boolean): void {
    this.boardEl.classList.toggle('faces-still', still);
  }

  // ------------------------------------------------------------ sizing

  /** Sizes cells to fit `container`, now and whenever the container is resized. */
  fitTo(container: HTMLElement): void {
    const fit = () => {
      const n = this.puzzle.size;
      const counters = !this.el.classList.contains('no-counters');
      const extra = 6 + (counters ? 12 + 3 : 0); // board border + gutter + gap
      const w = container.clientWidth - extra;
      const hgt = container.clientHeight - extra;
      if (w <= 0 || hgt <= 0) return;
      const px = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(Math.min(w, hgt) / n)));
      if (px === this.cellPx) return;
      this.cellPx = px;
      this.el.style.setProperty('--cell', `${px}px`);
      this.boardEl.classList.toggle('is-compact', px < 36);
    };
    this.refit = fit;
    this.scope.add(() => (this.refit = null));
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    this.scope.add(() => ro.disconnect());
  }

  get cellSize(): number {
    return this.cellPx;
  }

  // ------------------------------------------------------------ input

  private bindInput(): void {
    let press: { r: number; c: number; id: number; x: number; y: number; timer: number; fired: boolean } | null = null;
    const cellFrom = (e: Event): { r: number; c: number } | null => {
      const el = (e.target as HTMLElement | null)?.closest?.('.cell') as HTMLElement | null;
      if (!el || !this.boardEl.contains(el)) return null;
      return { r: Number(el.dataset.r), c: Number(el.dataset.c) };
    };
    const cancel = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };
    const b = this.boardEl;
    this.scope.listen(b, 'pointerdown', (e) => {
      const at = cellFrom(e);
      if (!at || (e.pointerType === 'mouse' && e.button !== 0)) return;
      cancel();
      const p = { ...at, id: e.pointerId, x: e.clientX, y: e.clientY, fired: false, timer: 0 };
      p.timer = window.setTimeout(() => {
        p.fired = true;
        this.handlers.longPress?.(p.r, p.c);
      }, LONG_PRESS_MS);
      press = p;
    });
    this.scope.listen(b, 'pointermove', (e) => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) cancel();
    });
    this.scope.listen(b, 'pointerup', (e) => {
      if (!press || e.pointerId !== press.id) return;
      const p = press;
      cancel();
      const at = cellFrom(e);
      if (!p.fired && at && at.r === p.r && at.c === p.c) {
        this.moveFocus(at.r, at.c, false);
        this.handlers.tap(p.r, p.c);
      }
    });
    this.scope.listen(b, 'pointercancel', cancel);
    this.scope.listen(b, 'pointerleave', cancel);
    this.scope.add(cancel);
    // Keyboard activation (and programmatic .click()) → tap. Pointer clicks have detail ≥ 1 and were handled above.
    this.scope.listen(b, 'click', (e) => {
      if ((e as MouseEvent).detail !== 0) return;
      const at = cellFrom(e);
      if (at) this.handlers.tap(at.r, at.c);
    });
    this.scope.listen(b, 'keydown', (e) => {
      const n = this.puzzle.size;
      const { r, c } = this.focus;
      const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      const m = moves[e.key];
      if (!m) return;
      e.preventDefault();
      this.moveFocus(Math.max(0, Math.min(n - 1, r + m[0])), Math.max(0, Math.min(n - 1, c + m[1])), true);
    });
    this.scope.listen(b, 'contextmenu', (e) => e.preventDefault());
  }

  private moveFocus(r: number, c: number, focus: boolean): void {
    this.cellEls[this.focus.r][this.focus.c].tabIndex = -1;
    this.focus = { r, c };
    const el = this.cellEls[r][c];
    el.tabIndex = 0;
    if (focus) el.focus();
  }

  // ------------------------------------------------------------ rendering

  cellEl(r: number, c: number): HTMLButtonElement {
    return this.cellEls[r][c];
  }

  petEl(r: number, c: number): SVGSVGElement | null {
    return this.cellEls[r]?.[c]?.querySelector('svg.pet') ?? null;
  }

  occupied(): Array<{ r: number; c: number }> {
    const out: Array<{ r: number; c: number }> = [];
    const n = this.puzzle.size;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (this.shown[r][c] === CAT || this.shown[r][c] === DOG) out.push({ r, c });
    return out;
  }

  update(state: BoardRenderState): void {
    const n = this.puzzle.size;
    const rowHas = Array.from({ length: n }, () => [false, false]);
    const colHas = Array.from({ length: n }, () => [false, false]);
    const regHas = Array.from({ length: n }, () => [false, false]);
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const cell = this.cellEls[r][c];
        const v = state.cells[r][c];
        const given = state.givenMask[r][c];
        if (v === CAT || v === DOG) {
          rowHas[r][v - 1] = colHas[c][v - 1] = regHas[this.puzzle.regions[r][c]][v - 1] = true;
        }
        cell.classList.toggle('given', given);
        cell.classList.toggle('mark', v === MARK);
        cell.classList.toggle('has-pet', v === CAT || v === DOG);
        cell.classList.toggle('dead', !!state.dead?.[r][c]);
        if (this.shown[r][c] !== v) {
          const slot = cell.firstElementChild as HTMLElement;
          slot.innerHTML = v === CAT ? CAT_SVG : v === DOG ? DOG_SVG : v === MARK ? MARK_SVG : '';
          const had = this.shown[r][c];
          this.shown[r][c] = v;
          cell.setAttribute('aria-label', this.label(r, c, v, given));
          if (had !== -1) this.handlers.cellChanged?.(r, c);
        }
      }
    const paint = (el: HTMLElement | undefined, has: boolean[]) => {
      if (!el) return;
      const [cat, dog] = el.querySelectorAll('.pip');
      cat.classList.toggle('on', has[0]);
      dog.classList.toggle('on', has[1]);
    };
    for (let i = 0; i < n; i++) {
      paint(this.rowPips[i], rowHas[i]);
      paint(this.colPips[i], colHas[i]);
      paint(this.regionPips[i], regHas[i]);
      this.regionPips[i]?.classList.toggle('done', regHas[i][0] && regHas[i][1]);
    }
  }

  label(r: number, c: number, v: CellValue, given: boolean): string {
    const what = v === CAT ? 'cat' : v === DOG ? 'dog' : v === MARK ? 'marked empty' : 'empty';
    const region = REGION_NAMES[this.puzzle.regions[r][c] % 10];
    return `Row ${r + 1}, column ${c + 1}, ${region} region, ${what}${given ? ', fixed' : ''}`;
  }

  /** Adds a static outline class to cells for `ms` (or until cleared when ms = 0). No motion. */
  flash(cells: Cell[], cls: FlashClass, ms = 1200): void {
    for (const { r, c } of cells) {
      const el = this.cellEls[r]?.[c];
      if (!el) continue;
      const key = `${cls}:${r},${c}`;
      const prev = this.flashTimers.get(key);
      if (prev) clearTimeout(prev);
      el.classList.add(cls);
      if (ms > 0) {
        const t = this.scope.timeout(() => {
          el.classList.remove(cls);
          this.flashTimers.delete(key);
        }, ms);
        this.flashTimers.set(key, t);
      }
    }
  }

  clear(cls: FlashClass | TintClass): void {
    for (const row of this.cellEls) for (const el of row) el.classList.remove(cls);
    if (cls === 'in-hint-unit') this.boardEl.classList.remove('dim-hint');
    if (cls === 'in-lesson-unit') this.boardEl.classList.remove('dim-lesson');
  }

  /** Highlights every cell of the given units by dimming the rest (static). */
  tintUnits(units: UnitRef[], cls: TintClass): void {
    const n = this.puzzle.size;
    this.boardEl.classList.toggle(cls === 'in-hint-unit' ? 'dim-hint' : 'dim-lesson', units.length > 0);
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const on = units.some((u) => (u.kind === 'row' && u.index === r) || (u.kind === 'col' && u.index === c) || (u.kind === 'region' && u.index === this.puzzle.regions[r][c]));
        this.cellEls[r][c].classList.toggle(cls, on);
      }
  }

  isEmpty(r: number, c: number): boolean {
    return this.shown[r][c] === EMPTY;
  }
}
