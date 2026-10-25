/**
 * Interactive tutorial: five short lessons built from real, verified puzzles.
 *
 *  1. One cat per row           — a row with a single open cell; place the cat.
 *  2. Cats and dogs both        — a row that has its cat but needs its dog (tool starts on Cat).
 *  3. Columns and colors        — two open cells in a row; one sits in a column that already has a cat.
 *  4. Side by side vs. diagonal — two open cells; one is beside a cat (not allowed), the other touches
 *                                 cats only at corners (allowed).
 *  5. Your first puzzle         — a full 5×5 board in Zen mode.
 *
 * Lesson boards are subsets of the puzzle's unique solution, so they never show an impossible state.
 */
import { CAT, DOG, EMPTY, type Cell, type Puzzle, type Species } from '../engine/types';
import type { UnitRef } from '../engine/deduce';
import { MARK, Session, type CellValue, type Tool } from './session';

export interface Lesson {
  step: number;
  title: string;
  body: string;
  success: string;
  /** Puzzle whose givens are the pets already on the lesson board (all fixed). */
  puzzle: Puzzle;
  /** ✕ marks pre-set on the board. */
  marks: Cell[];
  highlight: UnitRef[];
  /** Lessons 1–4: the cell and pet that complete the lesson. Lesson 5: none (solve the board). */
  target: (Cell & { species: Species }) | null;
  /** A wrong-but-tempting cell for lessons 3–4. */
  decoy: Cell | null;
  tool: Tool;
}

type Animal = Cell & { kind: Species };

function animalsOf(p: Puzzle): Animal[] {
  const out: Animal[] = [];
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (p.solution[r][c] !== EMPTY) out.push({ r, c, kind: p.solution[r][c] as Species });
  return out;
}

const same = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;
const orth = (a: Cell, b: Cell) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
const diag = (a: Cell, b: Cell) => Math.abs(a.r - b.r) === 1 && Math.abs(a.c - b.c) === 1;

function withGivens(p: Puzzle, givens: Animal[], id: string): Puzzle {
  return { ...p, givens: givens.map((g) => ({ r: g.r, c: g.c, kind: g.kind })), id };
}

/** Open cells of row r other than `keep`, to be marked ✕. */
function rowMarks(p: Puzzle, placed: Animal[], r: number, keep: Cell[]): Cell[] {
  const out: Cell[] = [];
  for (let c = 0; c < p.size; c++) {
    const cell = { r, c };
    if (placed.some((a) => same(a, cell)) || keep.some((k) => same(k, cell))) continue;
    out.push(cell);
  }
  return out;
}

/** Visible-rule check on a lesson board (Zen rules: never consults the answer). */
function violation(p: Puzzle, marks: Cell[], at: Cell, species: Species) {
  const s = new Session(p, 'zen');
  for (const m of marks) s.preset(m.r, m.c, MARK);
  return s.visibleViolation(at.r, at.c, species).violation;
}

function lesson1(p: Puzzle, all: Animal[]): Lesson | null {
  for (const t of all.filter((a) => a.kind === CAT)) {
    const placed = all.filter((a) => !same(a, t));
    return {
      step: 1,
      title: 'One cat in every row',
      body: `Row ${t.r + 1} still needs its cat, and only one cell is open. With Cat selected, tap that cell.`,
      success: 'That’s the idea: every row gets exactly one cat.',
      puzzle: withGivens(p, placed, 'tutorial-lesson-1'),
      marks: rowMarks(p, placed, t.r, [t]),
      highlight: [{ kind: 'row', index: t.r }],
      target: { r: t.r, c: t.c, species: CAT },
      decoy: null,
      tool: 'cat',
    };
  }
  return null;
}

function lesson2(p: Puzzle, all: Animal[], avoidRow: number): Lesson | null {
  for (const t of all.filter((a) => a.kind === DOG && a.r !== avoidRow)) {
    const placed = all.filter((a) => !same(a, t));
    return {
      step: 2,
      title: 'And one dog, too',
      body: `Every row also needs one dog. Row ${t.r + 1} has its cat already. Pick Dog below, then tap the open cell.`,
      success: 'Each row, column and color holds one cat and one dog.',
      puzzle: withGivens(p, placed, 'tutorial-lesson-2'),
      marks: rowMarks(p, placed, t.r, [t]),
      highlight: [{ kind: 'row', index: t.r }],
      target: { r: t.r, c: t.c, species: DOG },
      decoy: null,
      tool: 'cat',
    };
  }
  return null;
}

