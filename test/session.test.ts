import { describe, expect, it } from 'vitest';
import { generatePuzzle } from '../src/engine/generator';
import { CAT, DOG, EMPTY, type Puzzle, type Species } from '../src/engine/types';
import { MARK, Session } from '../src/game/session';

function puzzle(size = 6, seed = 3): Puzzle {
  return { ...generatePuzzle({ size, seed }), id: `test-${size}-${seed}` };
}

function solveAll(s: Session) {
  const p = s.puzzle;
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (p.solution[r][c] !== EMPTY && !s.givenMask[r][c]) s.setCell(r, c, p.solution[r][c] as Species);
}

describe('Session rules and reason codes', () => {
  it('reports a duplicate in the row with the conflicting animal', () => {
    const p = puzzle();
    const s = new Session(p, 'zen');
    const r = 0;
    const catCol = p.solution[r].indexOf(CAT);
    if (!s.givenMask[r][catCol]) s.setCell(r, catCol, CAT);
    const other = [...Array(p.size).keys()].find((c) => c !== catCol && Math.abs(c - catCol) > 1 && !s.givenMask[r][c] && s.cells[r][c] === EMPTY)!;
    const res = s.setCell(r, other, CAT);
    expect(res.accepted).toBe(false);
    expect(res.violation).toBe('duplicate_species_in_row');
    expect(res.conflicts).toContainEqual({ r, c: catCol });
  });

  it('reports adjacency between a cat and a dog', () => {
    const p = puzzle();
    const s = new Session(p, 'zen');
    // Place a correct cat, then try a dog directly beside it in a column that has no dog yet.
    let done = false;
    for (let r = 0; r < p.size && !done; r++) {
      const c = p.solution[r].indexOf(CAT);
      if (s.givenMask[r][c]) continue;
      s.setCell(r, c, CAT);
      for (const [rr, cc] of [
        [r + 1, c],
        [r - 1, c],
      ]) {
        if (rr < 0 || rr >= p.size || s.givenMask[rr][cc]) continue;
        const res = s.setCell(rr, cc, DOG);
        if (res.violation === 'adjacent_conflict') {
          expect(res.conflicts).toContainEqual({ r, c });
          done = true;
          break;
        }
      }
    }
    expect(done).toBe(true);
  });

  it('challenge mode checks the solution immediately and costs a heart', () => {
    const p = puzzle();
    const s = new Session(p, 'challenge');
    // a cell where a cat is visibly legal (empty board) but not in the solution
    let res;
    for (let r = 0; r < p.size && !res; r++)
      for (let c = 0; c < p.size && !res; c++) {
        if (s.givenMask[r][c] || p.solution[r][c] === CAT) continue;
        if (s.visibleViolation(r, c, CAT).violation) continue;
        res = s.setCell(r, c, CAT);
      }
    expect(res!.violation).toBe('solution_mismatch');
    expect(res!.heartLost).toBe(true);
    expect(s.hearts).toBe(2);
  });

  it('zen mode never charges hearts and accepts any visibly legal placement', () => {
    const p = puzzle();
    const s = new Session(p, 'zen');
    let accepted = false;
    for (let r = 0; r < p.size && !accepted; r++)
      for (let c = 0; c < p.size && !accepted; c++) {
        if (s.givenMask[r][c] || p.solution[r][c] === CAT || s.visibleViolation(r, c, CAT).violation) continue;
        accepted = s.setCell(r, c, CAT).accepted;
      }
    expect(accepted).toBe(true);
    expect(s.hearts).toBe(3);
  });

  it('given cells cannot change', () => {
    const p = puzzle();
    const s = new Session(p);
    const g = p.givens[0];
    const res = s.setCell(g.r, g.c, EMPTY);
    expect(res.violation).toBe('given_cell');
    expect(s.cells[g.r][g.c]).toBe(g.kind);
  });

  it('wins once the board satisfies every rule, and then ignores moves', () => {
    const s = new Session(puzzle(), 'challenge');
    solveAll(s);
    expect(s.outcome).toBe('won');
    expect(s.setCell(0, 0, MARK).accepted).toBe(false);
    expect(s.undo()).toBeNull();
  });

  it('three wrong placements in challenge mode lose the game; revive refills', () => {
    const p = puzzle();
    const s = new Session(p, 'challenge');
    let r0 = -1;
    let c0 = -1;
    for (let r = 0; r < p.size && r0 < 0; r++)
      for (let c = 0; c < p.size; c++)
        if (!s.givenMask[r][c] && p.solution[r][c] !== CAT) {
          r0 = r;
          c0 = c;
          break;
        }
    for (let i = 0; i < 3; i++) s.setCell(r0, c0, CAT);
    expect(s.outcome).toBe('lost');
    s.revive();
    expect(s.outcome).toBe('playing');
    expect(s.hearts).toBe(3);
  });
});

describe('Session persistence', () => {
  it('round-trips board, history, hearts, hints, tool and time', () => {
    const p = puzzle(7, 9);
    const s = new Session(p, 'challenge');
    const free: Array<[number, number]> = [];
    for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (!s.givenMask[r][c]) free.push([r, c]);
    s.setCell(free[0][0], free[0][1], MARK);
    s.setCell(free[1][0], free[1][1], MARK);
    s.tool = 'dog';
    s.hintsExplained = 2;
    const snap = s.toSnapshot(83_500);
    const json = JSON.parse(JSON.stringify(snap));
    const back = Session.fromSnapshot(json);
    expect(back.cells).toEqual(s.cells);
    expect(back.tool).toBe('dog');
    expect(back.hintsExplained).toBe(2);
    expect(back.restoredActiveMs).toBe(83_500);
    expect(back.canUndo()).toBe(true);
    back.undo();
    expect(back.cells[free[1][0]][free[1][1]]).toBe(EMPTY);
  });

  it('never lets a snapshot overwrite a given cell', () => {
    const p = puzzle();
    const s = new Session(p);
    const snap = s.toSnapshot(0);
    snap.cells = '.'.repeat(p.size * p.size);
    const back = Session.fromSnapshot(snap);
    for (const g of p.givens) expect(back.cells[g.r][g.c]).toBe(g.kind);
  });
});
