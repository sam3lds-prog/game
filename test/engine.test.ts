import { describe, expect, it } from 'vitest';
import { generatePuzzle } from '../src/engine/generator';
import { countSolutions, isValidSolution } from '../src/engine/solver';
import { deduce } from '../src/engine/deduce';
import { dailySpec, levelSpec } from '../src/engine/levels';
import { Session } from '../src/game/session';
import { CAT, DOG, EMPTY } from '../src/engine/types';

describe('generator', () => {
  for (const size of [5, 6, 7, 8, 9]) {
    it(`makes valid, unique, logic-only ${size}×${size} puzzles`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const p = generatePuzzle({ size, seed });
        expect(isValidSolution(size, p.regions, p.solution)).toBe(true);
        expect(countSolutions(size, p.regions, p.givens, 2).count).toBe(1);
        expect(deduce(size, p.regions, p.givens).solved).toBe(true);
        expect(p.givens.length).toBeGreaterThanOrEqual(1);
        // every region has exactly one cat and one dog
        for (const k of [CAT, DOG]) {
          const per = new Array(size).fill(0);
          for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (p.solution[r][c] === k) per[p.regions[r][c]]++;
          expect(per.every((x) => x === 1)).toBe(true);
        }
      }
    });
  }

  it('is deterministic for a given seed', () => {
    const a = generatePuzzle({ size: 7, seed: 42 });
    const b = generatePuzzle({ size: 7, seed: 42 });
    expect(a.regions).toEqual(b.regions);
    expect(a.givens).toEqual(b.givens);
  });

  it('hits the requested difficulty most of the time', () => {
    let hits = 0;
    for (let seed = 100; seed < 110; seed++) hits += generatePuzzle({ size: 7, seed, difficulty: 'hard' }).difficulty === 'hard' ? 1 : 0;
    expect(hits).toBeGreaterThanOrEqual(7);
  });
});

describe('levels', () => {
  it('ladders up in size', () => {
    expect(levelSpec(1).size).toBe(5);
    expect(levelSpec(30).size).toBe(7);
    expect(levelSpec(80).size).toBe(9);
  });
  it('daily spec is stable for a date', () => {
    const d = new Date(2026, 9, 24);
    expect(dailySpec(d).seed).toBe(dailySpec(new Date(2026, 9, 24)).seed);
    expect(dailySpec(d).dateKey).toBe('2026-10-24');
  });
});

describe('session', () => {
  it('counts mistakes, loses hearts, and wins when the board is complete', () => {
    const p = generatePuzzle({ size: 5, seed: 3 });
    const s = new Session(p);
    // find a wrong cell for a cat
    let wrong: [number, number] | null = null;
    for (let r = 0; r < 5 && !wrong; r++) for (let c = 0; c < 5 && !wrong; c++) if (p.solution[r][c] !== CAT && !s.givenMask[r][c]) wrong = [r, c];
    const res = s.place(wrong![0], wrong![1], CAT);
    expect(res.wrong).toBe(true);
    expect(s.hearts).toBe(2);
    // place everything correctly
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (p.solution[r][c] !== EMPTY && !s.givenMask[r][c]) s.place(r, c, p.solution[r][c] as 1 | 2);
    expect(s.outcome).toBe('won');
  });

  it('hints walk a puzzle to completion without ever guessing', () => {
    const p = generatePuzzle({ size: 8, seed: 11, difficulty: 'hard' });
    const s = new Session(p);
    let guard = 0;
    while (s.outcome === 'playing' && guard++ < 50) expect(s.hint()).not.toBeNull();
    expect(s.outcome).toBe('won');
    expect(s.mistakes).toBe(0);
  });

  it('undo restores the previous cell state', () => {
    const p = generatePuzzle({ size: 5, seed: 5 });
    const s = new Session(p);
    let cell: [number, number] | null = null;
    for (let r = 0; r < 5 && !cell; r++) for (let c = 0; c < 5 && !cell; c++) if (!s.givenMask[r][c]) cell = [r, c];
    s.tap(cell![0], cell![1], CAT);
    expect(s.cells[cell![0]][cell![1]]).toBe(3);
    expect(s.undo()).toBe(true);
    expect(s.cells[cell![0]][cell![1]]).toBe(EMPTY);
  });
});
