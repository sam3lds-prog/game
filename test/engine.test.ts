import { describe, expect, it } from 'vitest';
import { DIFFICULTY_TIERS, generateExact, generatePuzzle, gradeFromReport } from '../src/engine/generator';
import { countSolutions, isValidSolution } from '../src/engine/solver';
import { Grid, TECHNIQUE_TIER, Topology, applyStep, nextStep, solve, type Technique } from '../src/engine/deduce';
import { CAT, DOG, EMPTY, type Difficulty } from '../src/engine/types';
import { addDaysKey, localDateKey } from '../src/engine/levels';

describe('generator', () => {
  for (const size of [5, 6, 7, 8, 9]) {
    it(`makes valid, unique, logic-only ${size}×${size} puzzles labeled with their real difficulty`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        const p = generatePuzzle({ size, seed });
        expect(isValidSolution(size, p.regions, p.solution)).toBe(true);
        expect(countSolutions(size, p.regions, p.givens, 2).count).toBe(1);
        const t = new Topology(size, p.regions);
        const rep = solve(t, p.givens);
        expect(rep.solved).toBe(true);
        expect(gradeFromReport(size, rep, p.givens.length).difficulty).toBe(p.difficulty);
        expect(p.givens.length).toBeGreaterThanOrEqual(1);
        for (const k of [CAT, DOG]) {
          const per = new Array(size).fill(0);
          for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (p.solution[r][c] === k) per[p.regions[r][c]]++;
          expect(per.every((x) => x === 1)).toBe(true);
        }
      }
    });
  }

  it('is deterministic for a given seed', () => {
    const a = generateExact({ size: 7, seed: 42, difficulty: 'medium' });
    const b = generateExact({ size: 7, seed: 42, difficulty: 'medium' });
    expect(a).not.toBeNull();
    expect(a!.regions).toEqual(b!.regions);
    expect(a!.givens).toEqual(b!.givens);
    expect(a!.trace).toEqual(b!.trace);
  });

  it('generateExact never returns a near miss', () => {
    for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as Difficulty[])
      for (let seed = 1; seed <= 3; seed++) {
        const p = generateExact({ size: 7, seed, difficulty, attempts: 25 });
        if (p) {
          expect(p.difficulty).toBe(difficulty);
          expect(p.grade.maxTier).toBeGreaterThanOrEqual(DIFFICULTY_TIERS[difficulty].minTier);
          expect(p.grade.maxTier).toBeLessThanOrEqual(DIFFICULTY_TIERS[difficulty].maxTier);
        }
      }
  });

  it('removes every unnecessary given (each remaining one is needed at its tier)', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const p = generateExact({ size: 7, seed, difficulty: 'medium' });
      if (!p || p.givens.length < 2) continue;
      const t = new Topology(7, p.regions);
      for (const g of p.givens) {
        const without = p.givens.filter((x) => x !== g);
        expect(solve(t, without, { maxTier: 2, keepSteps: false }).solved).toBe(false);
      }
    }
  });
});

describe('deduction engine soundness', () => {
  it('every step on 60 puzzles agrees with the unique solution (no technique ever eliminates the answer)', () => {
    const used = new Set<Technique>();
    for (let i = 0; i < 60; i++) {
      const size = 5 + (i % 5);
      const p = generatePuzzle({ size, seed: 9000 + i, difficulty: (['easy', 'medium', 'hard', 'expert'] as Difficulty[])[i % 4] });
      const t = new Topology(size, p.regions);
      const g = Grid.from(t, p.givens);
      for (let guard = 0; guard < 400 && !g.solved; guard++) {
        const step = nextStep(g, 5);
        expect(step, `stuck on ${size}x${size} seed ${p.seed}`).not.toBeNull();
        used.add(step!.technique);
        if (step!.place) expect(p.solution[step!.place.r][step!.place.c]).toBe(step!.species);
        for (const e of step!.eliminate) expect(p.solution[e.r][e.c], `${step!.technique} eliminated the answer`).not.toBe(step!.species);
        expect(step!.text.length).toBeGreaterThan(10);
        expect(step!.units.length).toBeGreaterThan(0);
        applyStep(g, step!);
      }
      expect(g.solved).toBe(true);
    }
    for (const t of ['last-spot', 'confined', 'squeeze', 'locked-2', 'forcing'] as Technique[]) expect(used, t).toContain(t);
  });

  it('tiers are ordered from cheapest to hardest', () => {
    expect(TECHNIQUE_TIER['last-spot']).toBeLessThan(TECHNIQUE_TIER.confined);
    expect(TECHNIQUE_TIER.squeeze).toBeLessThan(TECHNIQUE_TIER['locked-2']);
    expect(TECHNIQUE_TIER['locked-3']).toBeLessThan(TECHNIQUE_TIER.forcing);
  });

  it('dead cells come from visible rules only', () => {
    const p = generatePuzzle({ size: 6, seed: 4 });
    const t = new Topology(6, p.regions);
    const kinds = p.solution.map((row) => row.map(() => EMPTY as 0 | 1 | 2));
    const g = p.givens[0];
    kinds[g.r][g.c] = g.kind;
    const g2 = Grid.from(t, [], kinds);
    // the given's row is dead for its species, neighbors are dead for the other
    for (let c = 0; c < 6; c++) if (c !== g.c) expect(g2.can(g.kind, g.r * 6 + c)).toBe(false);
  });
});

describe('dates', () => {
  it('formats and steps local calendar dates', () => {
    expect(localDateKey(new Date(2026, 9, 24))).toBe('2026-10-24');
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysKey('2027-03-01', -1)).toBe('2027-02-28');
  });
});
