/**
 * Board view: one stationary button per cell, updated incrementally.
 *
 * - A cell's pet SVG is inserted only when its occupant changes; nothing else ever rewrites it
 *   (face reactions in Sprint 2 rely on stable nodes).
 * - Input: pointer events tell a tap from a long-press, so holding a pet never toggles the cell.
 *   Keyboard activation (Enter/Space) arrives as a click with detail 0 and counts as a tap.
 * - Feedback is static: outlines added and removed, no movement.
 */
import { CAT, DOG, EMPTY, type Cell, type Puzzle } from '../engine/types';
import { MARK, type CellValue } from '../game/session';
import { CAT_SVG, DOG_SVG, MARK_SVG } from '../game/icons';
import type { Scope } from '../app/scope';
import { h } from '../app/dom';

export const REGION_NAMES = ['Rose', 'Amber', 'Lemon', 'Mint', 'Sky', 'Lilac', 'Pink', 'Lime', 'Sand', 'Teal'];

export interface BoardHandlers {
  tap(r: number, c: number): void;
  longPress?(r: number, c: number): void;
}

export interface BoardRenderState {
  cells: CellValue[][];
  givenMask: boolean[][];
  dead: boolean[][] | null;
}

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 10;

export class BoardView {
  readonly el: HTMLElement;
  private cellEls: HTMLButtonElement[][] = [];
  private shown: Array<Array<CellValue | -1>> = [];
  private flashTimers = new Map<string, number>();

  constructor(
    private puzzle: Puzzle,
    private scope: Scope,
    private handlers: BoardHandlers,
  ) {
    const n = puzzle.size;
    this.el = h(`<div class="board" role="grid" aria-label="${n} by ${n} puzzle board" style="--n:${n}"></div>`);
    for (let r = 0; r < n; r++) {
      const row = h(`<div class="board__row" role="row"></div>`);
      this.cellEls.push([]);
      this.shown.push([]);
      for (let c = 0; c < n; c++) {
        const reg = puzzle.regions[r][c];
        const cell = h<HTMLButtonElement>(`<button class="cell" role="gridcell" data-r="${r}" data-c="${c}" data-region="${reg % 10}"><span class="cell__slot"></span></button>`);
        if (c < n - 1 && reg !== puzzle.regions[r][c + 1]) cell.classList.add('bR');
        if (r < n - 1 && reg !== puzzle.regions[r + 1][c]) cell.classList.add('bB');
        if (c > 0 && reg !== puzzle.regions[r][c - 1]) cell.classList.add('bL');
        if (r > 0 && reg !== puzzle.regions[r - 1][c]) cell.classList.add('bT');
        row.appendChild(cell);
        this.cellEls[r].push(cell);
        this.shown[r].push(-1);
      }
      this.el.appendChild(row);
    }
    this.bindInput();
  }

  private bindInput(): void {
    let press: { r: number; c: number; id: number; x: number; y: number; timer: number; fired: boolean } | null = null;
    const cellFrom = (e: Event): { r: number; c: number } | null => {
      const el = (e.target as HTMLElement | null)?.closest?.('.cell') as HTMLElement | null;
      if (!el || !this.el.contains(el)) return null;
      return { r: Number(el.dataset.r), c: Number(el.dataset.c) };
    };
    const cancel = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };
    this.scope.listen(this.el, 'pointerdown', (e) => {
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
    this.scope.listen(this.el, 'pointermove', (e) => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) cancel();
    });
    this.scope.listen(this.el, 'pointerup', (e) => {
      if (!press || e.pointerId !== press.id) return;
      const p = press;
      cancel();
      const at = cellFrom(e);
      if (!p.fired && at && at.r === p.r && at.c === p.c) this.handlers.tap(p.r, p.c);
    });
    this.scope.listen(this.el, 'pointercancel', cancel);
    this.scope.listen(this.el, 'pointerleave', cancel);
    this.scope.add(cancel);
    // Keyboard activation (and programmatic .click()) → tap. Pointer-generated clicks have detail ≥ 1 and were handled above.
    this.scope.listen(this.el, 'click', (e) => {
      if ((e as MouseEvent).detail !== 0) return;
      const at = cellFrom(e);
      if (at) this.handlers.tap(at.r, at.c);
    });
    this.scope.listen(this.el, 'contextmenu', (e) => e.preventDefault());
  }

  cellEl(r: number, c: number): HTMLButtonElement {
    return this.cellEls[r][c];
  }

  /** The pet <svg> currently in a cell, if any. */
  petEl(r: number, c: number): SVGSVGElement | null {
    return this.cellEls[r][c].querySelector('svg.pet');
  }

  update(state: BoardRenderState): void {
    const n = this.puzzle.size;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const cell = this.cellEls[r][c];
        const v = state.cells[r][c];
        const given = state.givenMask[r][c];
        cell.classList.toggle('given', given);
        cell.classList.toggle('mark', v === MARK);
        cell.classList.toggle('has-pet', v === CAT || v === DOG);
        cell.classList.toggle('dead', !!state.dead?.[r][c]);
        if (this.shown[r][c] !== v) {
          const slot = cell.firstElementChild as HTMLElement;
          slot.innerHTML = v === CAT ? CAT_SVG : v === DOG ? DOG_SVG : v === MARK ? MARK_SVG : '';
          this.shown[r][c] = v;
          cell.setAttribute('aria-label', this.label(r, c, v, given));
        }
      }
  }

  private label(r: number, c: number, v: CellValue, given: boolean): string {
    const what = v === CAT ? 'cat' : v === DOG ? 'dog' : v === MARK ? 'marked empty' : 'empty';
    const region = REGION_NAMES[this.puzzle.regions[r][c] % 10];
    return `Row ${r + 1}, column ${c + 1}, ${region} region, ${what}${given ? ', fixed' : ''}`;
  }

  /** Adds a static outline class to cells for `ms`, then removes it. No motion. */
  flash(cells: Cell[], cls: 'is-conflict' | 'is-hint' | 'is-error', ms = 1200): void {
    for (const { r, c } of cells) {
      const el = this.cellEls[r]?.[c];
      if (!el) continue;
      const key = `${cls}:${r},${c}`;
      const prev = this.flashTimers.get(key);
      if (prev) clearTimeout(prev);
      el.classList.add(cls);
      const t = this.scope.timeout(() => {
        el.classList.remove(cls);
        this.flashTimers.delete(key);
      }, ms);
      this.flashTimers.set(key, t);
    }
  }

  clearFlash(cls: 'is-conflict' | 'is-hint' | 'is-error'): void {
    for (const row of this.cellEls) for (const el of row) el.classList.remove(cls);
  }

  isEmpty(r: number, c: number): boolean {
    return this.shown[r][c] === EMPTY;
  }
}
