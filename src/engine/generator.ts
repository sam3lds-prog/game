/**
 * Puzzle generator.
 *
 *  1. Place a valid cat permutation + dog permutation (the hidden solution).
 *  2. Pair each cat with a dog and carve a connected region around each pair.
 *  3. Add one given (breaks the cat↔dog swap symmetry).
 *  4. Keep it only if the exact solver finds exactly one solution.
 *  5. Grade with the deduction engine.
 */

import { CAT, DOG, EMPTY, type Difficulty, type Given, type Kind, type Puzzle, type Species, makeGrid } from './types';
import { countSolutions } from './solver';
import { applyMove, createBoard, deduce, nextMove, type Technique } from './deduce';
import { mulberry32, randInt, shuffle, type Rng } from './rng';

/** Step 1: random valid double placement, row by row. */
function placeAnimals(n: number, rng: Rng): { cat: number[]; dog: number[] } | null {
  const cat = new Array<number>(n).fill(-1);
  const dog = new Array<number>(n).fill(-1);
  const catUsed = new Array<boolean>(n).fill(false);
  const dogUsed = new Array<boolean>(n).fill(false);
  let budget = 20000;

  function rec(r: number): boolean {
    if (r === n) return true;
    if (--budget < 0) return false;
    const pc = r > 0 ? cat[r - 1] : -99;
    const pd = r > 0 ? dog[r - 1] : -99;
    for (const cc of shuffle(rng, [...Array(n).keys()])) {
      if (catUsed[cc] || cc === pd) continue; // not below a dog
      for (const dc of shuffle(rng, [...Array(n).keys()])) {
        if (dogUsed[dc] || dc === cc || Math.abs(dc - cc) < 2 || dc === pc) continue; // not beside the cat, not below a cat
        cat[r] = cc;
        dog[r] = dc;
        catUsed[cc] = dogUsed[dc] = true;
        if (rec(r + 1)) return true;
        catUsed[cc] = dogUsed[dc] = false;
        cat[r] = dog[r] = -1;
        if (budget < 0) return false;
      }
    }
    return false;
  }
  return rec(0) ? { cat, dog } : null;
}

/** Step 2: pair cats with dogs (greedy nearest, random tie-break), carve paths, then grow regions to fill the grid. */
function buildRegions(n: number, cat: number[], dog: number[], rng: Rng): number[][] | null {
  const regions = makeGrid<number>(n, -1);
  const isAnimal = makeGrid<boolean>(n, false);
  for (let r = 0; r < n; r++) {
    isAnimal[r][cat[r]] = true;
    isAnimal[r][dog[r]] = true;
  }

  // Pair up: list all (catRow, dogRow) pairs by distance, greedy assignment.
  const pairs: Array<{ cr: number; dr: number; d: number }> = [];
  for (let cr = 0; cr < n; cr++)
    for (let dr = 0; dr < n; dr++) pairs.push({ cr, dr, d: Math.abs(cr - dr) + Math.abs(cat[cr] - dog[dr]) + rng() * 0.9 });
  pairs.sort((a, b) => a.d - b.d);
  const catPaired = new Array<boolean>(n).fill(false);
  const dogPaired = new Array<boolean>(n).fill(false);
  const chosen: Array<{ cr: number; dr: number; d: number }> = [];
  for (const p of pairs) {
    if (catPaired[p.cr] || dogPaired[p.dr]) continue;
    catPaired[p.cr] = dogPaired[p.dr] = true;
    chosen.push(p);
    if (chosen.length === n) break;
  }

  // Carve a random shortest path per pair through unassigned, non-animal cells.
  const dirs: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  chosen.forEach((p, id) => {
    const start: [number, number] = [p.cr, cat[p.cr]];
    const goal: [number, number] = [p.dr, dog[p.dr]];
    const prev = makeGrid<number>(n, -2); // -2 unvisited, else packed parent
    const q: Array<[number, number]> = [start];
    prev[start[0]][start[1]] = -1;
    let found = false;
    while (q.length && !found) {
      const [r, c] = q.shift()!;
      for (const [dr, dc] of shuffle(rng, dirs)) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        if (prev[rr][cc] !== -2) continue;
        const isGoal = rr === goal[0] && cc === goal[1];
        if (!isGoal && (regions[rr][cc] !== -1 || isAnimal[rr][cc])) continue;
        prev[rr][cc] = r * n + c;
        if (isGoal) {
          found = true;
          break;
        }
        q.push([rr, cc]);
      }
    }
    if (!found) return;
    let cur = goal[0] * n + goal[1];
    while (cur !== -1) {
      const r = Math.floor(cur / n);
      const c = cur % n;
      regions[r][c] = id;
      cur = prev[r][c];
    }
  });
  if (chosen.some((_, id) => !regions.flat().includes(id))) return null;
  for (let r = 0; r < n; r++) if (regions[r][cat[r]] === -1 || regions[r][dog[r]] === -1) return null;

  // Grow: repeatedly pick a random unassigned cell next to an assigned one and join a random assigned neighbor's region.
  let remaining = regions.flat().filter((v) => v === -1).length;
  let stall = 0;
  while (remaining > 0 && stall < 50) {
    const frontier: Array<[number, number, number[]]> = [];
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (regions[r][c] !== -1) continue;
        const nb: number[] = [];
        for (const [dr, dc] of dirs) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
          if (regions[rr][cc] !== -1) nb.push(regions[rr][cc]);
        }
        if (nb.length) frontier.push([r, c, nb]);
      }
    if (!frontier.length) return null;
    // Grow a handful of cells per pass for organic shapes.
    const picks = shuffle(rng, frontier).slice(0, Math.max(1, Math.floor(frontier.length / 3)));
    for (const [r, c, nb] of picks) {
      if (regions[r][c] !== -1) continue;
      regions[r][c] = nb[randInt(rng, nb.length)];
      remaining--;
    }
    stall++;
  }
  if (remaining > 0) return null;
  return regions;
}

