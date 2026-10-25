/**
 * Human-style deduction engine.
 *
 * Used for two things:
 *  - grading difficulty (which techniques are needed to solve without guessing)
 *  - hints (the next move a careful human could deduce)
 *
 * Techniques, in order of "cost":
 *  1. singles        — a unit (row/col/region) has exactly one candidate cell for a species
 *  2. pointing       — all candidates of a unit for a species share a row/col (or a region) → eliminate elsewhere
 *  3. neighbor-lock  — every candidate of a unit for a species sits beside cell X → X can't hold the other species
 *                      (nor this one, unless X is itself one of the candidates)
 */

import { CAT, DOG, EMPTY, type Given, type Kind, type Species, makeGrid, otherSpecies } from './types';

export type Technique = 'single' | 'pointing' | 'neighbor-lock';

export interface Board {
  size: number;
  regions: number[][];
  /** placed[r][c] */
  placed: Kind[][];
  /** cand[s][r][c] — may species s still go in (r,c)? index 1 = CAT, 2 = DOG */
  cand: boolean[][][];
}

export interface Move {
  kind: 'place' | 'eliminate';
  species: Species;
  r: number;
  c: number;
  technique: Technique;
  /** For hints: why this move is forced. */
  reason: string;
}

export function createBoard(size: number, regions: number[][], givens: Given[], placed?: Kind[][]): Board {
  const b: Board = {
    size,
    regions,
    placed: makeGrid<Kind>(size, EMPTY),
    cand: [[], makeGrid(size, true), makeGrid(size, true)],
  };
  for (const g of givens) applyPlacement(b, g.r, g.c, g.kind);
  if (placed) {
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) if (placed[r][c] !== EMPTY && b.placed[r][c] === EMPTY) applyPlacement(b, r, c, placed[r][c] as Species);
  }
  return b;
}

/** Places a species at (r,c) and propagates the direct eliminations the rules imply. */
export function applyPlacement(b: Board, r: number, c: number, s: Species): void {
  const n = b.size;
  b.placed[r][c] = s;
  b.cand[CAT][r][c] = false;
  b.cand[DOG][r][c] = false;
  const o = otherSpecies(s);
  const reg = b.regions[r][c];
  for (let i = 0; i < n; i++) {
    b.cand[s][r][i] = false; // same row
    b.cand[s][i][c] = false; // same column
  }
  for (let rr = 0; rr < n; rr++)
    for (let cc = 0; cc < n; cc++) if (b.regions[rr][cc] === reg) b.cand[s][rr][cc] = false; // same region
  for (const [dr, dc] of N4) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
    b.cand[o][rr][cc] = false; // the other species can't sit beside this one
    b.cand[s][rr][cc] = false; // (already false via row/col; kept for clarity)
  }
}

const N4: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

type Unit = { name: string; cells: Array<[number, number]> };

function units(b: Board): Unit[] {
  const n = b.size;
  const out: Unit[] = [];
  for (let r = 0; r < n; r++) out.push({ name: `row ${r + 1}`, cells: Array.from({ length: n }, (_, c) => [r, c] as [number, number]) });
  for (let c = 0; c < n; c++) out.push({ name: `column ${c + 1}`, cells: Array.from({ length: n }, (_, r) => [r, c] as [number, number]) });
  const regCells: Array<Array<[number, number]>> = Array.from({ length: n }, () => []);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) regCells[b.regions[r][c]].push([r, c]);
  regCells.forEach((cells, i) => out.push({ name: `region ${i + 1}`, cells }));
  return out;
}

function unitHas(b: Board, u: Unit, s: Species): boolean {
  return u.cells.some(([r, c]) => b.placed[r][c] === s);
}

function candidatesIn(b: Board, u: Unit, s: Species): Array<[number, number]> {
  return u.cells.filter(([r, c]) => b.cand[s][r][c]);
}

