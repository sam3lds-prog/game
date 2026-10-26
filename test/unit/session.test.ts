import { describe, expect, it } from 'vitest';
import { generatePuzzle } from '../../src/engine/generator';
import { CAT, DOG, EMPTY, type Puzzle, type Species } from '../../src/engine/types';
import { MARK, Session } from '../../src/game/session';

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function firstFree(s: Session, pred: (r: number, c: number) => boolean): [number, number] {
  for (let r = 0; r < s.size; r++) for (let c = 0; c < s.size; c++) if (!s.givenMask[r][c] && pred(r, c)) return [r, c];
  throw new Error('no cell');
}

function solveAll(s: Session, p: Puzzle) {
  for (let r = 0; r < p.size; r++) for (let c = 0; c < p.size; c++) if (p.solution[r][c] !== EMPTY && !s.givenMask[r][c]) s.place(r, c, p.solution[r][c] as Species);
}

describe('outcome claiming', () => {
  it('reports a win exactly once', () => {
    const p = generatePuzzle({ size: 5, seed: 3 });
    const s = new Session(p);
    expect(s.claimOutcome()).toBeNull();
    solveAll(s, p);
    expect(s.claimOutcome()).toBe('won');
    expect(s.claimOutcome()).toBeNull();
    expect(s.claimOutcome()).toBeNull();
  });

  it('reports a loss once, and again after a revive and a second loss', () => {
    const p = generatePuzzle({ size: 5, seed: 4 });
    const s = new Session(p);
    const [r, c] = firstFree(s, (r, c) => p.solution[r][c] !== CAT);
    for (let i = 0; i < 3; i++) s.place(r, c, CAT);
    expect(s.outcome).toBe('lost');
    expect(s.claimOutcome()).toBe('lost');
    expect(s.claimOutcome()).toBeNull();
    s.revive();
    for (let i = 0; i < 3; i++) s.place(r, c, CAT);
    expect(s.claimOutcome()).toBe('lost');
  });

  it('ignores input after the game is over', () => {
    const p = generatePuzzle({ size: 5, seed: 3 });
    const s = new Session(p);
    solveAll(s, p);
    const [r, c] = firstFree(s, (r, c) => p.solution[r][c] === EMPTY);
    expect(s.apply(r, c, 'mark').ignored).toBe(true);
    expect(s.undo()).toBe(false);
  });
});

describe('tool input', () => {
  const p = generatePuzzle({ size: 6, seed: 9 });

  it('places the selected species, and tapping it again clears it', () => {
    const s = new Session(p);
    const [r, c] = firstFree(s, (r, c) => p.solution[r][c] === CAT);
    expect(s.apply(r, c, 'cat').placed).toBe(CAT);
    expect(s.cells[r][c]).toBe(CAT);
    expect(s.apply(r, c, 'dog').ignored).toBe(true);
    expect(s.apply(r, c, 'cat').cleared).toBe(true);
    expect(s.cells[r][c]).toBe(EMPTY);
  });

  it('mark toggles ✕, and erase clears anything that is not a given', () => {
    const s = new Session(p);
    const [r, c] = firstFree(s, () => true);
    expect(s.apply(r, c, 'mark').marked).toBe(true);
    expect(s.cells[r][c]).toBe(MARK);
    expect(s.apply(r, c, 'mark').unmarked).toBe(true);
    s.apply(r, c, 'mark');
    expect(s.apply(r, c, 'erase').unmarked).toBe(true);
    const g = p.givens[0];
    expect(s.apply(g.r, g.c, 'erase').ignored).toBe(true);
    expect(s.cells[g.r][g.c]).toBe(g.kind);
  });

  it('a wrong placement costs a heart and leaves the cell unchanged', () => {
    const s = new Session(p);
    const [r, c] = firstFree(s, (r, c) => p.solution[r][c] !== DOG);
    const res = s.apply(r, c, 'dog');
    expect(res.wrong).toBe(true);
    expect(s.hearts).toBe(2);
    expect(s.cells[r][c]).toBe(EMPTY);
  });

  it('reports rows / columns / regions completed by a placement', () => {
    const s = new Session(p);
    const completedAll: string[] = [];
    for (let r = 0; r < p.size; r++)
      for (let c = 0; c < p.size; c++)
        if (p.solution[r][c] !== EMPTY && !s.givenMask[r][c]) {
          const res = s.place(r, c, p.solution[r][c] as Species);
          for (const u of res.completed ?? []) completedAll.push(`${u.kind}${u.index}`);
        }
    // Every row / column is completed exactly once, except ones whose two pets were both givens.
    const givenCount = (pred: (r: number, c: number) => boolean) => p.givens.filter((g) => pred(g.r, g.c)).length;
    for (let i = 0; i < p.size; i++) {
      expect(completedAll.filter((x) => x === `row${i}`)).toHaveLength(givenCount((r) => r === i) === 2 ? 0 : 1);
      expect(completedAll.filter((x) => x === `column${i}`)).toHaveLength(givenCount((_, c) => c === i) === 2 ? 0 : 1);
      expect(completedAll.filter((x) => x === `region${i}`)).toHaveLength(givenCount((r, c) => p.regions[r][c] === i) === 2 ? 0 : 1);
    }
  });
});

