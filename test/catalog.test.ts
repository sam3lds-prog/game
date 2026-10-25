/** The published catalog must be 100% valid. */
import { describe, expect, it } from 'vitest';
import raw from '../src/content/catalog.v1.json';
import { canonicalKey, decodeEntry, layoutSimilarity, NEAR_DUPLICATE_THRESHOLD, type Catalog } from '../src/engine/catalogFormat';
import { countSolutions, isValidSolution } from '../src/engine/solver';
import { Topology, solve, stepCode } from '../src/engine/deduce';
import { gradeFromReport } from '../src/engine/generator';
import { addDaysKey } from '../src/engine/levels';

const catalog = raw as unknown as Catalog;
const all = [...catalog.campaign, ...catalog.daily, ...(catalog.tutorial ?? [])];

function connected(regions: number[][]): boolean {
  const n = regions.length;
  for (let id = 0; id < n; id++) {
    const cells: Array<[number, number]> = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (regions[r][c] === id) cells.push([r, c]);
    if (!cells.length) return false;
    const seen = new Set([`${cells[0][0]},${cells[0][1]}`]);
    const stack = [cells[0]];
    while (stack.length) {
      const [r, c] = stack.pop()!;
      for (const [rr, cc] of [
        [r + 1, c],
        [r - 1, c],
        [r, c + 1],
        [r, c - 1],
      ])
        if (rr >= 0 && cc >= 0 && rr < n && cc < n && regions[rr][cc] === id && !seen.has(`${rr},${cc}`)) {
          seen.add(`${rr},${cc}`);
          stack.push([rr, cc]);
        }
    }
    if (seen.size !== cells.length) return false;
  }
  return true;
}

describe('catalog v1', () => {
  it('has 200 campaign levels with sequential ids and 90 contiguous daily dates', () => {
    expect(catalog.catalogVersion).toBe('v1');
    expect(catalog.campaign).toHaveLength(200);
    catalog.campaign.forEach((e, i) => expect(e.id).toBe(`campaign-${String(i + 1).padStart(4, '0')}`));
    expect(catalog.daily).toHaveLength(90);
    catalog.daily.forEach((e, i) => {
      expect(e.date).toBe(addDaysKey(catalog.daily[0].date!, i));
      expect(e.id).toBe(`daily-${e.date}`);
    });
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  });

  it('every entry is unique, valid, connected and solvable by logic at exactly its labeled difficulty', () => {
    for (const e of all) {
      const p = decodeEntry(e, catalog.catalogVersion);
      const n = p.size;
      expect(isValidSolution(n, p.regions, p.solution), e.id).toBe(true);
      expect(connected(p.regions), e.id).toBe(true);
      expect(countSolutions(n, p.regions, p.givens, 2).count, e.id).toBe(1);
      for (const g of p.givens) expect(p.solution[g.r][g.c], e.id).toBe(g.kind);
      const t = new Topology(n, p.regions);
      const rep = solve(t, p.givens, { maxTier: e.grade.maxTier });
      expect(rep.solved, e.id).toBe(true);
      expect(rep.steps.map((s) => stepCode(t, s)).join(' '), `${e.id} trace`).toBe(e.trace);
      expect(gradeFromReport(n, rep, p.givens.length).difficulty, e.id).toBe(e.difficulty);
    }
  });

  it('contains no duplicate or near-duplicate layouts (rotations and reflections included)', () => {
    const keys = all.map((e) => canonicalKey(decodeEntry(e, 'v1').regions));
    expect(new Set(keys).size).toBe(keys.length);
    const decoded = all.map((e) => decodeEntry(e, 'v1'));
    for (let i = 0; i < decoded.length; i++)
      for (let j = i + 1; j < decoded.length; j++) {
        if (decoded[i].size !== decoded[j].size) continue;
        expect(layoutSimilarity(decoded[i].regions, decoded[j].regions), `${all[i].id} ~ ${all[j].id}`).toBeLessThan(NEAR_DUPLICATE_THRESHOLD);
      }
  });

  it('campaign difficulty ramps: first levels are easy 5×5, no expert before level 100', () => {
    expect(catalog.campaign.slice(0, 8).every((e) => e.size === 5 && e.difficulty === 'easy')).toBe(true);
    expect(catalog.campaign.slice(0, 99).some((e) => e.difficulty === 'expert')).toBe(false);
  });
});