export interface GenerateOptions {
  size: number;
  seed: number;
  /** Preferred difficulty; the generator tries up to `tries` candidates to match it, then returns the closest seen. */
  difficulty?: Difficulty;
  tries?: number;
}

const DIFF_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, expert: 3 };

/**
 * Difficulty = hardest technique the deduction engine needed, nudged by how sparse the givens are.
 * Every puzzle we ship is solvable by pure logic (no guessing), because the generator only accepts
 * puzzles the engine can finish.
 */
function grade(size: number, hardest: Technique | null, givenCount: number): Difficulty {
  const sparse = givenCount <= Math.max(1, Math.round(size / 3));
  if (hardest === null || hardest === 'single') return sparse && size >= 7 ? 'medium' : 'easy';
  if (hardest === 'pointing') return sparse ? 'hard' : 'medium';
  return sparse && size >= 8 ? 'expert' : 'hard';
}

/**
 * Builds a deducible given-set for a known solution:
 *  1. start with one random given (breaks cat↔dog swap symmetry)
 *  2. while the engine is stuck, reveal one more animal it could not place
 *  3. then try removing givens one by one, keeping the puzzle deducible
 */
function chooseGivens(n: number, regions: number[][], solution: Kind[][], rng: Rng): { givens: Given[]; hardest: Technique | null } | null {
  const animals: Given[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (solution[r][c] !== EMPTY) animals.push({ r, c, kind: solution[r][c] as Species });

  let givens: Given[] = [animals[randInt(rng, animals.length)]];
  let rep = deduce(n, regions, givens);
  let guard = 0;
  while (!rep.solved && guard++ < 3 * n) {
    // Reveal an animal the engine has not placed yet.
    const b = createBoard(n, regions, givens);
    for (;;) {
      const m = nextMove(b);
      if (!m) break;
      applyMove(b, m);
    }
    const unplaced = animals.filter((a) => b.placed[a.r][a.c] === EMPTY);
    if (!unplaced.length) break;
    givens = givens.concat([unplaced[randInt(rng, unplaced.length)]]);
    rep = deduce(n, regions, givens);
  }
  if (!rep.solved) return null;

  // Minimize.
  for (const g of shuffle(rng, givens.slice())) {
    if (givens.length <= 1) break;
    const trial = givens.filter((x) => x !== g);
    const r2 = deduce(n, regions, trial);
    if (r2.solved) {
      givens = trial;
      rep = r2;
    }
  }
  return { givens, hardest: rep.hardest };
}

/** Generates a puzzle deterministically from (size, seed). Always valid, unique, and solvable without guessing. */
export function generatePuzzle(opts: GenerateOptions): Puzzle {
  const { size: n, seed } = opts;
  const rng = mulberry32((seed ^ (n * 0x9e3779b9)) >>> 0);
  const tries = opts.tries ?? 30;
  let best: Puzzle | null = null;
  let bestDist = Infinity;

  for (let attempt = 0; attempt < 2000; attempt++) {
    const placed = placeAnimals(n, rng);
    if (!placed) continue;
    const regions = buildRegions(n, placed.cat, placed.dog, rng);
    if (!regions) continue;

    const solution: Kind[][] = makeGrid<Kind>(n, EMPTY);
    for (let r = 0; r < n; r++) {
      solution[r][placed.cat[r]] = CAT;
      solution[r][placed.dog[r]] = DOG;
    }

    const chosen = chooseGivens(n, regions, solution, rng);
    if (!chosen) continue;

    // Belt and braces: the exact solver must agree the solution is unique.
    const res = countSolutions(n, regions, chosen.givens, 2);
    if (res.count !== 1) continue;

    const difficulty = grade(n, chosen.hardest, chosen.givens.length);
    const puzzle: Puzzle = { size: n, regions, givens: chosen.givens, solution, difficulty, seed };

    if (!opts.difficulty) return puzzle;
    const dist = Math.abs(DIFF_RANK[difficulty] - DIFF_RANK[opts.difficulty]);
    if (dist === 0) return puzzle;
    if (dist < bestDist) {
      bestDist = dist;
      best = puzzle;
    }
    if (best && attempt >= tries) return best;
  }
  if (best) return best;
  throw new Error(`Could not generate a ${n}×${n} puzzle for seed ${seed}`);
}
