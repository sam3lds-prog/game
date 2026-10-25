/**
 * Typed gameplay events emitted by the game screen, and their mapping to face reactions.
 * One player action → at most one reaction per affected animal.
 */
import type { Cell, Species } from '../engine/types';
import type { Violation } from './session';
import type { FaceEvent } from './faceExpressions';

export type GameEvent =
  | { type: 'placed'; r: number; c: number; species: Species }
  | { type: 'rejected'; r: number; c: number; violation: Violation; conflicts: Cell[] }
  | { type: 'hint'; focus: Cell[] }
  | { type: 'pet'; r: number; c: number };

export interface FaceCue {
  r: number;
  c: number;
  event: FaceEvent;
}

const MAX_HINT_FACES = 2;

export function faceCuesFor(e: GameEvent): FaceCue[] {
  switch (e.type) {
    case 'placed':
      return [{ r: e.r, c: e.c, event: 'placed_correct' }];
    case 'rejected':
      if (e.violation === 'adjacent_conflict') return dedupe(e.conflicts).map((p) => ({ ...p, event: 'invalid_adjacent' as const }));
      if (e.violation === 'duplicate_species_in_row' || e.violation === 'duplicate_species_in_column' || e.violation === 'duplicate_species_in_region')
        return dedupe(e.conflicts).map((p) => ({ ...p, event: 'invalid_other' as const }));
      // solution_mismatch / given_cell: no visible animal is involved → static text only, no invented pet.
      return [];
    case 'hint':
      return dedupe(e.focus)
        .slice(0, MAX_HINT_FACES)
        .map((p) => ({ ...p, event: 'hint' as const }));
    case 'pet':
      return [{ r: e.r, c: e.c, event: 'pet' }];
  }
}

function dedupe(cells: Cell[]): Cell[] {
  const seen = new Set<string>();
  return cells.filter((p) => {
    const k = `${p.r},${p.c}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
