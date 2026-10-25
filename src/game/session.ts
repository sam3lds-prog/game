/** One play session: the player's marks, hearts, timer, undo stack, and win/lose checks. */

import { CAT, DOG, EMPTY, type Kind, type Puzzle, type Species, makeGrid } from '../engine/types';
import { createBoard, nextMove, type Move } from '../engine/deduce';

export const MARK = 3; // player's "nothing here" ✕
export type CellState = typeof EMPTY | typeof CAT | typeof DOG | typeof MARK;

export interface Action {
  r: number;
  c: number;
  before: CellState;
  after: CellState;
}

export type Outcome = 'playing' | 'won' | 'lost';

export class Session {
  readonly puzzle: Puzzle;
  readonly cells: CellState[][];
  readonly givenMask: boolean[][];
  hearts = 3;
  readonly maxHearts = 3;
  mistakes = 0;
  hintsUsed = 0;
  outcome: Outcome = 'playing';
  private history: Action[] = [];
  private startedAt = Date.now();
  private pausedAt: number | null = null;
  private pausedTotal = 0;

  constructor(puzzle: Puzzle) {
    this.puzzle = puzzle;
    const n = puzzle.size;
    this.cells = makeGrid<CellState>(n, EMPTY);
    this.givenMask = makeGrid(n, false);
    for (const g of puzzle.givens) {
      this.cells[g.r][g.c] = g.kind;
      this.givenMask[g.r][g.c] = true;
    }
  }

  get size(): number {
    return this.puzzle.size;
  }

  /** Elapsed seconds, excluding paused time. */
  elapsedSeconds(): number {
    const end = this.pausedAt ?? Date.now();
    return Math.floor((end - this.startedAt - this.pausedTotal) / 1000);
  }

  pause(): void {
    if (this.pausedAt === null) this.pausedAt = Date.now();
  }
  resume(): void {
    if (this.pausedAt !== null) {
      this.pausedTotal += Date.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  /** Tap cycle: empty → ✕ → species → empty. Returns the result for feedback. */
  tap(r: number, c: number, species: Species): { placed?: Species; wrong?: boolean; cleared?: boolean; marked?: boolean } {
    if (this.outcome !== 'playing' || this.givenMask[r][c]) return {};
    const before = this.cells[r][c];
    if (before === EMPTY) {
      this.set(r, c, MARK);
      return { marked: true };
    }
    if (before === MARK) {
      return this.place(r, c, species);
    }
    // An animal: remove it.
    this.set(r, c, EMPTY);
    return { cleared: true };
  }

  /** Direct placement (used after ✕ or by the species tool). */
  place(r: number, c: number, species: Species): { placed?: Species; wrong?: boolean } {
    if (this.outcome !== 'playing' || this.givenMask[r][c]) return {};
    const correct = this.puzzle.solution[r][c] === species;
    if (!correct) {
      this.mistakes++;
      this.hearts--;
      if (this.hearts <= 0) this.outcome = 'lost';
      return { placed: species, wrong: true };
    }
    this.set(r, c, species);
    this.checkWin();
    return { placed: species };
  }

  private set(r: number, c: number, after: CellState): void {
    const before = this.cells[r][c];
    if (before === after) return;
    this.history.push({ r, c, before, after });
    this.cells[r][c] = after;
  }

  undo(): boolean {
    if (this.outcome !== 'playing') return false;
    const a = this.history.pop();
    if (!a) return false;
    this.cells[a.r][a.c] = a.before;
    return true;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  revive(): void {
    if (this.outcome === 'lost') {
      this.hearts = this.maxHearts;
      this.outcome = 'playing';
    }
  }

  private checkWin(): void {
    const n = this.size;
    let placed = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (this.cells[r][c] === CAT || this.cells[r][c] === DOG) placed++;
    if (placed === 2 * n) this.outcome = 'won';
  }

  /** Placed animals only (no ✕), as a Kind grid for the deduction engine. */
  private placedKinds(): Kind[][] {
    return this.cells.map((row) => row.map((v) => (v === MARK ? EMPTY : v)));
  }

  /**
   * Cells where no animal can go given what's on the board. Used for auto-marks.
   * Derived from the rules, so it never lies.
   */
  deadCells(): boolean[][] {
    const b = createBoard(this.size, this.puzzle.regions, [], this.placedKinds());
    const n = this.size;
    const dead = makeGrid(n, false);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dead[r][c] = this.cells[r][c] === EMPTY && !b.cand[CAT][r][c] && !b.cand[DOG][r][c];
    return dead;
  }

  /**
   * Hint: the next placement a careful human could deduce from the current board.
   * Falls back to revealing any correct animal when the engine is stuck.
   */
  hint(): { r: number; c: number; species: Species; reason: string } | null {
    if (this.outcome !== 'playing') return null;
    const b = createBoard(this.size, this.puzzle.regions, [], this.placedKinds());
    let m: Move | null;
    let guard = 0;
    while ((m = nextMove(b)) && guard++ < 500) {
      if (m.kind === 'place') {
        this.hintsUsed++;
        this.set(m.r, m.c, m.species);
        this.checkWin();
        return { r: m.r, c: m.c, species: m.species, reason: m.reason };
      }
      b.cand[m.species][m.r][m.c] = false;
    }
    // Engine stuck (shouldn't happen on generated puzzles, but be safe): reveal a correct animal.
    const n = this.size;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const s = this.puzzle.solution[r][c];
        if (s !== EMPTY && this.cells[r][c] !== s) {
          this.hintsUsed++;
          this.set(r, c, s as Species);
          this.checkWin();
          return { r, c, species: s as Species, reason: 'Here is one that belongs.' };
        }
      }
    return null;
  }

  /** Does the current board contain a wrong animal? (Mistakes are caught on placement, so normally no.) */
  hasConflicts(): boolean {
    const n = this.size;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = this.cells[r][c];
      if ((v === CAT || v === DOG) && this.puzzle.solution[r][c] !== v) return true;
    }
    return false;
  }
}

export const DOG_SPECIES: Species = DOG;
export const CAT_SPECIES: Species = CAT;
