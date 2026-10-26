/** One play session: the player's marks, hearts, timer, undo/redo stacks, and win/lose checks. */

import { CAT, DOG, EMPTY, type Kind, type Puzzle, type Species, makeGrid } from '../engine/types';
import { createBoard, nextMove, type Board, type Move } from '../engine/deduce';

export const MARK = 3; // player's "nothing here" ✕
export type CellState = typeof EMPTY | typeof CAT | typeof DOG | typeof MARK;

export interface Action {
  r: number;
  c: number;
  before: CellState;
  after: CellState;
}

export type Outcome = 'playing' | 'won' | 'lost';

/** The player's active input tool. `mark` toggles ✕; `erase` clears anything that isn't a given. */
export type Tool = 'cat' | 'dog' | 'mark' | 'erase';

export interface UnitRef {
  kind: 'row' | 'column' | 'region';
  index: number;
}

export interface MoveResult {
  placed?: Species;
  wrong?: boolean;
  cleared?: boolean;
  marked?: boolean;
  unmarked?: boolean;
  /** Rows / columns / regions this placement completed (both pets now present). */
  completed?: UnitRef[];
  /** Nothing changed (given cell, game over, or a no-op tap). */
  ignored?: boolean;
}

/** Discrete, replayable input events. Enough to re-run a game and recompute its result. */
export type SessionEvent =
  | { t: number; type: 'place'; r: number; c: number; s: Species }
  | { t: number; type: 'clear' | 'mark' | 'unmark'; r: number; c: number }
  | { t: number; type: 'undo' | 'redo' | 'hint' | 'pause' | 'resume' | 'revive' };

export interface SessionOptions {
  /** When false (Zen), mistakes are counted but never cost hearts or end the game. */
  hearts?: boolean;
  /** Clock source, injectable for tests. */
  now?: () => number;
}

export interface HintInfo {
  r: number;
  c: number;
  species: Species;
  reason: string;
  /** The row / column / region whose logic forces this placement. Used for the tier-1 nudge. */
  unit: UnitRef | null;
}

export interface SessionSnapshot {
  v: 1;
  cells: CellState[][];
  history: Action[];
  redo: Action[];
  hearts: number;
  mistakes: number;
  hintsUsed: number;
  elapsedMs: number;
  outcome: Outcome;
  heartsEnabled: boolean;
}

const MAX_EVENTS = 4000;

export class Session {
  readonly puzzle: Puzzle;
  readonly cells: CellState[][];
  readonly givenMask: boolean[][];
  readonly heartsEnabled: boolean;
  hearts = 3;
  readonly maxHearts = 3;
  mistakes = 0;
  hintsUsed = 0;
  revives = 0;
  outcome: Outcome = 'playing';
  readonly events: SessionEvent[] = [];
  private history: Action[] = [];
  private redoStack: Action[] = [];
  private readonly now: () => number;
  private startedAt: number;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private claimed: Outcome = 'playing';
  private hintTarget: string | null = null;

