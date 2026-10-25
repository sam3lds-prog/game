# Cats vs Dogs — logic puzzle

A two-species take on the Queens / Star Battle puzzle. Built as a web app (Vite + TypeScript, no framework) and shipped to iOS through Capacitor.

**Rules**

1. Every row, column and color region gets exactly **one cat and one dog**.
2. A cat and a dog **never sit side by side**. Diagonal is fine.

Every board has exactly one solution and is solvable by pure logic — the generator only accepts puzzles its own deduction engine can finish without guessing.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — open on your phone via the LAN URL vite prints
npm test           # engine + session tests
npm run gen:check  # generates 1,000 puzzles and verifies uniqueness/validity
npm run build      # production build → dist/
```

## Ship it to iOS (first time)

Needs a Mac with Xcode and an Apple Developer account ($99/yr).

```bash
npm run build
npx cap add ios          # creates ios/App (once)
npx cap sync             # copies dist/ into the native shell
npx cap open ios         # opens Xcode
```

In Xcode: set your Team under *Signing & Capabilities*, bump the bundle id if you change `appId` in `capacitor.config.ts`, add the app icon set, then *Product → Archive → Distribute* to TestFlight.

After every web change: `npm run cap:sync`, then build/run from Xcode.

## Project layout

```
src/engine/   pure puzzle logic — no DOM
  types.ts      Puzzle, Kind, rules
  solver.ts     exact backtracking solver (uniqueness check)
  deduce.ts     human-style deduction engine (grading + hints)
  generator.ts  placement → regions → minimized givens → verify
  levels.ts     level ladder + daily seeds
  rng.ts        seeded RNG (same seed = same puzzle everywhere)
src/game/     session state (marks, hearts, undo, hints) + icons
src/services/ storage, ads (stub), iap (stub)
src/main.ts   screens: home, levels, game, overlays
scripts/      verify-generator.ts
test/         vitest
```

## Monetization hooks (stubbed, ready to wire)

| Placement | Where | Native plugin to drop in |
| --- | --- | --- |
| Interstitial after each solved level, cooldown 120s → 100s → 90s by tenure | `services/ads.ts` `maybeShowInterstitial` | `@capacitor-community/admob` or AppLovin MAX |
| Rewarded: refill hearts on game over | `onLose()` in `main.ts` | same |
| Rewarded: hint | `giveHint()` in `main.ts` | same |
| Remove Ads $3.99 (non-consumable) | `services/iap.ts` | RevenueCat `@revenuecat/purchases-capacitor` |

Replace `StubAdService` / `StubIapService` with real implementations; nothing else changes.

## Roadmap after v1

- App icon + App Store screenshots
- Analytics (GameAnalytics) on level start/complete/fail/ad shown
- Dark mode
- More deduction techniques → fewer given pets on big boards
- Localization (strings are already in one file)
- Publisher prototype submissions (Supercent, Voodoo, Rollic, Homa)
