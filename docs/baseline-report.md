# Sprint 0 baseline report

Commit audited: `282d459` (v1 on `main`). Run on 2026-10-25 in a Linux container with Node 22.

## Automated checks on v1 (before any change)

| Check | Command | Result |
| --- | --- | --- |
| Unit tests | `npm test` | 12 / 12 passed |
| Production build | `npm run build` | passed — 28.2 kB JS, 7.4 kB CSS |
| Generator verification | `npm run gen:check -- 1000` | 1,000 puzzles, 0 failures, 16.2 s |

Generator difficulty mix at 1,000 boards (v1 grader):

| Size | easy | medium | hard | expert |
| --- | --- | --- | --- | --- |
| 5×5 | 40 | 0 | 160 | 0 |
| 6×6 | 80 | 5 | 115 | 0 |
| 7×7 | 59 | 27 | 114 | 0 |
| 8×8 | 65 | 34 | 75 | 26 |
| 9×9 | 66 | 33 | 94 | 7 |

"Hard" on 5×5 is a labeling artifact of the v1 grader (it rates by technique + given count, not by solve effort). Addressed in Sprint 3.

## Regression suite (new, `npm run test:e2e`, Playwright, iPhone 13 viewport)

Result on unmodified v1: **1 passed, 5 failed**. After the Sprint 0 fixes: **6 / 6 passed**.

| Test | v1 | After Sprint 0 | Cause |
| --- | --- | --- | --- |
| Next level opens the following level | ❌ reopened Level 1 | ✅ | `startLevel(mode.level)` in the win sheet |
| Replay replays without double-advancing | ❌ no replay control | ✅ | added Replay; progression is idempotent |
| A win is handled once | ❌ a second tap opened a second result sheet | ✅ | `checkOutcome` re-ran `onWin` on every board click after winning |
| Three wrong placements → game over | ✅ (test fixed to skip given cells) | ✅ | — |
| Undo restores the previous cell | ✅ | ✅ | — |
| Reset clears only this game's data | ❌ wiped every key on the origin | ✅ | `localStorage.clear()` replaced with prefix-scoped removal |

## Spec bug list — status after Sprint 0

| # | Issue | Confirmed? | Fixed in |
| --- | --- | --- | --- |
| 1 | Next replays completed level | Yes (E2E) | Sprint 0 |
| 2 | No persisted active board | Yes (code) | Sprint 1 |
| 3 | Deduction has 3 techniques | Yes (code) | Sprint 3 |
| 4 | Generator returns nearest difficulty | Yes (code: `best` fallback) | Sprint 3 |
| 5 | `place()` penalizes hidden-solution mismatch | Yes (code) | Sprint 4 (Zen/Challenge) |
| 6 | Hint can reveal the answer directly | Yes (code: fallback in `Session.hint`) | Sprint 4 |
| 7 | Stub IAP succeeds without purchase; stub ads | Yes (code) | Sprint 6 (disabled in production) |
| 8 | Origin-wide `localStorage.clear()` | Yes (E2E) | Sprint 0 |
| 9 | `main.ts` mixes responsibilities; async ads outlive screens | Yes (code) | Sprint 1 |
| 10 | `.pop` / `.shake` / `.glow` tile animations | Yes (code) | Sprint 2 |
| — | Duplicate win handling (new finding) | Yes (E2E) | Sprint 0 |

## Screens at real iPhone point sizes

Captured with `node scripts/screenshots.mjs docs/baseline` (headless Chromium, 1× scale) — `docs/baseline/`.

Findings to fix:

- **SE (1st gen), 320×568:** the Undo / Hint / Rules row is cut off below the fold on 9×9. Board sizing uses viewport width only (`100vw`), not the space actually available.
- **9×9 cells are ~32 pt on 320-wide and ~37 pt on 375-wide devices.** Pets render at ~25 pt; readable but tight. Below Apple's 44 pt guideline — see the tap-target strategy in Sprint 4.
- **Region colors:** the green family (`--r0` rose… `--r3` mint, `--r7` lime) produces two near-identical greens on the same 9×9 board. Borders carry the region shape but color alone is not enough. Palette and optional patterns in Sprint 4.
- Given pets use a "zz" corner label; fine, but it competes with any future counters in the same corner.

## Not verified here

- Real devices (no iPhone attached to this environment). Every "phone" result above is headless Chromium at iPhone point sizes.
- Native build: no Xcode in this environment.
