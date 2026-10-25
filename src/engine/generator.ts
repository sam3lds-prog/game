/**
 * Puzzle generator v2.
 *
 *  1. Place a valid cat permutation + dog permutation (the hidden solution).
 *  2. Pair each cat with a dog and grow a connected region around each pair.
 *  3. Choose givens so the board is solvable with techniques up to the target tier, then remove
 *     every given that is not needed (always ≥ 1: it breaks the cat↔dog swap symmetry).
 *  4. Keep it only if the exact solver confirms exactly one solution.
 *  5. Grade it honestly from the deduction trace. A puzzle is never labeled with a difficulty it
 *     doesn't have: `generateExact` returns null rather than a near miss.
 */
import { CAT, DOG, EMPTY, type Difficulty, type Given, type Kind, type Puzzle, type Species, makeGrid } from './types';
import { countSolutions } from './solver';
import { Grid, Topology, solve, stepCode, type SolveReport } from './deduce';
import { mulberry32, randInt, shuffle, type Rng } from './rng';

export const ENGINE_VERSION = 'engine-2';

/** Tier ceiling used while choosing givens, and the minimum tier the puzzle must need. */
export const DIFFICULTY_TIERS: Record<Difficulty, { maxTier: number; minTier: number }> = {
  easy: { maxTier: 1, minTier: 0 },
  medium: { maxTier: 2, minTier: 2 },
  hard: { maxTier: 4, minTier: 3 },
  expert: { maxTier: 5, minTier: 4 },
};

export interface Grade {
  difficulty: Difficulty;
  maxTier: number;
  steps: number;
  hardSteps: number;
  tier4Steps: number;
  forcingSteps: number;
  givens: number;
  avgOptions: number;
  /** Higher = harder; orders puzzles within a difficulty. */
  score: number;
}

export function gradeFromReport(n: number, rep: SolveReport, givens: number): Grade {
  let difficulty: Difficulty;
  if (rep.maxTier <= 1) difficulty = 'easy';
  else if (rep.maxTier === 2) difficulty = 'medium';
  else if (rep.maxTier === 3 || (rep.maxTier === 4 && rep.tier4Steps <= 1)) difficulty = 'hard';
  else difficulty = 'expert';
  const density = givens / (2 * n);
  const score = rep.maxTier * 10 + rep.hardSteps * 2 + rep.forcingSteps * 4 + (1 - density) * 6 + rep.stepCount * 0.08 - rep.avgOptions * 1.5 + n;
  return {
    difficulty,
    maxTier: rep.maxTier,
    steps: rep.stepCount,
    hardSteps: rep.hardSteps,
    tier4Steps: rep.tier4Steps,
    forcingSteps: rep.forcingSteps,
    givens,
    avgOptions: Math.round(rep.avgOptions * 100) / 100,
    score: Math.round(score * 100) / 100,
  };
}

// ---------------------------------------------------------------- solution + regions

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
      if (catUsed[cc] || cc === pd) continue;
      for (const dc of shuffle(rng, [...Array(n).keys()])) {
        if (dogUsed[dc] || Math.abs(dc - cc) < 2 || dc === pc) continue;
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

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function buildRegions(n: number, cat: number[], dog: number[], rng: Rng): number[][] | null {
  const regions = makeGrid<number>(n, -1);
  const isAnimal = makeGrid<boolean>(n, false);
  for (let r = 0; r < n; r++) {
    isAnimal[r][cat[r]] = true;
    isAnimal[r][dog[r]] = true;
  }
  const pairs: Array<{ cr: number; dr: number; d: number }> = [];
  for (let cr = 0; cr < n; cr++) for (let dr = 0; dr < n; dr++) pairs.push({ cr, dr, d: Math.abs(cr - dr) + Math.abs(cat[cr] - dog[dr]) + rng() * 0.9 });
  pairs.sort((a, b) => a.d - b.d);
  const catPaired = new Array<boolean>(n).fill(false);
  const dogPaired = new Array<boolean>(n).fill(false);
  const chosen: Array<{ cr: number; dr: number }> = [];
  for (const p of pairs) {
    if (catPaired[p.cr] || dogPaired[p.dr]) continue;
    catPaired[p.cr] = dogPaired[p.dr] = true;
    chosen.push(p);
    if (chosen.length === n) break;
  }
  for (let id = 0; id < chosen.length; id++) {
    const p = chosen[id];
    const start: [number, number] = [p.cr, cat[p.cr]];
    const goal: [number, number] = [p.dr, dog[p.dr]];
    const prev = makeGrid<number>(n, -2);
    const q: Array<[number, number]> = [start];
    prev[start[0]][start[1]] = -1;
    let found = false;
    while (q.length && !found) {
      const [r, c] = q.shift()!;
      for (const [dr, dc] of shuffle(rng, DIRS)) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n || prev[rr][cc] !== -2) continue;
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
    if (!found) return null;
    let cur = goal[0] * n + goal[1];
    while (cur !== -1) {
      const r = Math.floor(cur / n);
      const c = cur % n;
      regions[r][c] = id;
      cur = prev[r][c];
    }
  }
  let remaining = regions.flat().filter((v) => v === -1).length;
  let stall = 0;
  while (remaining > 0 && stall < 60) {
    const frontier: Array<[number, number, number[]]> = [];
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (regions[r][c] !== -1) continue;
        const nb: number[] = [];
        for (const [dr, dc] of DIRS) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && cc >= 0 && rr < n && cc < n && regions[rr][cc] !== -1) nb.push(regions[rr][cc]);
        }
        if (nb.length) frontier.push([r, c, nb]);
      }
    if (!frontier.length) return null;
    for (const [r, c, nb] of shuffle(rng, frontier).slice(0, Math.max(1, Math.floor(frontier.length / 3)))) {
      if (regions[r][c] !== -1) continue;
      regions[r][c] = nb[randInt(rng, nb.length)];
      remaining--;
    }
    stall++;
  }
  return remaining > 0 ? null : regions;
}

