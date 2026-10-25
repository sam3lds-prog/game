/**
 * Deduction engine v2 — explainable, human-style logic.
 *
 * Every technique is a correct inference from the rules alone (never from the hidden solution),
 * and every step carries the units and cells that justify it plus a plain-language explanation.
 *
 * Techniques, cheapest first (tier = difficulty weight):
 *  1  last-spot  A row/column/region has exactly one cell left for its cat (or dog).
 *  2  confined   All of a unit's spots for a species lie in one other unit → clear the rest of that unit.
 *  2  squeeze    Every spot left for a unit's species sits beside cell X → X can't hold the other species
 *                (nor this species, unless X is one of those spots).
 *  3  locked-2   Two units of one kind keep their species inside two units of another kind → clear the
 *                rest of those two units (generalized all-different / Hall sets on each 2-D projection).
 *  4  locked-3, locked-4   Same with three or four units.
 *  5  forcing    Assume a pet in a cell, follow tier 1–2 logic; if some unit runs out of room, the
 *                assumption is impossible. One assumption, then plain propagation — no guessing.
 *
 * Board state uses typed arrays; the static topology (units, neighbors) is shared between clones.
 */
import { CAT, DOG, EMPTY, type Cell, type Given, type Kind, type Species } from './types';
import { REGION_NAMES } from './names';

export type Technique = 'last-spot' | 'confined' | 'squeeze' | 'locked-2' | 'locked-3' | 'locked-4' | 'forcing';
export const TECHNIQUE_TIER: Record<Technique, number> = {
  'last-spot': 1,
  confined: 2,
  squeeze: 2,
  'locked-2': 3,
  'locked-3': 4,
  'locked-4': 4,
  forcing: 5,
};
export const TECHNIQUE_CODE: Record<Technique, string> = {
  'last-spot': 'S',
  confined: 'C',
  squeeze: 'Q',
  'locked-2': 'K2',
  'locked-3': 'K3',
  'locked-4': 'K4',
  forcing: 'F',
};

export type UnitKind = 'row' | 'col' | 'region';
export interface UnitRef {
  kind: UnitKind;
  index: number;
}

export interface Step {
  technique: Technique;
  species: Species;
  /** Placement (for last-spot) or null. */
  place: Cell | null;
  /** Cells that can no longer hold `species` (for forcing: the assumed species). */
  eliminate: Cell[];
  /** Units to highlight when explaining. */
  units: UnitRef[];
  /** Cells that justify the step (a unit's remaining spots, or the assumed cell). */
  focus: Cell[];
  text: string;
}

// ---------------------------------------------------------------- topology

export class Topology {
  readonly n: number;
  readonly nn: number;
  readonly regions: number[][];
  /** units[u] = cell indices. 0..n-1 rows, n..2n-1 columns, 2n..3n-1 regions. */
  readonly units: number[][];
  /** For each cell: [rowUnit, colUnit, regionUnit]. */
  readonly unitsOf: Array<[number, number, number]>;
  readonly n4: number[][];

  constructor(n: number, regions: number[][]) {
    this.n = n;
    this.nn = n * n;
    this.regions = regions;
    this.units = [];
    for (let r = 0; r < n; r++) this.units.push(Array.from({ length: n }, (_, c) => r * n + c));
    for (let c = 0; c < n; c++) this.units.push(Array.from({ length: n }, (_, r) => r * n + c));
    for (let g = 0; g < n; g++) this.units.push([]);
    this.unitsOf = [];
    this.n4 = [];
    for (let i = 0; i < this.nn; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      this.units[2 * n + regions[r][c]].push(i);
      this.unitsOf.push([r, n + c, 2 * n + regions[r][c]]);
      const nb: number[] = [];
      if (r > 0) nb.push(i - n);
      if (r < n - 1) nb.push(i + n);
      if (c > 0) nb.push(i - 1);
      if (c < n - 1) nb.push(i + 1);
      this.n4.push(nb);
    }
  }