/** Finds the next forced move, cheapest technique first. Returns null when stuck. */
export function nextMove(b: Board): Move | null {
  const us = units(b);
  const species: Species[] = [CAT, DOG];
  const label = (s: Species) => (s === CAT ? 'cat' : 'dog');

  // 1. singles
  for (const u of us)
    for (const s of species) {
      if (unitHas(b, u, s)) continue;
      const cs = candidatesIn(b, u, s);
      if (cs.length === 1) {
        const [r, c] = cs[0];
        return { kind: 'place', species: s, r, c, technique: 'single', reason: `Only one spot left for a ${label(s)} in ${u.name}.` };
      }
    }

  // 2. pointing (unit → line, and line → region)
  const n = b.size;
  for (const u of us)
    for (const s of species) {
      if (unitHas(b, u, s)) continue;
      const cs = candidatesIn(b, u, s);
      if (cs.length < 2) continue;
      const rows = new Set(cs.map(([r]) => r));
      const cols = new Set(cs.map(([, c]) => c));
      const regs = new Set(cs.map(([r, c]) => b.regions[r][c]));
      const inUnit = new Set(u.cells.map(([r, c]) => r * n + c));
      const tryEliminate = (cells: Array<[number, number]>, why: string): Move | null => {
        for (const [r, c] of cells) {
          if (inUnit.has(r * n + c)) continue;
          if (b.cand[s][r][c]) return { kind: 'eliminate', species: s, r, c, technique: 'pointing', reason: why };
        }
        return null;
      };
      if (rows.size === 1 && !u.name.startsWith('row')) {
        const r = [...rows][0];
        const m = tryEliminate(Array.from({ length: n }, (_, c) => [r, c] as [number, number]), `Every ${label(s)} spot in ${u.name} is in row ${r + 1}, so the rest of row ${r + 1} can't hold a ${label(s)}.`);
        if (m) return m;
      }
      if (cols.size === 1 && !u.name.startsWith('column')) {
        const c = [...cols][0];
        const m = tryEliminate(Array.from({ length: n }, (_, r) => [r, c] as [number, number]), `Every ${label(s)} spot in ${u.name} is in column ${c + 1}, so the rest of column ${c + 1} can't hold a ${label(s)}.`);
        if (m) return m;
      }
      if (regs.size === 1 && !u.name.startsWith('region')) {
        const reg = [...regs][0];
        const cells: Array<[number, number]> = [];
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (b.regions[r][c] === reg) cells.push([r, c]);
        const m = tryEliminate(cells, `Every ${label(s)} spot in ${u.name} sits in region ${reg + 1}, so the rest of that region can't hold a ${label(s)}.`);
        if (m) return m;
      }
    }

  // 3. neighbor-lock: every candidate of a unit (for species s) is beside cell X, so the OTHER species can't go at X.
  //    If X is itself one of those candidates it may still hold s; otherwise X can hold nothing at all.
  for (const u of us)
    for (const s of species) {
      if (unitHas(b, u, s)) continue;
      const cs = candidatesIn(b, u, s);
      if (cs.length < 2) continue;
      const o = otherSpecies(s);
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          const self = cs.some(([rr, cc]) => rr === r && cc === c);
          const allBeside = cs.every(([rr, cc]) => (rr === r && cc === c) || Math.abs(rr - r) + Math.abs(cc - c) === 1);
          if (!allBeside) continue;
          if (b.cand[o][r][c]) {
            return { kind: 'eliminate', species: o, r, c, technique: 'neighbor-lock', reason: `Wherever the ${label(s)} of ${u.name} goes it would sit beside this cell, so no ${label(o)} here.` };
          }
          if (!self && b.cand[s][r][c]) {
            return { kind: 'eliminate', species: s, r, c, technique: 'neighbor-lock', reason: `Wherever the ${label(s)} of ${u.name} goes it would sit beside this cell, so no ${label(s)} here either.` };
          }
        }
    }

  return null;
}

export function applyMove(b: Board, m: Move): void {
  if (m.kind === 'place') applyPlacement(b, m.r, m.c, m.species);
  else b.cand[m.species][m.r][m.c] = false;
}

export interface DeductionReport {
  solved: boolean;
  hardest: Technique | null;
  moves: number;
}

/** Runs the engine to completion. Reports whether the puzzle is solvable by logic alone and the hardest technique needed. */
export function deduce(size: number, regions: number[][], givens: Given[]): DeductionReport {
  const b = createBoard(size, regions, givens);
  const rank: Record<Technique, number> = { single: 1, pointing: 2, 'neighbor-lock': 3 };
  let hardest: Technique | null = null;
  let moves = 0;
  for (;;) {
    const m = nextMove(b);
    if (!m) break;
    applyMove(b, m);
    moves++;
    if (!hardest || rank[m.technique] > rank[hardest]) hardest = m.technique;
    if (moves > size * size * 20) break; // safety
  }
  let placedCount = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (b.placed[r][c] !== EMPTY) placedCount++;
  return { solved: placedCount === 2 * size, hardest, moves };
}
