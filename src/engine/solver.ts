/**
 * Exact solver for Cats vs Dogs.
 *
 * Rules:
 *  1. Every row, column and region holds exactly one CAT and one DOG.
 *  2. A cat and a dog never sit side by side (4-neighborhood). Diagonal is fine.
 *     (Same-species neighbors are already impossible: one per row and one per column.)
 *
 * Solves row by row: each row picks (catCol, dogCol). Pruning keeps it fast for n ≤ 10.
 */

import { CAT, DOG, EMPTY, type Given, type Kind, makeGrid } from './types';

export interface SolveResult {
  count: number; // number of solutions found (capped at `limit`)
  solution: Kind[][] | null; // first solution found
  nodes: number; // search nodes visited — a rough hardness signal
}

export function countSolutions(
  size: number,
  regions: number[][],
  givens: Given[],
  limit = 2,
): SolveResult {
  const n = size;
  const catCol = new Array<number>(n).fill(-1);
  const dogCol = new Array<number>(n).fill(-1);
  const catColUsed = new Array<boolean>(n).fill(false);
  const dogColUsed = new Array<boolean>(n).fill(false);
  const catRegUsed = new Array<boolean>(n).fill(false);
  const dogRegUsed = new Array<boolean>(n).fill(false);

  // Fixed cells from givens: fixed[r][c] = CAT | DOG | EMPTY(unconstrained)
  const fixed = makeGrid<Kind>(n, EMPTY);
  const rowFixedCat = new Array<number>(n).fill(-1);
  const rowFixedDog = new Array<number>(n).fill(-1);
  for (const g of givens) {
    fixed[g.r][g.c] = g.kind;
    if (g.kind === CAT) rowFixedCat[g.r] = g.c;
    else rowFixedDog[g.r] = g.c;
  }

  let count = 0;
  let nodes = 0;
  let first: Kind[][] | null = null;

  function recordSolution() {
    count++;
    if (!first) {
      first = makeGrid<Kind>(n, EMPTY);
      for (let r = 0; r < n; r++) {
        first[r][catCol[r]] = CAT;
        first[r][dogCol[r]] = DOG;
      }
    }
  }

  function place(r: number): void {
    if (count >= limit) return;
    if (r === n) {
      recordSolution();
      return;
    }
    nodes++;
    const prevCat = r > 0 ? catCol[r - 1] : -99;
    const prevDog = r > 0 ? dogCol[r - 1] : -99;
    void prevCat;

    const ccStart = rowFixedCat[r] >= 0 ? rowFixedCat[r] : 0;
    const ccEnd = rowFixedCat[r] >= 0 ? rowFixedCat[r] : n - 1;
    for (let cc = ccStart; cc <= ccEnd; cc++) {
      if (catColUsed[cc]) continue;
      if (cc === prevDog) continue; // cat directly below a dog
      const creg = regions[r][cc];
      if (catRegUsed[creg]) continue;
      if (fixed[r][cc] === DOG) continue;

      const dcStart = rowFixedDog[r] >= 0 ? rowFixedDog[r] : 0;
      const dcEnd = rowFixedDog[r] >= 0 ? rowFixedDog[r] : n - 1;
      for (let dc = dcStart; dc <= dcEnd; dc++) {
        if (dc === cc || dogColUsed[dc]) continue;
        if (Math.abs(dc - cc) < 2) continue; // cat & dog side by side in this row
        if (dc === prevCat) continue; // dog directly below a cat
        const dreg = regions[r][dc];
        if (dogRegUsed[dreg]) continue;
        if (fixed[r][dc] === CAT) continue;

        catCol[r] = cc;
        dogCol[r] = dc;
        catColUsed[cc] = dogColUsed[dc] = true;
        catRegUsed[creg] = dogRegUsed[dreg] = true;
        place(r + 1);
        catColUsed[cc] = dogColUsed[dc] = false;
        catRegUsed[creg] = dogRegUsed[dreg] = false;
        catCol[r] = dogCol[r] = -1;
        if (count >= limit) return;
      }
    }
  }

  place(0);
  return { count, solution: first, nodes };
}

/** Validates a full grid against the rules (used by tests and the win check). */
export function isValidSolution(size: number, regions: number[][], grid: Kind[][]): boolean {
  const n = size;
  const rowCount = [new Array(n).fill(0), new Array(n).fill(0), new Array(n).fill(0)];
  const colCount = [new Array(n).fill(0), new Array(n).fill(0), new Array(n).fill(0)];
  const regCount = [new Array(n).fill(0), new Array(n).fill(0), new Array(n).fill(0)];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const k = grid[r][c];
      if (k === EMPTY) continue;
      rowCount[k][r]++;
      colCount[k][c]++;
      regCount[k][regions[r][c]]++;
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        if (grid[rr][cc] !== EMPTY) return false; // two animals side by side
      }
    }
  }
  for (const k of [CAT, DOG]) {
    for (let i = 0; i < n; i++) {
      if (rowCount[k][i] !== 1 || colCount[k][i] !== 1 || regCount[k][i] !== 1) return false;
    }
  }
  return true;
}
