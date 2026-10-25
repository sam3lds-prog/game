import { describe, expect, it } from 'vitest';
import { generatePuzzle } from '../src/engine/generator';
import { countSolutions, isValidSolution } from '../src/engine/solver';
import { deduce } from '../src/engine/deduce';
import { dailySpec, levelSpec } from '../src/engine/levels';
import { CAT, DOG } from '../src/engine/types';

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
