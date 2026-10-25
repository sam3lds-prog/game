/**
 * One play session: the player's board, hearts, undo history and outcome.
 *
 * Pure model — no DOM, no timers. Fully serializable via toSnapshot()/fromSnapshot().
 * Every move returns a MoveResult with an explicit reason code, so the UI (copy, outlines,
 * faces, haptics) can react precisely without guessing.
 */

import { CAT, DOG, EMPTY, type Cell, type Kind, type Puzzle, type Species, makeGrid } from '../engine/types';
import { isValidSolution } from '../engine/solver';
import { createBoard, nextMove, type Move } from '../engine/deduce';

export const MARK = 3;
export type CellValue = typeof EMPTY | typeof CAT | typeof DOG | typeof MARK;
export type Tool = 'cat' | 'dog' | 'mark';
export type GameMode = 'zen' | 'challenge';
export type Outcome = 'playing' | 'won' | 'lost';

export type Violation =
  | 'given_cell'
  | 'adjacent_conflict'
  | 'duplicate_species_in_row'
  | 'duplicate_species_in_column'
  | 'duplicate_species_in_region'
  | 'solution_mismatch';

export interface CellChange {
  r: number;
  c: number;
  before: CellValue;
  after: CellValue;
}

export interface MoveResult {
  accepted: boolean;
  change?: CellChange;
  violation?: Violation;
  /** Visible animals that cause the violation (for outlines and face reactions). */
  conflicts: Cell[];
  heartLost: boolean;
  outcome: Outcome;
}

export interface SessionSnapshot {
  v: 2;
  puzzle: Puzzle;
  mode: GameMode;
  /** n*n chars: '.' empty, 'c' cat, 'd' dog, 'x' mark (givens included). */
  cells: string;
  /** Compact undo history: "r,c,before,after". */
  history: string[];
  hearts: number;
  mistakes: number;
  hintsExplained: number;
  hintsRevealed: number;
  activeMs: number;
  outcome: Outcome;
  tool: Tool;
  savedAt: number;
}

const CH: Record<number, string> = { [EMPTY]: '.', [CAT]: 'c', [DOG]: 'd', [MARK]: 'x' };
const FROM_CH: Record<string, CellValue> = { '.': EMPTY, c: CAT, d: DOG, x: MARK };
const MAX_HISTORY = 400;

export function toolSpecies(t: Tool): Species | null {
  return t === 'cat' ? CAT : t === 'dog' ? DOG : null;
}

export class Session {
  readonly puzzle: Puzzle;
  readonly mode: GameMode;
  readonly cells: CellValue[][];
  readonly givenMask: boolean[][];
  readonly maxHearts = 3;
  hearts = 3;
  mistakes = 0;
  hintsExplained = 0;
  hintsRevealed = 0;
  outcome: Outcome = 'playing';
  tool: Tool = 'cat';
  /** Active play time restored from a snapshot; the screen's ActiveTimer continues from here. */
  restoredActiveMs = 0;
  private history: CellChange[] = [];

  constructor(puzzle: Puzzle, mode: GameMode = 'challenge') {
    this.puzzle = puzzle;
    this.mode = mode;
    const n = puzzle.size;
    this.cells = makeGrid<CellValue>(n, EMPTY);
    this.givenMask = makeGrid(n, false);
    for (const g of puzzle.givens) {
      this.cells[g.r][g.c] = g.kind;
      this.givenMask[g.r][g.c] = true;
    }
  }

  get size(): number {
    return this.puzzle.size;
  }

  // ------------------------------------------------------------ rules