  constructor(puzzle: Puzzle, opts: SessionOptions = {}) {
    this.puzzle = puzzle;
    this.heartsEnabled = opts.hearts ?? true;
    this.now = opts.now ?? (() => Date.now());
    this.startedAt = this.now();
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

  // ------------------------------------------------------------------ clock

  /** Elapsed milliseconds, excluding paused time. */
  elapsedMs(): number {
    const end = this.pausedAt ?? this.now();
    return Math.max(0, end - this.startedAt - this.pausedTotal);
  }

  /** Elapsed seconds, excluding paused time. */
  elapsedSeconds(): number {
    return Math.floor(this.elapsedMs() / 1000);
  }

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  pause(): void {
    if (this.pausedAt === null) {
      this.pausedAt = this.now();
      this.log({ t: this.elapsedMs(), type: 'pause' });
    }
  }

  resume(): void {
    if (this.pausedAt !== null) {
      this.pausedTotal += this.now() - this.pausedAt;
      this.pausedAt = null;
      this.log({ t: this.elapsedMs(), type: 'resume' });
    }
  }

  // ------------------------------------------------------------------ input

  /** Classic tap cycle: empty → ✕ → species → empty. Returns the result for feedback. */
  tap(r: number, c: number, species: Species): MoveResult {
    if (this.outcome !== 'playing' || this.givenMask[r][c]) return { ignored: true };
    const before = this.cells[r][c];
    if (before === EMPTY) {
      this.set(r, c, MARK);
      this.log({ t: this.elapsedMs(), type: 'mark', r, c });
      return { marked: true };
    }
    if (before === MARK) {
      return this.place(r, c, species);
    }
    // An animal: remove it.
    this.set(r, c, EMPTY);
    this.log({ t: this.elapsedMs(), type: 'clear', r, c });
    return { cleared: true };
  }

  /**
   * Tool-mode input: the selected tool decides what a tap does.
   *  - cat/dog on empty or ✕ → place (checked); on the same pet → clear it; on the other pet → ignored
   *  - mark on empty → ✕; on ✕ → empty; on a pet → clear
   *  - erase on anything that isn't a given → empty
   */
  apply(r: number, c: number, tool: Tool): MoveResult {
    if (this.outcome !== 'playing' || this.givenMask[r][c]) return { ignored: true };
    const v = this.cells[r][c];
    if (tool === 'cat' || tool === 'dog') {
      const s: Species = tool === 'cat' ? CAT : DOG;
      if (v === EMPTY || v === MARK) return this.place(r, c, s);
      if (v === s) {
        this.set(r, c, EMPTY);
        this.log({ t: this.elapsedMs(), type: 'clear', r, c });
        return { cleared: true };
      }
      return { ignored: true };
    }
    if (tool === 'mark') {
      if (v === EMPTY) {
        this.set(r, c, MARK);
        this.log({ t: this.elapsedMs(), type: 'mark', r, c });
        return { marked: true };
      }
      this.set(r, c, EMPTY);
      this.log({ t: this.elapsedMs(), type: v === MARK ? 'unmark' : 'clear', r, c });
      return v === MARK ? { unmarked: true } : { cleared: true };
    }
    // erase
    if (v === EMPTY) return { ignored: true };
    this.set(r, c, EMPTY);
    this.log({ t: this.elapsedMs(), type: v === MARK ? 'unmark' : 'clear', r, c });
    return v === MARK ? { unmarked: true } : { cleared: true };
  }

  /** Sets ✕ on an empty cell (used by drag-marking). No-op on anything else. */
  markIfEmpty(r: number, c: number): boolean {
    if (this.outcome !== 'playing' || this.givenMask[r][c] || this.cells[r][c] !== EMPTY) return false;
    this.set(r, c, MARK);
    this.log({ t: this.elapsedMs(), type: 'mark', r, c });
    return true;
  }

  /** Removes ✕ from a marked cell (used by drag-unmarking). No-op on anything else. */
  unmarkIfMarked(r: number, c: number): boolean {
    if (this.outcome !== 'playing' || this.givenMask[r][c] || this.cells[r][c] !== MARK) return false;
    this.set(r, c, EMPTY);
    this.log({ t: this.elapsedMs(), type: 'unmark', r, c });
    return true;
  }

  /** Direct placement (used after ✕ or by the species tool). Wrong placements cost a heart and are not kept. */
  place(r: number, c: number, species: Species): MoveResult {
    if (this.outcome !== 'playing' || this.givenMask[r][c]) return { ignored: true };
    this.log({ t: this.elapsedMs(), type: 'place', r, c, s: species });
    const correct = this.puzzle.solution[r][c] === species;
    if (!correct) {
      this.mistakes++;
      if (this.heartsEnabled) {
        this.hearts--;
        if (this.hearts <= 0) {
          this.hearts = 0;
          this.outcome = 'lost';
        }
      }
      return { placed: species, wrong: true };
    }
    this.set(r, c, species);
    const completed = this.completedUnitsAt(r, c);
    this.checkWin();
    return { placed: species, completed };
  }

  private set(r: number, c: number, after: CellState): void {
    const before = this.cells[r][c];
    if (before === after) return;
    this.history.push({ r, c, before, after });
    this.redoStack.length = 0;
    this.cells[r][c] = after;
  }

  /** Undoes the last board change. Mistakes are never stored, so undo can't refund a heart. */
  undo(): boolean {
    return this.undoMove() !== null;
  }

  undoMove(): Action | null {
    if (this.outcome !== 'playing') return null;
    const a = this.history.pop();
    if (!a) return null;
    this.cells[a.r][a.c] = a.before;
    this.redoStack.push(a);
    this.log({ t: this.elapsedMs(), type: 'undo' });
    return a;
  }

  redo(): boolean {
    return this.redoMove() !== null;
  }

  redoMove(): Action | null {
    if (this.outcome !== 'playing') return null;
    const a = this.redoStack.pop();
    if (!a) return null;
    this.cells[a.r][a.c] = a.after;
    this.history.push(a);
    this.log({ t: this.elapsedMs(), type: 'redo' });
    this.checkWin();
    return a;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  revive(): void {
    if (this.outcome === 'lost') {
      this.hearts = this.maxHearts;
      this.outcome = 'playing';
      this.claimed = 'playing';
      this.revives++;
      this.log({ t: this.elapsedMs(), type: 'revive' });
    }
  }

  /**
   * Returns the outcome exactly once per transition (won / lost), then null. The UI calls this
   * after every input so a win or loss is processed a single time even if events fire twice.
   */
  claimOutcome(): Exclude<Outcome, 'playing'> | null {
    if (this.outcome === 'playing' || this.claimed === this.outcome) return null;
    this.claimed = this.outcome;
    return this.outcome;
  }

  private checkWin(): void {
    if (this.placedCount() === 2 * this.size) this.outcome = 'won';
  }

  placedCount(): number {
    const n = this.size;
    let placed = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (this.cells[r][c] === CAT || this.cells[r][c] === DOG) placed++;
    return placed;
  }

  /** Units (row / column / region) through (r,c) that now hold both a cat and a dog. */
  completedUnitsAt(r: number, c: number): UnitRef[] {
    const n = this.size;
    const reg = this.puzzle.regions[r][c];
    const out: UnitRef[] = [];
    const full = (cells: Array<[number, number]>) => {
      let cat = false;
      let dog = false;
      for (const [rr, cc] of cells) {
        if (this.cells[rr][cc] === CAT) cat = true;
        else if (this.cells[rr][cc] === DOG) dog = true;
      }
      return cat && dog;
    };
    if (full(Array.from({ length: n }, (_, i) => [r, i] as [number, number]))) out.push({ kind: 'row', index: r });
    if (full(Array.from({ length: n }, (_, i) => [i, c] as [number, number]))) out.push({ kind: 'column', index: c });
    if (full(this.unitCells({ kind: 'region', index: reg }))) out.push({ kind: 'region', index: reg });
    return out;
  }

  unitCells(u: UnitRef): Array<[number, number]> {
    const n = this.size;
    if (u.kind === 'row') return Array.from({ length: n }, (_, i) => [u.index, i] as [number, number]);
    if (u.kind === 'column') return Array.from({ length: n }, (_, i) => [i, u.index] as [number, number]);
    const out: Array<[number, number]> = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (this.puzzle.regions[r][c] === u.index) out.push([r, c]);
    return out;
  }

  /** Placed animals only (no ✕), as a Kind grid for the deduction engine. */
  private placedKinds(): Kind[][] {
    return this.cells.map((row) => row.map((v) => (v === MARK ? EMPTY : v)));
  }

  /**
   * Cells where no animal can go given what's on the board. Used for auto-marks.
   * Derived from the rules and the player's own (always-correct) placements, so it never leaks the answer.
   */
  deadCells(): boolean[][] {
    const b = createBoard(this.size, this.puzzle.regions, [], this.placedKinds());
    const n = this.size;
    const dead = makeGrid(n, false);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dead[r][c] = this.cells[r][c] === EMPTY && !b.cand[CAT][r][c] && !b.cand[DOG][r][c];
    return dead;
  }

  /**
   * The next placement a careful human could deduce from the current board, without applying it.
   * Falls back to any correct animal when the engine is stuck (it shouldn't be on generated puzzles).
   */
  peekHint(): HintInfo | null {
    if (this.outcome !== 'playing') return null;
    const b = createBoard(this.size, this.puzzle.regions, [], this.placedKinds());
    let m: Move | null;
    let guard = 0;
    while ((m = nextMove(b)) && guard++ < 500) {
      if (m.kind === 'place') return { r: m.r, c: m.c, species: m.species, reason: m.reason, unit: forcingUnit(b, m) };
      b.cand[m.species][m.r][m.c] = false;
    }
    const n = this.size;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const s = this.puzzle.solution[r][c];
        if (s !== EMPTY && this.cells[r][c] !== s) return { r, c, species: s as Species, reason: 'Here is one that belongs.', unit: null };
      }
    return null;
  }

  /** Counts a hint once per target cell, however many tiers the player opens for it. */
  noteHint(h: HintInfo): void {
    const key = `${h.r},${h.c}`;
    if (this.hintTarget === key) return;
    this.hintTarget = key;
    this.hintsUsed++;
    this.log({ t: this.elapsedMs(), type: 'hint' });
  }

  /** Tier-3 hint: places the deduced animal. */
  hint(): HintInfo | null {
    const h = this.peekHint();
    if (!h) return null;
    this.noteHint(h);
    this.hintTarget = null;
    this.set(h.r, h.c, h.species);
    this.checkWin();
    return h;
  }

  /** Does the current board contain a wrong animal? (Mistakes are caught on placement, so normally no.) */
  hasConflicts(): boolean {
    const n = this.size;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const v = this.cells[r][c];
        if ((v === CAT || v === DOG) && this.puzzle.solution[r][c] !== v) return true;
      }
    return false;
  }

