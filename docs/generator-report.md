# Generator verification (10,000 boards)

Command: `npx tsx scripts/verify-generator.ts 10000` (sharded across 2 processes). Engine: engine-2.

**Result: 0 failures, 0 boards over 5 s, 0 crashes.**

Each board was checked for: exactly one solution (exact solver) · valid solution · connected regions with one cat and one dog each · solvable by the deduction engine without guessing · difficulty label equal to the engine's grade.

Targets cycle easy → medium → hard → expert; when an exact match isn't found within 20 candidates the generator returns another valid puzzle labeled with its real difficulty (the published catalog only accepts exact matches).

| Size | Target | Boards | Failures | Hit target | Actual mix (E / M / H / X) | Givens avg (range) | Logic steps avg | ms p50 / p95 / max | > 5 s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5×5 | easy | 500 | 0 | 100% | 500 / 0 / 0 / 0 | 2.1 (1–3) | 7.9 | 0 / 1 / 8 | 0 |
| 5×5 | medium | 500 | 0 | 100% | 0 / 500 / 0 / 0 | 1.2 (1–3) | 14.7 | 1 / 2 / 20 | 0 |
| 5×5 | hard | 500 | 0 | 24% | 68 / 312 / 120 / 0 | 1.2 (1–3) | 15.1 | 6 / 11 / 80 | 0 |
| 5×5 | expert | 500 | 0 | 83% | 16 / 69 / 1 / 414 | 1.1 (1–3) | 18.0 | 4 / 13 / 84 | 0 |
| 6×6 | easy | 500 | 0 | 100% | 500 / 0 / 0 / 0 | 3.1 (1–5) | 8.9 | 0 / 1 / 22 | 0 |
| 6×6 | medium | 500 | 0 | 100% | 0 / 500 / 0 / 0 | 2.1 (1–5) | 15.4 | 1 / 4 / 16 | 0 |
| 6×6 | hard | 500 | 0 | 31% | 116 / 227 / 157 / 0 | 2.2 (1–5) | 16.0 | 17 / 27 / 69 | 0 |
| 6×6 | expert | 500 | 0 | 71% | 57 / 84 / 2 / 357 | 1.8 (1–5) | 20.0 | 67 / 154 / 267 | 0 |
| 7×7 | easy | 500 | 0 | 100% | 500 / 0 / 0 / 0 | 4.1 (2–6) | 9.9 | 1 / 1 / 6 | 0 |
| 7×7 | medium | 500 | 0 | 100% | 0 / 500 / 0 / 0 | 3.2 (1–6) | 16.0 | 2 / 5 / 48 | 0 |
| 7×7 | hard | 500 | 0 | 38% | 118 / 190 / 192 / 0 | 3.1 (1–7) | 17.1 | 31 / 50 / 147 | 0 |
| 7×7 | expert | 500 | 0 | 84% | 29 / 48 / 2 / 421 | 2.8 (1–6) | 21.7 | 165 / 424 / 738 | 0 |
| 8×8 | easy | 500 | 0 | 100% | 500 / 0 / 0 / 0 | 5.3 (2–9) | 10.7 | 1 / 2 / 9 | 0 |
| 8×8 | medium | 500 | 0 | 100% | 0 / 500 / 0 / 0 | 4.3 (1–7) | 16.8 | 3 / 10 / 52 | 0 |
| 8×8 | hard | 500 | 0 | 42% | 98 / 191 / 211 / 0 | 4.2 (1–9) | 18.5 | 49 / 78 / 134 | 0 |
| 8×8 | expert | 500 | 0 | 62% | 57 / 126 / 5 / 312 | 4.1 (1–7) | 20.1 | 508 / 963 / 1485 | 0 |
| 9×9 | easy | 500 | 0 | 100% | 500 / 0 / 0 / 0 | 6.6 (2–10) | 11.4 | 1 / 5 / 29 | 0 |
| 9×9 | medium | 500 | 0 | 100% | 0 / 500 / 0 / 0 | 5.4 (2–9) | 17.5 | 5 / 17 / 187 | 0 |
| 9×9 | hard | 500 | 0 | 44% | 88 / 193 / 219 / 0 | 5.2 (1–9) | 19.5 | 84 / 152 / 334 | 0 |
| 9×9 | expert | 500 | 0 | 62% | 61 / 120 / 7 / 312 | 5.4 (1–10) | 20.1 | 921 / 1688 / 2538 | 0 |