  unitRef(u: number): UnitRef {
    const n = this.n;
    return u < n ? { kind: 'row', index: u } : u < 2 * n ? { kind: 'col', index: u - n } : { kind: 'region', index: u - 2 * n };
  }

  unitName(u: number): string {
    const ref = this.unitRef(u);
    if (ref.kind === 'row') return `row ${ref.index + 1}`;
    if (ref.kind === 'col') return `column ${ref.index + 1}`;
    return `the ${REGION_NAMES[ref.index % REGION_NAMES.length]} region`;
  }

  cell(i: number): Cell {
    return { r: Math.floor(i / this.n), c: i % this.n };
  }
}

const SPECIES: Species[] = [CAT, DOG];
const sname = (s: Species) => (s === CAT ? 'cat' : 'dog');
const other = (s: Species): Species => (s === CAT ? DOG : CAT);

// ---------------------------------------------------------------- grid state

export class Grid {
  readonly t: Topology;
  /** 0 empty, 1 cat, 2 dog */
  readonly cells: Int8Array;
  /** cand[(s-1)*nn + i] */
  readonly cand: Uint8Array;
  /** has[(s-1)*3n + u] */
  readonly has: Uint8Array;
  placed = 0;
  broken = false;

  constructor(t: Topology, src?: Grid) {
    this.t = t;
    if (src) {
      this.cells = src.cells.slice();
      this.cand = src.cand.slice();
      this.has = src.has.slice();
      this.placed = src.placed;
      this.broken = src.broken;
    } else {
      this.cells = new Int8Array(t.nn);
      this.cand = new Uint8Array(2 * t.nn).fill(1);
      this.has = new Uint8Array(6 * t.n);
    }
  }

  clone(): Grid {
    return new Grid(this.t, this);
  }

  can(s: Species, i: number): boolean {
    return this.cand[(s - 1) * this.t.nn + i] === 1;
  }

  hasIn(s: Species, u: number): boolean {
    return this.has[(s - 1) * 3 * this.t.n + u] === 1;
  }

  eliminate(s: Species, i: number): void {
    this.cand[(s - 1) * this.t.nn + i] = 0;
  }

  place(i: number, s: Species): void {
    const t = this.t;
    if (this.cells[i] !== EMPTY) {
      if (this.cells[i] !== s) this.broken = true;
      return;
    }
    if (!this.can(s, i)) this.broken = true;
    this.cells[i] = s;
    this.placed++;
    const o = other(s);
    this.eliminate(CAT, i);
    this.eliminate(DOG, i);
    for (const u of t.unitsOf[i]) {
      this.has[(s - 1) * 3 * t.n + u] = 1;
      for (const j of t.units[u]) this.eliminate(s, j);
    }
    for (const j of t.n4[i]) {
      this.eliminate(o, j);
      this.eliminate(s, j);
    }
  }

  /** Candidate cells of unit u for species s. */
  spots(u: number, s: Species): number[] {
    const out: number[] = [];
    const base = (s - 1) * this.t.nn;
    for (const i of this.t.units[u]) if (this.cand[base + i]) out.push(i);
    return out;
  }

  get solved(): boolean {
    return this.placed === 2 * this.t.n && !this.broken;
  }

  /** A unit that still needs a species but has no room left, or null. */
  deadEnd(): { u: number; s: Species } | null {
    if (this.broken) return { u: 0, s: CAT };
    const t = this.t;
    for (let u = 0; u < 3 * t.n; u++)
      for (const s of SPECIES) {
        if (this.hasIn(s, u)) continue;
        let any = false;
        const base = (s - 1) * t.nn;
        for (const i of t.units[u])
          if (this.cand[base + i]) {
            any = true;
            break;
          }
        if (!any) return { u, s };
      }
    return null;
  }

