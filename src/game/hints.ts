/**
 * Two-stage help: Explain (free) then Reveal (an explicit second tap). No surprise placements.
 *
 * planHint() looks only at the player's own board:
 *  1. A pet that can't be part of the answer (possible in Zen) — say so; Reveal shows and removes it.
 *  2. Otherwise follow the deduction engine from the player's correct pets until it can place a pet.
 *     Explain shows the reasoning (the last relevant steps plus the placement) and tints the units it
 *     talks about. Reveal places that pet (clearing a ✕ the player put there, if any).
 */
import { EMPTY, type Cell, type Species } from '../engine/types';
import { Grid, applyStep, nextStep, type Step, type UnitRef } from '../engine/deduce';
import { MARK, type Session } from './session';

export type HintPlan =
  | { kind: 'wrong-pet'; lines: string[]; cell: Cell; units: UnitRef[]; focus: Cell[] }
  | { kind: 'place'; lines: string[]; units: UnitRef[]; focus: Cell[]; target: Cell & { species: Species }; clearMark: boolean }
  | { kind: 'none'; lines: string[]; units: UnitRef[]; focus: Cell[] };

/** Techniques whose wording points at a specific cell ("this cell", "here"). */
const POINTS_AT_CELL = new Set(['squeeze', 'forcing']);

export function planHint(s: Session): HintPlan {
  const p = s.puzzle;
  const n = p.size;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const v = s.cells[r][c];
      if ((v === 1 || v === 2) && !s.givenMask[r][c] && p.solution[r][c] !== v)
        return {
          kind: 'wrong-pet',
          lines: ['One of your pets can’t be part of the answer. Undo recent moves, or reveal which one.'],
          cell: { r, c },
          units: [],
          focus: [],
        };
    }

  const g = Grid.from(s.topology, p.givens, s.kinds());
  const chain: Step[] = [];
  for (let guard = 0; guard < 500; guard++) {
    const step = nextStep(g);
    if (!step) break;
    if (step.place) {
      const { r, c } = step.place;
      const unit = step.units[0];
      const inUnit = (cell: Cell) => (unit.kind === 'row' ? cell.r === unit.index : unit.kind === 'col' ? cell.c === unit.index : p.regions[cell.r][cell.c] === unit.index);
      // Keep the elimination steps that cleared cells in the unit we're about to fill (most recent two).
      const relevant = chain.filter((st) => st.species === step.species && st.eliminate.some(inUnit)).slice(-2);
      const shown = relevant.length ? relevant : chain.slice(-1);
      const units = dedupeUnits([...shown.flatMap((st) => st.units), ...step.units]);
      const focus = shown.filter((st) => POINTS_AT_CELL.has(st.technique)).flatMap((st) => st.focus);
      const lines = [...shown.map((st) => st.text), step.text];
      const clearMark = s.cells[r][c] === MARK;
      if (clearMark) lines.push('One of your ✕ marks is on that spot; revealing will replace it.');
      return { kind: 'place', lines, units, focus, target: { r, c, species: step.species }, clearMark };
    }
    chain.push(step);
    applyStep(g, step);
  }
  return { kind: 'none', lines: ['No hint needed — every pet is already in place.'], units: [], focus: [] };
}

/** Applies a plan's reveal. Returns the cell that changed. */
export function revealHint(s: Session, plan: HintPlan): Cell | null {
  if (s.outcome !== 'playing') return null;
  if (plan.kind === 'wrong-pet') {
    const res = s.setCell(plan.cell.r, plan.cell.c, EMPTY);
    if (res.accepted) s.hintsRevealed++;
    return res.accepted ? plan.cell : null;
  }
  if (plan.kind === 'place') {
    const { r, c, species } = plan.target;
    if (plan.clearMark && s.cells[r][c] === MARK) s.setCell(r, c, EMPTY);
    const res = s.setCell(r, c, species);
    if (res.accepted) s.hintsRevealed++;
    return res.accepted ? { r, c } : null;
  }
  return null;
}

function dedupeUnits(us: UnitRef[]): UnitRef[] {
  const seen = new Set<string>();
  return us.filter((u) => {
    const k = `${u.kind}:${u.index}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