  // ------------------------------------------------------------------ persistence

  snapshot(): SessionSnapshot {
    return {
      v: 1,
      cells: this.cells.map((row) => row.slice()),
      history: this.history.map((a) => ({ ...a })),
      redo: this.redoStack.map((a) => ({ ...a })),
      hearts: this.hearts,
      mistakes: this.mistakes,
      hintsUsed: this.hintsUsed,
      elapsedMs: this.elapsedMs(),
      outcome: this.outcome,
      heartsEnabled: this.heartsEnabled,
    };
  }

  /**
   * Rebuilds a session from a snapshot. Returns null if the snapshot doesn't fit this puzzle
   * (wrong size, a given was changed, or a placed pet isn't part of the solution).
   * The restored clock starts paused; call resume() when the board is on screen.
   */
  static restore(puzzle: Puzzle, snap: SessionSnapshot, opts: SessionOptions = {}): Session | null {
    const n = puzzle.size;
    if (!snap || snap.v !== 1 || !Array.isArray(snap.cells) || snap.cells.length !== n) return null;
    const s = new Session(puzzle, { ...opts, hearts: snap.heartsEnabled });
    for (let r = 0; r < n; r++) {
      const row = snap.cells[r];
      if (!Array.isArray(row) || row.length !== n) return null;
      for (let c = 0; c < n; c++) {
        const v = row[c];
        if (v !== EMPTY && v !== CAT && v !== DOG && v !== MARK) return null;
        if (s.givenMask[r][c]) {
          if (v !== puzzle.solution[r][c]) return null;
          continue;
        }
        if ((v === CAT || v === DOG) && puzzle.solution[r][c] !== v) return null;
        s.cells[r][c] = v;
      }
    }
    const okAction = (a: Action) => a && Number.isInteger(a.r) && Number.isInteger(a.c) && a.r >= 0 && a.c >= 0 && a.r < n && a.c < n && !s.givenMask[a.r][a.c];
    s.history = Array.isArray(snap.history) ? snap.history.filter(okAction).map((a) => ({ ...a })) : [];
    s.redoStack = Array.isArray(snap.redo) ? snap.redo.filter(okAction).map((a) => ({ ...a })) : [];
    s.hearts = clampInt(snap.hearts, 0, s.maxHearts, s.maxHearts);
    s.mistakes = clampInt(snap.mistakes, 0, 1e6, 0);
    s.hintsUsed = clampInt(snap.hintsUsed, 0, 1e6, 0);
    const elapsed = clampInt(snap.elapsedMs, 0, 1e10, 0);
    const now = s.now();
    s.startedAt = now - elapsed;
    s.pausedAt = now;
    s.outcome = snap.outcome === 'lost' && s.heartsEnabled ? 'lost' : 'playing';
    s.checkWin();
    return s;
  }

  private log(e: SessionEvent): void {
    if (this.events.length < MAX_EVENTS) this.events.push(e);
  }
}

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return dflt;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/** Which unit makes a 'place' move forced: the one where it's the only candidate for that species. */
function forcingUnit(b: Board, m: Move): UnitRef | null {
  const n = b.size;
  const s = m.species;
  let rowCount = 0;
  let colCount = 0;
  let regCount = 0;
  const reg = b.regions[m.r][m.c];
  for (let i = 0; i < n; i++) {
    if (b.cand[s][m.r][i]) rowCount++;
    if (b.cand[s][i][m.c]) colCount++;
  }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (b.regions[r][c] === reg && b.cand[s][r][c]) regCount++;
  if (m.reason.includes('row') && rowCount === 1) return { kind: 'row', index: m.r };
  if (m.reason.includes('column') && colCount === 1) return { kind: 'column', index: m.c };
  if (regCount === 1) return { kind: 'region', index: reg };
  if (rowCount === 1) return { kind: 'row', index: m.r };
  if (colCount === 1) return { kind: 'column', index: m.c };
  return null;
}

export const DOG_SPECIES: Species = DOG;
export const CAT_SPECIES: Species = CAT;
