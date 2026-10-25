import { describe, expect, it } from 'vitest';
import { campaignPuzzle } from '../src/game/catalog';
import { CAT, DOG, EMPTY, type Species } from '../src/engine/types';
import { MARK, Session } from '../src/game/session';
import { planHint, revealHint } from '../src/game/hints';
import { tapTarget } from '../src/screens/game';

describe('hints: explain, then reveal', () => {
  it('explaining changes nothing on the board', () => {
    const s = new Session(campaignPuzzle(30)!, 'zen');
    const before = JSON.stringify(s.cells);
    const plan = planHint(s);
    expect(plan.kind).toBe('place');
    expect(plan.lines.length).toBeGreaterThan(0);
    expect(plan.units.length).toBeGreaterThan(0);
    expect(JSON.stringify(s.cells)).toBe(before);
    expect(s.hintsRevealed).toBe(0);
  });

  it('repeated explain + reveal solves every board size without a single wrong placement', () => {
    for (const level of [1, 20, 40, 60, 100, 150, 200]) {
      for (const mode of ['zen', 'challenge'] as const) {
        const s = new Session(campaignPuzzle(level)!, mode);
        for (let i = 0; i < 200 && s.outcome === 'playing'; i++) {
          const plan = planHint(s);
          expect(plan.kind, `level ${level}`).toBe('place');
          if (plan.kind !== 'place') break;
          expect(s.puzzle.solution[plan.target.r][plan.target.c]).toBe(plan.target.species);
          expect(revealHint(s, plan)).not.toBeNull();
        }
        expect(s.outcome, `level ${level} ${mode}`).toBe('won');
        expect(s.mistakes).toBe(0);
      }
    }
  });

  it('in Zen, a pet that cannot be part of the answer is found first, and reveal takes it back', () => {
    const p = campaignPuzzle(25)!;
    const s = new Session(p, 'zen');
    let wrong: [number, number] | null = null;
    for (let r = 0; r < p.size && !wrong; r++)
      for (let c = 0; c < p.size && !wrong; c++)
        if (!s.givenMask[r][c] && p.solution[r][c] !== CAT && !s.visibleViolation(r, c, CAT).violation) wrong = [r, c];
    expect(s.setCell(wrong![0], wrong![1], CAT).accepted).toBe(true);
    const plan = planHint(s);
    expect(plan.kind).toBe('wrong-pet');
    expect(plan.lines[0]).not.toMatch(/row|column/i); // explain doesn't give the position away
    revealHint(s, plan);
    expect(s.cells[wrong![0]][wrong![1]]).toBe(EMPTY);
  });

  it('a ✕ on the hinted cell is mentioned and cleared on reveal', () => {
    const s = new Session(campaignPuzzle(3)!, 'zen');
    const first = planHint(s);
    if (first.kind !== 'place') throw new Error('expected a placement');
    s.setCell(first.target.r, first.target.c, MARK);
    const plan = planHint(s);
    expect(plan.kind).toBe('place');
    if (plan.kind !== 'place') return;
    expect(plan.clearMark).toBe(true);
    revealHint(s, plan);
    expect(s.cells[plan.target.r][plan.target.c]).toBe(plan.target.species);
  });
});

describe('tap behavior', () => {
  it('direct mode places the selected tool and taps again to clear', () => {
    expect(tapTarget(EMPTY, 'cat', 'direct')).toBe(CAT);
    expect(tapTarget(CAT, 'cat', 'direct')).toBe(EMPTY);
    expect(tapTarget(DOG, 'cat', 'direct')).toBe(CAT);
    expect(tapTarget(EMPTY, 'mark', 'direct')).toBe(MARK);
    expect(tapTarget(MARK, 'dog', 'direct')).toBe(DOG);
  });
  it('cycle mode goes empty → ✕ → pet → empty', () => {
    const order: Array<0 | 1 | 2 | 3> = [EMPTY];
    for (let i = 0; i < 3; i++) order.push(tapTarget(order[order.length - 1], 'dog', 'cycle') as 0 | 1 | 2 | 3);
    expect(order).toEqual([EMPTY, MARK, DOG, EMPTY]);
    void (0 as unknown as Species);
  });
});