  /** Checks whether `species` may go at (r,c) given only what is visible on the board. */
  visibleViolation(r: number, c: number, species: Species): { violation?: Violation; conflicts: Cell[] } {
    const n = this.size;
    const at = (rr: number, cc: number) => (rr === r && cc === c ? EMPTY : this.cells[rr][cc]);
    const rowHits: Cell[] = [];
    const colHits: Cell[] = [];
    const regHits: Cell[] = [];
    const reg = this.puzzle.regions[r][c];
    for (let i = 0; i < n; i++) {
      if (at(r, i) === species) rowHits.push({ r, c: i });
      if (at(i, c) === species) colHits.push({ r: i, c });
    }
    for (let rr = 0; rr < n; rr++) for (let cc = 0; cc < n; cc++) if (this.puzzle.regions[rr][cc] === reg && at(rr, cc) === species) regHits.push({ r: rr, c: cc });
    const adj: Cell[] = [];
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
      const v = at(rr, cc);
      if (v === CAT || v === DOG) adj.push({ r: rr, c: cc });
    }
    if (rowHits.length) return { violation: 'duplicate_species_in_row', conflicts: rowHits };
    if (colHits.length) return { violation: 'duplicate_species_in_column', conflicts: colHits };
    if (regHits.length) return { violation: 'duplicate_species_in_region', conflicts: regHits };
    if (adj.length) return { violation: 'adjacent_conflict', conflicts: adj };
    return { conflicts: [] };
  }

  // ------------------------------------------------------------ moves

  /** Sets a cell to a value. All input modes funnel through here. */
  setCell(r: number, c: number, value: CellValue): MoveResult {
    const base = { conflicts: [] as Cell[], heartLost: false };
    if (this.outcome !== 'playing') return { ...base, accepted: false, outcome: this.outcome };
    if (this.givenMask[r][c]) return { ...base, accepted: false, violation: 'given_cell', outcome: this.outcome };
    const before = this.cells[r][c];
    if (before === value) return { ...base, accepted: false, outcome: this.outcome };

    if (value === CAT || value === DOG) {
      const vis = this.visibleViolation(r, c, value);
      let violation = vis.violation;
      if (!violation && this.mode === 'challenge' && this.puzzle.solution[r][c] !== value) violation = 'solution_mismatch';
      if (violation) {
        let heartLost = false;
        if (this.mode === 'challenge') {
          this.mistakes++;
          this.hearts = Math.max(0, this.hearts - 1);
          heartLost = true;
          if (this.hearts === 0) this.outcome = 'lost';
        }
        return { accepted: false, violation, conflicts: vis.conflicts, heartLost, outcome: this.outcome };
      }
    }

    const change: CellChange = { r, c, before, after: value };
    this.cells[r][c] = value;
    this.history.push(change);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.checkWin();
    return { ...base, accepted: true, change, outcome: this.outcome };
  }

  undo(): CellChange | null {
    if (this.outcome !== 'playing') return null;
    const ch = this.history.pop();
    if (!ch) return null;
    this.cells[ch.r][ch.c] = ch.before;
    return ch;
  }

  canUndo(): boolean {
    return this.outcome === 'playing' && this.history.length > 0;
  }

  revive(): void {
    if (this.outcome === 'lost') {
      this.hearts = this.maxHearts;
      this.outcome = 'playing';
    }
  }

  private checkWin(): void {
    const n = this.size;
    let animals = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (this.cells[r][c] === CAT || this.cells[r][c] === DOG) animals++;
    if (animals !== 2 * n) return;
    if (isValidSolution(n, this.puzzle.regions, this.kinds())) this.outcome = 'won';
  }

  /** Animals only (marks → empty). */
  kinds(): Kind[][] {
    return this.cells.map((row) => row.map((v) => (v === MARK ? EMPTY : v)));
  }

  /** Cells where, by the visible rules alone, no animal can go. Never uses the hidden solution. */
  deadCells(): boolean[][] {
    const b = createBoard(this.size, this.puzzle.regions, [], this.kinds());
    const n = this.size;
    const dead = makeGrid(n, false);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) dead[r][c] = this.cells[r][c] === EMPTY && !b.cand[CAT][r][c] && !b.cand[DOG][r][c];
    return dead;
  }

  /** v1-style hint (placement with a reason). Replaced by explain/reveal in Sprint 4. */
  hint(): { r: number; c: number; species: Species; reason: string } | null {
    if (this.outcome !== 'playing') return null;
    const b = createBoard(this.size, this.puzzle.regions, [], this.kinds());
    let m: Move | null;
    let guard = 0;
    while ((m = nextMove(b)) && guard++ < 500) {
      if (m.kind === 'place') {
        this.hintsRevealed++;
        this.setCell(m.r, m.c, m.species);
        return { r: m.r, c: m.c, species: m.species, reason: m.reason };
      }
      b.cand[m.species][m.r][m.c] = false;
    }
    return null;
  }

  // ------------------------------------------------------------ persistence

  toSnapshot(activeMs: number): SessionSnapshot {
    return {
      v: 2,
      puzzle: this.puzzle,
      mode: this.mode,
      cells: this.cells.map((row) => row.map((v) => CH[v]).join('')).join(''),
      history: this.history.map((h) => `${h.r},${h.c},${h.before},${h.after}`),
      hearts: this.hearts,
      mistakes: this.mistakes,
      hintsExplained: this.hintsExplained,
      hintsRevealed: this.hintsRevealed,
      activeMs: Math.max(0, Math.round(activeMs)),
      outcome: this.outcome,
      tool: this.tool,
      savedAt: Date.now(),
    };
  }

  static fromSnapshot(s: SessionSnapshot): Session {
    const sess = new Session(s.puzzle, s.mode);
    const n = s.puzzle.size;
    if (s.cells.length === n * n) {
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          if (sess.givenMask[r][c]) continue;
          sess.cells[r][c] = FROM_CH[s.cells[r * n + c]] ?? EMPTY;
        }
    }
    sess.history = s.history
      .map((x) => x.split(',').map(Number))
      .filter((a) => a.length === 4 && a.every(Number.isFinite))
      .map(([r, c, before, after]) => ({ r, c, before: before as CellValue, after: after as CellValue }));
    sess.hearts = s.hearts;
    sess.mistakes = s.mistakes;
    sess.hintsExplained = s.hintsExplained ?? 0;
    sess.hintsRevealed = s.hintsRevealed ?? 0;
    sess.outcome = s.outcome;
    sess.tool = s.tool ?? 'cat';
    sess.restoredActiveMs = s.activeMs ?? 0;
    return sess;
  }
}
