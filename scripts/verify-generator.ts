/**
 * Generates puzzles across sizes and verifies: unique solution, valid solution, connected regions,
 * one cat + one dog per region. Prints timing and difficulty mix.
 *
 *   npm run gen:check            # default 1000 puzzles
 *   npx tsx scripts/verify-generator.ts 200
 */
import { generatePuzzle } from '../src/engine/generator';
import { countSolutions, isValidSolution } from '../src/engine/solver';
import { CAT, DOG } from '../src/engine/types';

const total = Number(process.argv[2] ?? 1000);
const sizes = [5, 6, 7, 8, 9];
const perSize = Math.ceil(total / sizes.length);

function regionsConnected(n: number, regions: number[][]): boolean {
  const seen = regions.map((row) => row.map(() => false));
  for (let r0 = 0; r0 < n; r0++)
    for (let c0 = 0; c0 < n; c0++) {
      if (seen[r0][c0]) continue;
      const id = regions[r0][c0];
      // flood fill
      const stack = [[r0, c0]];
      seen[r0][c0] = true;
      while (stack.length) {
        const [r, c] = stack.pop()!;
        for (const [dr, dc] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= n || cc >= n || seen[rr][cc] || regions[rr][cc] !== id) continue;
          seen[rr][cc] = true;
          stack.push([rr, cc]);
        }
      }
      // any other cell with this id not seen → disconnected
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (regions[r][c] === id && !seen[r][c]) return false;
    }
  return true;
}

let failures = 0;
let count = 0;
const diffMix: Record<string, Record<string, number>> = {};
const t0 = Date.now();
for (const n of sizes) {
  const ts = Date.now();
  diffMix[n] = {};
  for (let i = 0; i < perSize; i++) {
    const seed = 1000 * n + i;
    const p = generatePuzzle({ size: n, seed });
    count++;
    diffMix[n][p.difficulty] = (diffMix[n][p.difficulty] ?? 0) + 1;
    const res = countSolutions(n, p.regions, p.givens, 2);
    const ok =
      res.count === 1 &&
      isValidSolution(n, p.regions, p.solution) &&
      regionsConnected(n, p.regions) &&
      p.regions.flat().every((v) => v >= 0 && v < n) &&
      [CAT, DOG].every((k) => {
        const per = new Array(n).fill(0);
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (p.solution[r][c] === k) per[p.regions[r][c]]++;
        return per.every((x) => x === 1);
      });
    if (!ok) {
      failures++;
      console.error(`FAIL size=${n} seed=${seed} count=${res.count}`);
    }
  }
  console.log(`size ${n}: ${perSize} puzzles in ${Date.now() - ts}ms (${((Date.now() - ts) / perSize).toFixed(1)} ms each)  mix=${JSON.stringify(diffMix[n])}`);
}
console.log(`\n${count} puzzles, ${failures} failures, ${Date.now() - t0}ms total`);
process.exit(failures ? 1 : 0);
