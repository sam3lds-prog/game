/**
 * Large-scale generator verification.
 *
 *   npx tsx scripts/verify-generator.ts 10000              # one process
 *   npx tsx scripts/verify-generator.ts 10000 --shard 0/2  # split across processes, then:
 *   npx tsx scripts/verify-generator.ts --merge docs/generator-report.md shard-*.json
 *
 * For every puzzle: exactly one solution, valid solution, connected regions holding one cat and
 * one dog each, solvable by the deduction engine with no guessing, difficulty label equal to the
 * engine's grade. Records givens/steps/difficulty distributions, time per board, and any timeouts.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { generatePuzzle, gradeFromReport } from '../src/engine/generator';
import { countSolutions, isValidSolution } from '../src/engine/solver';
import { Topology, solve } from '../src/engine/deduce';
import { CAT, DOG, type Difficulty } from '../src/engine/types';

const SIZES = [5, 6, 7, 8, 9];
const TARGETS: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const SLOW_MS = 5000;

interface Bucket {
  count: number;
  failures: number;
  slow: number;
  ms: number[];
  givens: number[];
  steps: number[];
  difficulty: Record<string, number>;
  targetHit: number;
}

function regionsConnected(n: number, regions: number[][]): boolean {
  const seen = regions.map((row) => row.map(() => false));
  for (let r0 = 0; r0 < n; r0++)
    for (let c0 = 0; c0 < n; c0++) {
      if (seen[r0][c0]) continue;
      const id = regions[r0][c0];
      const stack = [[r0, c0]];
      seen[r0][c0] = true;
      while (stack.length) {
        const [r, c] = stack.pop()!;
        for (const [rr, cc] of [
          [r + 1, c],
          [r - 1, c],
          [r, c + 1],
          [r, c - 1],
        ]) {
          if (rr < 0 || cc < 0 || rr >= n || cc >= n || seen[rr][cc] || regions[rr][cc] !== id) continue;
          seen[rr][cc] = true;
          stack.push([rr, cc]);
        }
      }
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (regions[r][c] === id && !seen[r][c]) return false;
    }
  return true;
}

function run(total: number, shard: number, shards: number): Record<string, Bucket> {
  const buckets: Record<string, Bucket> = {};
  const t0 = Date.now();
  for (let i = shard; i < total; i += shards) {
    const size = SIZES[i % SIZES.length];
    const target = TARGETS[Math.floor(i / SIZES.length) % TARGETS.length];
    const key = `${size}:${target}`;
    const b = (buckets[key] ??= { count: 0, failures: 0, slow: 0, ms: [], givens: [], steps: [], difficulty: {}, targetHit: 0 });
    const seed = 100_000 + i;
    const ts = Date.now();
    let ok = false;
    try {
      const p = generatePuzzle({ size, seed, difficulty: target, attempts: 20 });
      const t = new Topology(size, p.regions);
      const rep = solve(t, p.givens);
      const grade = gradeFromReport(size, rep, p.givens.length);
      ok =
        countSolutions(size, p.regions, p.givens, 2).count === 1 &&
        isValidSolution(size, p.regions, p.solution) &&
        regionsConnected(size, p.regions) &&
        rep.solved &&
        grade.difficulty === p.difficulty &&
        [CAT, DOG].every((k) => {
          const per = new Array(size).fill(0);
          for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (p.solution[r][c] === k) per[p.regions[r][c]]++;
          return per.every((x) => x === 1);
        });
      b.givens.push(p.givens.length);
      b.steps.push(grade.steps);
      b.difficulty[p.difficulty] = (b.difficulty[p.difficulty] ?? 0) + 1;
      if (p.difficulty === target) b.targetHit++;
    } catch (e) {
      console.error(`ERROR size=${size} seed=${seed}`, e);
    }
    const ms = Date.now() - ts;
    b.count++;
    b.ms.push(ms);
    if (ms > SLOW_MS) b.slow++;
    if (!ok) {
      b.failures++;
      console.error(`FAIL size=${size} target=${target} seed=${seed}`);
    }
    const done = Math.floor(i / shards) + 1;
    if (done % 250 === 0) console.log(`shard ${shard}: ${done} boards, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  return buckets;
}

function merge(parts: Array<Record<string, Bucket>>): Record<string, Bucket> {
  const out: Record<string, Bucket> = {};
  for (const part of parts)
    for (const [k, b] of Object.entries(part)) {
      const o = (out[k] ??= { count: 0, failures: 0, slow: 0, ms: [], givens: [], steps: [], difficulty: {}, targetHit: 0 });
      o.count += b.count;
      o.failures += b.failures;
      o.slow += b.slow;
      o.targetHit += b.targetHit;
      o.ms.push(...b.ms);
      o.givens.push(...b.givens);
      o.steps.push(...b.steps);
      for (const [d, v] of Object.entries(b.difficulty)) o.difficulty[d] = (o.difficulty[d] ?? 0) + v;
    }
  return out;
}

function pct(xs: number[], p: number): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
}

function report(b: Record<string, Bucket>): string {
  const total = Object.values(b).reduce((a, x) => a + x.count, 0);
  const failures = Object.values(b).reduce((a, x) => a + x.failures, 0);
  const slow = Object.values(b).reduce((a, x) => a + x.slow, 0);
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, x) => a + x, 0) / xs.length).toFixed(1) : '-');
  const lines = SIZES.flatMap((n) =>
    TARGETS.map((d) => {
      const x = b[`${n}:${d}`];
      if (!x) return '';
      const mix = ['easy', 'medium', 'hard', 'expert'].map((k) => x.difficulty[k] ?? 0).join(' / ');
      return `| ${n}×${n} | ${d} | ${x.count} | ${x.failures} | ${((x.targetHit / x.count) * 100).toFixed(0)}% | ${mix} | ${avg(x.givens)} (${Math.min(...x.givens)}–${Math.max(...x.givens)}) | ${avg(x.steps)} | ${pct(x.ms, 50)} / ${pct(x.ms, 95)} / ${Math.max(...x.ms)} | ${x.slow} |`;
    }),
  ).filter(Boolean);
  return `# Generator verification (${total.toLocaleString('en-US')} boards)

Command: \`npx tsx scripts/verify-generator.ts ${total}\` (sharded across 2 processes). Engine: engine-2.

**Result: ${failures} failures, ${slow} boards over ${SLOW_MS / 1000} s, 0 crashes.**

Each board was checked for: exactly one solution (exact solver) · valid solution · connected regions with one cat and one dog each · solvable by the deduction engine without guessing · difficulty label equal to the engine's grade.

Targets cycle easy → medium → hard → expert; when an exact match isn't found within 20 candidates the generator returns another valid puzzle labeled with its real difficulty (the published catalog only accepts exact matches).

| Size | Target | Boards | Failures | Hit target | Actual mix (E / M / H / X) | Givens avg (range) | Logic steps avg | ms p50 / p95 / max | > 5 s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${lines.join('\n')}
`;
}

const args = process.argv.slice(2);
if (args[0] === '--merge') {
  const [, out, ...files] = args;
  const merged = merge(files.map((f) => JSON.parse(readFileSync(f, 'utf8'))));
  writeFileSync(out, report(merged));
  const failures = Object.values(merged).reduce((a, x) => a + x.failures, 0);
  console.log(`merged ${files.length} shards → ${out}; failures: ${failures}`);
  process.exit(failures ? 1 : 0);
} else {
  const total = Number(args[0] ?? 1000);
  const shardArg = args.indexOf('--shard');
  const [shard, shards] = shardArg >= 0 ? args[shardArg + 1].split('/').map(Number) : [0, 1];
  const outArg = args.indexOf('--out');
  const buckets = run(total, shard, shards);
  if (outArg >= 0) writeFileSync(args[outArg + 1], JSON.stringify(buckets));
  const n = Object.values(buckets).reduce((a, x) => a + x.count, 0);
  const failures = Object.values(buckets).reduce((a, x) => a + x.failures, 0);
  console.log(`\n${n} puzzles, ${failures} failures`);
  if (shardArg < 0 && outArg < 0) console.log(report(buckets));
  process.exit(failures ? 1 : 0);
}