  static from(t: Topology, givens: Given[], kinds?: Kind[][]): Grid {
    const g = new Grid(t);
    for (const gv of givens) g.place(gv.r * t.n + gv.c, gv.kind);
    if (kinds)
      for (let r = 0; r < t.n; r++)
        for (let c = 0; c < t.n; c++) {
          const k = kinds[r][c];
          if (k !== EMPTY && g.cells[r * t.n + c] === EMPTY) g.place(r * t.n + c, k as Species);
        }
    return g;
  }
}

// ---------------------------------------------------------------- techniques

function lastSpot(g: Grid): Step | null {
  const t = g.t;
  for (let u = 0; u < 3 * t.n; u++)
    for (const s of SPECIES) {
      if (g.hasIn(s, u)) continue;
      const sp = g.spots(u, s);
      if (sp.length === 1) {
        const where = sp[0];
        return {
          technique: 'last-spot',
          species: s,
          place: t.cell(where),
          eliminate: [],
          units: [t.unitRef(u)],
          focus: [t.cell(where)],
          text: `${cap(t.unitName(u))} has only one place left for its ${sname(s)}.`,
        };
      }
    }
  return null;
}

function confined(g: Grid): Step | null {
  const t = g.t;
  const n = t.n;
  for (let u = 0; u < 3 * n; u++)
    for (const s of SPECIES) {
      if (g.hasIn(s, u)) continue;
      const sp = g.spots(u, s);
      if (sp.length < 2) continue;
      for (let k = 0; k < 3; k++) {
        const target = t.unitsOf[sp[0]][k];
        if (target === u) continue;
        if (!sp.every((i) => t.unitsOf[i][k] === target)) continue;
        const inU = new Set(t.units[u]);
        const elim = t.units[target].filter((i) => !inU.has(i) && g.can(s, i));
        if (!elim.length) continue;
        return {
          technique: 'confined',
          species: s,
          place: null,
          eliminate: elim.map((i) => t.cell(i)),
          units: [t.unitRef(u), t.unitRef(target)],
          focus: sp.map((i) => t.cell(i)),
          text: `Every spot left for the ${sname(s)} of ${t.unitName(u)} is in ${t.unitName(target)}, so nothing else in ${t.unitName(target)} can hold a ${sname(s)}.`,
        };
      }
    }
  return null;
}

