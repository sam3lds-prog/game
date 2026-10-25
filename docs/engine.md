# Puzzle engine and content pipeline

## Rules (unchanged)
One cat **and** one dog in every row, column and region. A cat and a dog never share an edge; diagonal contact is allowed.

## Authorities
- **Exact solver** (`src/engine/solver.ts`) — backtracking; the only authority on uniqueness.
- **Deduction engine** (`src/engine/deduce.ts`) — explainable steps a person can follow. Used for difficulty, hints, dead-cell dots and the solution trace. It never consults the hidden solution.

## Techniques

| Tier | Technique | Code | What the player sees |
| --- | --- | --- | --- |
| 1 | last-spot | S | "Row 3 has only one place left for its cat." |
| 2 | confined | C | "Every spot left for the cat of the Mint region is in row 4, so nothing else in row 4 can hold a cat." |
| 2 | squeeze | Q | "Wherever the dog of column 2 goes, it would sit beside this cell, so a cat can't go here." |
| 3 | locked-2 | K2 | "The cats of rows 2 and 5 must sit inside the Rose and Sky regions…" |
| 4 | locked-3/4 | K3/K4 | same with three or four units |
| 5 | forcing | F | "If a cat sat here, column 6 would end up with nowhere for its dog. So no cat here." |

Locked sets are Hall-set reasoning (generalized all-different) on each pair of unit kinds: rows↔regions, columns↔regions, rows↔columns. Forcing makes one assumption and follows only tier 1–2 logic to a contradiction — no search, no guessing.

`test/engine.test.ts` replays 60 puzzles step by step and checks every placement and elimination against the unique solution.

## Difficulty
Hardest tier the engine needs: **easy** = tier 1 only · **medium** = tier 2 · **hard** = tier 3 (or one tier-4 step) · **expert** = forcing or repeated tier-4 steps. Within a difficulty, `grade.score` (tier, hard steps, forcing steps, given density, step count, how many easy moves were available) orders puzzles. `generateExact` returns null instead of a near miss; `generatePuzzle` always labels the real grade.

## Catalog (`src/content/catalog.v1.json`)
Built offline by `npm run catalog:build` — deterministic (same file every run).
- 200 campaign levels (`campaign-0001`…), 90 dailies (`daily-2026-10-25`…`daily-2027-01-22`).
- Each entry: id, size, difficulty, seed, regions, solution, givens, solution trace, grade metrics; the file carries `catalogVersion` and `engineVersion`.
- Rejected at build time: exact duplicates and near-duplicates (region boundary similarity ≥ 0.8 under all rotations/reflections).
- `test/catalog.test.ts` re-verifies every entry on each test run: unique, valid, connected, logic-solvable at its tier, trace reproduces exactly, label matches grade, no duplicates.

**Daily date policy:** the player's local calendar date (`YYYY-MM-DD`) picks the puzzle; a new one unlocks at local midnight. All app versions map a date to the same id. Never regenerate a published version — append dates in `catalog.v2.json` and keep v1 entries unchanged.

## Verification at scale
`npm run gen:verify-10k` — see `docs/generator-report.md` for the latest run.