function lesson3(p: Puzzle, all: Animal[]): Lesson | null {
  for (const t of all.filter((a) => a.kind === CAT)) {
    const placed = all.filter((a) => !same(a, t));
    for (let c = 0; c < p.size; c++) {
      const d = { r: t.r, c };
      if (same(d, t) || placed.some((a) => same(a, d))) continue;
      const marks = rowMarks(p, placed, t.r, [t, d]);
      const lp = withGivens(p, placed, 'tutorial-lesson-3');
      if (violation(lp, marks, d, CAT) !== 'duplicate_species_in_column') continue;
      if (violation(lp, marks, t, CAT)) continue;
      return {
        step: 3,
        title: 'Columns and colors count too',
        body: `Columns and color regions also get one cat and one dog each. Row ${t.r + 1} has two open cells, but one of them is in a column that already has its cat. Place the cat in the other.`,
        success: 'Check rows, columns and colors together. That’s the whole puzzle.',
        puzzle: lp,
        marks,
        highlight: [{ kind: 'row', index: t.r }],
        target: { r: t.r, c: t.c, species: CAT },
        decoy: d,
        tool: 'cat',
      };
    }
  }
  return null;
}

function lesson4(p: Puzzle, all: Animal[]): Lesson | null {
  // Remove the target dog and the dog in the decoy's column, so only adjacency rules the decoy out.
  for (const t of all.filter((a) => a.kind === DOG)) {
    for (let c = 0; c < p.size; c++) {
      const d = { r: t.r, c };
      if (same(d, t) || p.solution[d.r][d.c] !== EMPTY) continue;
      const u = all.find((a) => a.kind === DOG && a.c === d.c);
      if (!u) continue;
      const placed = all.filter((a) => !same(a, t) && !same(a, u));
      const cats = placed.filter((a) => a.kind === CAT);
      if (!cats.some((cat) => orth(cat, d))) continue;
      const marks = rowMarks(p, placed, t.r, [t, d]);
      const lp = withGivens(p, placed, 'tutorial-lesson-4');
      if (violation(lp, marks, d, DOG) !== 'adjacent_conflict') continue;
      if (violation(lp, marks, t, DOG)) continue;
      if (!cats.some((cat) => diag(cat, t))) continue; // the right cell shows "corners are fine"
      return {
        step: 4,
        title: 'Never side by side',
        body: `A cat and a dog can’t share an edge, but touching corners is fine. Row ${t.r + 1} has two open cells; one is right beside a cat. Place the dog in the other.`,
        success: 'Corners are fine; sides are not. You know all the rules now.',
        puzzle: lp,
        marks,
        highlight: [{ kind: 'row', index: t.r }],
        target: { r: t.r, c: t.c, species: DOG },
        decoy: d,
        tool: 'dog',
      };
    }
  }
  return null;
}

function lesson5(mini: Puzzle): Lesson {
  return {
    step: 5,
    title: 'Your first puzzle',
    body: 'Solve this board on your own. Start where a row, column or color has only one spot left. Tap Hint if you get stuck.',
    success: 'Solved! You’re ready for the campaign.',
    puzzle: { ...mini, id: 'tutorial-lesson-5' },
    marks: [],
    highlight: [],
    target: null,
    decoy: null,
    tool: 'cat',
  };
}

/** Builds the five lessons from a pool of easy 5×5 puzzles: the first that supports lessons 1–4 is the base; another is the mini puzzle. */
export function buildLessons(pool: Puzzle[]): Lesson[] | null {
  for (const base of pool) {
    const all = animalsOf(base);
    const l1 = lesson1(base, all);
    const l2 = l1 && lesson2(base, all, l1.target!.r);
    const l3 = lesson3(base, all);
    const l4 = lesson4(base, all);
    const mini = pool.find((p) => p !== base);
    if (l1 && l2 && l3 && l4 && mini) return [l1, l2, l3, l4, lesson5(mini)];
  }
  return null;
}

/** A Session for a lesson, with its marks pre-set. Zen rules: only visible rule breaks are blocked. */
export function lessonSession(l: Lesson): Session {
  const s = new Session(l.puzzle, 'zen');
  for (const m of l.marks) s.preset(m.r, m.c, MARK);
  s.tool = l.tool;
  return s;
}

export function lessonComplete(l: Lesson, s: Session): boolean {
  if (!l.target) return s.outcome === 'won';
  const v: CellValue = s.cells[l.target.r][l.target.c];
  return v === l.target.species;
}