// ---------------------------------------------------------------- givens

function chooseGivens(t: Topology, solution: Kind[][], rng: Rng, maxTier: number): Given[] | null {
  const n = t.n;
  const animals: Given[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (solution[r][c] !== EMPTY) animals.push({ r, c, kind: solution[r][c] as Species });
  let givens: Given[] = [animals[randInt(rng, animals.length)]];
  let rep = solve(t, givens, { maxTier, keepSteps: false });
  let guard = 0;
  while (!rep.solved && guard++ < 2 * n) {
    const g = rep.grid;
    const unplaced = animals.filter((a) => g.cells[a.r * n + a.c] === EMPTY);
    if (!unplaced.length) break;
    givens = givens.concat([unplaced[randInt(rng, unplaced.length)]]);
    rep = solve(t, givens, { maxTier, keepSteps: false });
  }
  if (!rep.solved) return null;
  for (const g of shuffle(rng, givens.slice())) {
    if (givens.length <= 1) break;
    const trial = givens.filter((x) => x !== g);
    if (solve(t, trial, { maxTier, keepSteps: false }).solved) givens = trial;
  }
  return givens;
}

// ---------------------------------------------------------------- public API

export interface GenerateOptions {
  size: number;
  seed: number;
  /** Target difficulty. With generatePuzzle the result may differ (and is labeled honestly). */
  difficulty?: Difficulty;
  /** Candidate boards to try. */
  attempts?: number;
}

export interface GeneratedPuzzle extends Puzzle {
  grade: Grade;
  /** Compact trace of the logical solution path. */
  trace: string[];
}

function candidate(n: number, rng: Rng, maxTier: number, seed: number): GeneratedPuzzle | null {
  const placed = placeAnimals(n, rng);
  if (!placed) return null;
  const regions = buildRegions(n, placed.cat, placed.dog, rng);
  if (!regions) return null;
  const solution: Kind[][] = makeGrid<Kind>(n, EMPTY);
  for (let r = 0; r < n; r++) {
    solution[r][placed.cat[r]] = CAT;
    solution[r][placed.dog[r]] = DOG;
  }
  const t = new Topology(n, regions);
  const givens = chooseGivens(t, solution, rng, maxTier);
  if (!givens) return null;
  if (countSolutions(n, regions, givens, 2).count !== 1) return null;
  const rep = solve(t, givens, { maxTier: 5 });
  if (!rep.solved) return null;
  const grade = gradeFromReport(n, rep, givens.length);
  return { size: n, regions, givens, solution, difficulty: grade.difficulty, seed, grade, trace: rep.steps.map((s) => stepCode(t, s)) };
}

/** Exactly the requested difficulty, or null after `attempts` candidates. Deterministic per seed. */
export function generateExact(opts: GenerateOptions & { difficulty: Difficulty }): GeneratedPuzzle | null {
  const { size: n, seed, difficulty } = opts;
  const rng = mulberry32((seed ^ Math.imul(n, 0x9e3779b9)) >>> 0);
  const { maxTier, minTier } = DIFFICULTY_TIERS[difficulty];
  const attempts = opts.attempts ?? 60;
  for (let i = 0; i < attempts; i++) {
    const p = candidate(n, rng, maxTier, seed);
    if (p && p.difficulty === difficulty && p.grade.maxTier >= minTier) return p;
  }
  return null;
}

/**
 * Always returns a valid, unique, logic-solvable puzzle. If a target difficulty is given it tries
 * to hit it; the returned `difficulty` is always the puzzle's real grade.
 */
export function generatePuzzle(opts: GenerateOptions): GeneratedPuzzle {
  const { size: n, seed } = opts;
  if (opts.difficulty) {
    const exact = generateExact({ ...opts, difficulty: opts.difficulty, attempts: opts.attempts ?? 30 });
    if (exact) return exact;
  }
  const rng = mulberry32((seed ^ Math.imul(n, 0x85ebca6b) ^ 0x5bd1e995) >>> 0);
  const maxTier = opts.difficulty ? DIFFICULTY_TIERS[opts.difficulty].maxTier : 5;
  for (let i = 0; i < 2000; i++) {
    const p = candidate(n, rng, maxTier, seed);
    if (p) return p;
  }
  throw new Error(`Could not generate a ${n}×${n} puzzle for seed ${seed}`);
}

export { Grid, Topology };