describe('undo / redo', () => {
  it('redo re-applies what undo removed, and a new move clears the redo stack', () => {
    const p = generatePuzzle({ size: 5, seed: 5 });
    const s = new Session(p);
    const [r, c] = firstFree(s, () => true);
    s.apply(r, c, 'mark');
    expect(s.undo()).toBe(true);
    expect(s.cells[r][c]).toBe(EMPTY);
    expect(s.canRedo()).toBe(true);
    expect(s.redo()).toBe(true);
    expect(s.cells[r][c]).toBe(MARK);
    s.undo();
    const [r2, c2] = firstFree(s, (rr, cc) => rr !== r || cc !== c);
    s.apply(r2, c2, 'mark');
    expect(s.canRedo()).toBe(false);
  });

  it('cannot undo a mistake back into a heart', () => {
    const p = generatePuzzle({ size: 5, seed: 6 });
    const s = new Session(p);
    const [r, c] = firstFree(s, (r, c) => p.solution[r][c] !== CAT);
    s.place(r, c, CAT);
    expect(s.undo()).toBe(false);
    expect(s.hearts).toBe(2);
  });
});

describe('zen rules', () => {
  it('counts mistakes but never loses', () => {
    const p = generatePuzzle({ size: 5, seed: 7 });
    const s = new Session(p, { hearts: false });
    const [r, c] = firstFree(s, (r, c) => p.solution[r][c] !== CAT);
    for (let i = 0; i < 10; i++) s.place(r, c, CAT);
    expect(s.mistakes).toBe(10);
    expect(s.hearts).toBe(3);
    expect(s.outcome).toBe('playing');
  });
});

describe('clock', () => {
  it('excludes paused time', () => {
    const clock = fakeClock();
    const s = new Session(generatePuzzle({ size: 5, seed: 1 }), { now: clock.now });
    clock.advance(10_000);
    s.pause();
    clock.advance(60_000);
    s.resume();
    clock.advance(5_000);
    expect(s.elapsedSeconds()).toBe(15);
  });
});

describe('hints', () => {
  it('peekHint does not change the board; noteHint counts once per target', () => {
    const p = generatePuzzle({ size: 7, seed: 12 });
    const s = new Session(p);
    const before = JSON.stringify(s.cells);
    const h = s.peekHint()!;
    expect(h).not.toBeNull();
    expect(JSON.stringify(s.cells)).toBe(before);
    expect(p.solution[h.r][h.c]).toBe(h.species);
    s.noteHint(h);
    s.noteHint(h);
    expect(s.hintsUsed).toBe(1);
    expect(h.unit).not.toBeNull();
  });

  it('the forcing unit really contains the hinted cell', () => {
    const p = generatePuzzle({ size: 8, seed: 21 });
    const s = new Session(p);
    for (let i = 0; i < 6; i++) {
      const h = s.peekHint()!;
      expect(s.unitCells(h.unit!).some(([r, c]) => r === h.r && c === h.c)).toBe(true);
      s.hint();
    }
  });
});

describe('snapshots', () => {
  const p = generatePuzzle({ size: 6, seed: 31 });

  it('round-trips marks, placements, hearts, hints, history and time', () => {
    const clock = fakeClock();
    const s = new Session(p, { now: clock.now });
    const [mr, mc] = firstFree(s, (r, c) => p.solution[r][c] === EMPTY);
    s.apply(mr, mc, 'mark');
    const [cr, cc] = firstFree(s, (r, c) => p.solution[r][c] === CAT);
    s.apply(cr, cc, 'cat');
    const [wr, wc] = firstFree(s, (r, c) => p.solution[r][c] !== DOG && s.cells[r][c] === EMPTY);
    s.apply(wr, wc, 'dog');
    s.hint();
    clock.advance(42_000);
    const snap = JSON.parse(JSON.stringify(s.snapshot()));
    const t = Session.restore(p, snap, { now: clock.now })!;
    expect(t).not.toBeNull();
    expect(t.cells).toEqual(s.cells);
    expect(t.hearts).toBe(2);
    expect(t.mistakes).toBe(1);
    expect(t.hintsUsed).toBe(1);
    expect(t.paused).toBe(true);
    expect(t.elapsedSeconds()).toBe(42);
    expect(t.undo()).toBe(true);
    expect(t.undo()).toBe(true);
  });

  it('rejects a snapshot with a pet that is not part of the solution', () => {
    const s = new Session(p);
    const snap = s.snapshot();
    const [r, c] = firstFree(s, (r, c) => p.solution[r][c] === EMPTY);
    snap.cells[r][c] = CAT;
    expect(Session.restore(p, snap)).toBeNull();
  });

  it('rejects a snapshot that changes a given, or has the wrong size', () => {
    const s = new Session(p);
    const snap = s.snapshot();
    const g = p.givens[0];
    snap.cells[g.r][g.c] = EMPTY;
    expect(Session.restore(p, snap)).toBeNull();
    const snap2 = s.snapshot();
    snap2.cells.pop();
    expect(Session.restore(p, snap2)).toBeNull();
  });
});
