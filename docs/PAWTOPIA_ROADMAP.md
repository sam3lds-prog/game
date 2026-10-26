# Pawtopia — Roadmap & status

Branch: `feature/pawtopia` · Base: `main` @ `282d459`

The full product spec lives outside the repo (`PAWTOPIA_FULL_PRODUCT_AND_CLAUDE_BUILD_PLAN.md`). This file
tracks what is actually built, by sprint, and what still needs external setup.

## Baseline audit (main @ 282d459)

| Check | Result |
| --- | --- |
| `npm test` | 12/12 passing |
| `npm run gen:check` | 1,000 puzzles, 0 failures |
| `npm run build` | OK (28 kB JS) |

Defects confirmed in source and fixed in Sprint 0:

| # | Defect | Where | Fix |
| --- | --- | --- | --- |
| 1 | "Next level" replays the solved level | `main.ts` win sheet called `startLevel(mode.level)` | `nextAfterWin()` → `level + 1`, regression test |
| 2 | Reset wipes every key on the origin | `localStorage.clear()` | `resetProgress()` removes only `pawtopia.*`/`cvd.*`, keeps purchases |
| 3 | First-run rules read can throw | bare `localStorage.getItem('cvd.seenRules')` | all storage through guarded `KV` with memory fallback |
| 4 | Win/loss can be processed twice | `checkOutcome()` re-entrancy | `Session.claimOutcome()` |
| 5 | Async continuations after leaving the board | rewarded ad / revive callbacks | screen token (Sprint 0), router scopes (Sprint 1) |
| 6 | Closing the app loses the board | no persistence | snapshot on every move + on background, digest-checked resume |
| 7 | Interstitial before the celebration | `onWin` awaited the ad first | results first, then policy-gated ad |
| 8 | IAP stub "succeeds" in any build | `StubIapService` | dev-only stub, release returns `unavailable`, dev grants ignored in release |
| 9 | Streak "yesterday" computed from wall clock at win time | `onWin` | computed from the puzzle's own date key |
| 10 | Pet art moves when placed / on error | `.pop` scale, `.shake` translate | Sprint 2: facial-only animation |

## Sprint status

- [x] **Sprint 0** — bug fixes, v2 save + migration, session persistence, ad/IAP safety, regression tests
- [ ] **Sprint 1** — design system, router, modular screens, bottom nav
- [ ] **Sprint 2** — pet face rigs, facial-only animation scheduler
- [ ] **Sprint 3** — onboarding, Zen, hint tiers, verified 60-level pack, chapters
- [ ] **Sprint 4** — sanctuary, collection, decor, idempotent coin ledger
- [ ] **Sprint 5** — achievements, missions, streaks, scoring + replay verifier, honest League UI
- [ ] **Sprint 6** — shop honesty, settings, accessibility, analytics hooks, polish

## Needs you (external)

Nothing yet. Later sprints list exact steps (Apple Developer, StoreKit/RevenueCat, AdMob, Firebase).