function squeeze(g: Grid): Step | null {
  const t = g.t;
  for (let u = 0; u < 3 * t.n; u++)
    for (const s of SPECIES) {
      if (g.hasIn(s, u)) continue;
      const sp = g.spots(u, s);
      if (sp.length < 2) continue;
      const o = other(s);
      const spSet = new Set(sp);
      for (const x of [sp[0], ...t.n4[sp[0]]]) {
        if (!sp.every((i) => i === x || t.n4[x].includes(i))) continue;
        const elim: Array<[Species, number]> = [];
        if (g.can(o, x)) elim.push([o, x]);
        if (!spSet.has(x) && g.can(s, x)) elim.push([s, x]);
        if (!elim.length) continue;
        const sameOnly = elim.every(([sp2]) => sp2 === s);
        // Report the other-species elimination first (the two-species insight); same-species follows next step.
        const [es, ex] = elim.find(([sp2]) => sp2 === o) ?? elim[0];
        return {
          technique: 'squeeze',
          species: es,
          place: null,
          eliminate: [t.cell(ex)],
          units: [t.unitRef(u)],
          focus: sp.map((i) => t.cell(i)),
          text: sameOnly
            ? `Wherever the ${sname(s)} of ${t.unitName(u)} goes, it would sit beside this cell, so no ${sname(s)} can go here.`
            : `Wherever the ${sname(s)} of ${t.unitName(u)} goes, it would sit beside this cell, so a ${sname(o)} can't go here.`,
        };
      }
    }
  return null;
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

const KIND_OFFSET: Record<UnitKind, number> = { row: 0, col: 1, region: 2 };
const KIND_PAIRS: Array<[UnitKind, UnitKind]> = [
  ['row', 'region'],
  ['col', 'region'],
  ['region', 'row'],
  ['region', 'col'],
  ['row', 'col'],
  ['col', 'row'],
];

function lockedSet(g: Grid, k: number): Step | null {
  const t = g.t;
  const n = t.n;
  for (const s of SPECIES)
    for (const [ka, kb] of KIND_PAIRS) {
      const offA = KIND_OFFSET[ka] * n;
      const idxB = KIND_OFFSET[kb];
      // For each A-unit still needing s: bitmask of B-units containing its spots.
      const open: Array<{ u: number; mask: number }> = [];
      for (let a = 0; a < n; a++) {
        const u = offA + a;
        if (g.hasIn(s, u)) continue;
        let mask = 0;
        for (const i of g.spots(u, s)) mask |= 1 << (t.unitsOf[i][idxB] - idxB * n);
        if (mask) open.push({ u, mask });
      }
      if (open.length <= k) continue;
      const pick: number[] = [];
      const found = (start: number, acc: number): Step | null => {
        if (pick.length === k) {
          if (popcount(acc) !== k) return null;
          const aUnits = pick.map((p) => open[p].u);
          const inA = new Set(aUnits.flatMap((u) => t.units[u]));
          const bUnits: number[] = [];
          for (let b = 0; b < n; b++) if (acc & (1 << b)) bUnits.push(idxB * n + b);
          const elim: number[] = [];
          for (const bu of bUnits) for (const i of t.units[bu]) if (!inA.has(i) && g.can(s, i)) elim.push(i);
          if (!elim.length) return null;
          const names = (us: number[]) => joinNames(us.map((u) => t.unitName(u)));
          return {
            technique: `locked-${k}` as Technique,
            species: s,
            place: null,
            eliminate: elim.map((i) => t.cell(i)),
            units: [...aUnits, ...bUnits].map((u) => t.unitRef(u)),
            focus: aUnits.flatMap((u) => g.spots(u, s)).map((i) => t.cell(i)),
            text: `The ${sname(s)}s of ${names(aUnits)} must sit inside ${names(bUnits)}. That uses up ${k === 2 ? 'both' : `all ${k}`}, so no other ${sname(s)} can go in ${names(bUnits)}.`,
          };
        }
        for (let p = start; p < open.length; p++) {
          const next = acc | open[p].mask;
          if (popcount(next) > k) continue;
          pick.push(p);
          const r = found(p + 1, next);
          pick.pop();
          if (r) return r;
        }
        return null;
      };
      const step = found(0, 0);
      if (step) return step;
    }
  return null;
}

/** Tier 1–2 propagation used inside forcing. Returns the dead end it hits, or null. */
function propagate(g: Grid, limit = 400): { u: number; s: Species } | null {
  for (let i = 0; i < limit; i++) {
    const dead = g.deadEnd();
    if (dead) return dead;
    if (g.solved) return null;
    const step = lastSpot(g) ?? confined(g) ?? squeeze(g);
    if (!step) return null;
    applyStep(g, step);
  }
  return null;
}

function forcing(g: Grid): Step | null {
  const t = g.t;
  for (let i = 0; i < t.nn; i++)
    for (const s of SPECIES) {
      if (!g.can(s, i)) continue;
      const trial = g.clone();
      trial.place(i, s);
      const dead = propagate(trial);
      if (!dead) continue;
      const where = t.cell(i);
      return {
        technique: 'forcing',
        species: s,
        place: null,
        eliminate: [where],
        units: [t.unitRef(dead.u)],
        focus: [where],
        text: `If a ${sname(s)} sat here, ${t.unitName(dead.u)} would end up with nowhere for its ${sname(dead.s)}. So no ${sname(s)} here.`,
      };
    }
  return null;
}

// ---------------------------------------------------------------- driver

/** The cheapest available step up to `maxTier`, or null when stuck. */
export function nextStep(g: Grid, maxTier = 5): Step | null {
  return (
    lastSpot(g) ??
    (maxTier >= 2 ? (confined(g) ?? squeeze(g)) : null) ??
    (maxTier >= 3 ? lockedSet(g, 2) : null) ??
    (maxTier >= 4 ? (lockedSet(g, 3) ?? lockedSet(g, 4)) : null) ??
    (maxTier >= 5 ? forcing(g) : null)
  );
}

export function applyStep(g: Grid, step: Step): void {
  const n = g.t.n;
  if (step.place) g.place(step.place.r * n + step.place.c, step.species);
  for (const e of step.eliminate) g.eliminate(step.species, e.r * n + e.c);
}

export interface SolveReport {
  solved: boolean;
  steps: Step[];
  /** Highest tier used (0 when nothing was needed). */
  maxTier: number;
  hardSteps: number; // tier ≥ 3
  tier4Steps: number;
  forcingSteps: number;
  stepCount: number;
  /** Average number of immediately placeable pets available per step — lower is harder. */
  avgOptions: number;
  grid: Grid;
}

export function solve(t: Topology, givens: Given[], opts: { maxTier?: number; keepSteps?: boolean; start?: Grid } = {}): SolveReport {
  const maxTierAllowed = opts.maxTier ?? 5;
  const g = opts.start ? opts.start.clone() : Grid.from(t, givens);
  const steps: Step[] = [];
  let maxTier = 0;
  let hard = 0;
  let tier4 = 0;
  let forcingSteps = 0;
  let optionsSum = 0;
  let count = 0;
  const limit = t.nn * 6;
  while (!g.solved && !g.broken && count < limit) {
    optionsSum += countOptions(g);
    const step = nextStep(g, maxTierAllowed);
    if (!step) break;
    applyStep(g, step);
    const tier = TECHNIQUE_TIER[step.technique];
    maxTier = Math.max(maxTier, tier);
    if (tier >= 3) hard++;
    if (tier === 4) tier4++;
    if (tier === 5) forcingSteps++;
    if (opts.keepSteps !== false) steps.push(step);
    count++;
  }
  return { solved: g.solved, steps, maxTier, hardSteps: hard, tier4Steps: tier4, forcingSteps, stepCount: count, avgOptions: count ? optionsSum / count : 0, grid: g };
}

/** Number of distinct pets that could be placed right now by last-spot. */
function countOptions(g: Grid): number {
  const t = g.t;
  const seen = new Set<number>();
  for (let u = 0; u < 3 * t.n; u++)
    for (const s of SPECIES) {
      if (g.hasIn(s, u)) continue;
      const sp = g.spots(u, s);
      if (sp.length === 1) seen.add(sp[0] * 2 + s);
    }
  return seen.size;
}

/** Cells where, given the placed animals alone, no pet can go. */
export function deadCells(t: Topology, kinds: Kind[][]): boolean[][] {
  const g = Grid.from(t, [], kinds);
  const out: boolean[][] = [];
  for (let r = 0; r < t.n; r++) {
    out.push([]);
    for (let c = 0; c < t.n; c++) {
      const i = r * t.n + c;
      out[r].push(g.cells[i] === EMPTY && !g.can(CAT, i) && !g.can(DOG, i));
    }
  }
  return out;
}

/** Compact, stable trace code for one step: e.g. "S.c.p12", "K2.d.e3-4-11". */
export function stepCode(t: Topology, s: Step): string {
  const sp = s.species === CAT ? 'c' : 'd';
  if (s.place) return `${TECHNIQUE_CODE[s.technique]}.${sp}.p${s.place.r * t.n + s.place.c}`;
  return `${TECHNIQUE_CODE[s.technique]}.${sp}.e${s.eliminate.map((e) => e.r * t.n + e.c).join('-')}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinNames(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
