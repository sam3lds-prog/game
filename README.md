# Cats & Dogs — logic puzzle (working name)

An iPhone-first logic puzzle. **Every row, column and color region gets exactly one cat and one dog, and a cat and a dog never share an edge** (corners are fine). Every published board has exactly one answer and can be solved without guessing.

Built with Vite + TypeScript (no UI framework) and shipped to iOS with Capacitor 6.

## Try it

```bash
npm ci
npm run dev          # http://localhost:5173 — open the Network URL on your phone (same Wi-Fi)
```

## Checks

| Command | What it does |
| --- | --- |
| `npm test` | unit + DOM tests (engine soundness, catalog validity, sessions, faces, hints, records, ads policy…) |
| `npm run test:e2e` | Playwright on the production build at iPhone sizes (first run: `npx playwright install chromium`) |
| `npm run check` | tests + production build + 1,000-board generator verification |
| `npm run gen:verify-10k` | 10,000-board generator verification (`docs/generator-report.md`) |
| `npm run catalog:build` | regenerate `src/content/catalog.v1.json` (deterministic — see `docs/engine.md`) |

## iOS

```bash
npm run ios:sync     # build web app → ios/, pod install (needs CocoaPods on a Mac)
npm run ios:open     # open in Xcode, pick your Team, Run
```

Full walkthrough: [`docs/ios-release.md`](docs/ios-release.md). Ads and purchases are **off** in release builds until real providers are configured: [`docs/monetization.md`](docs/monetization.md).

## What's in the game

- **Campaign** of 200 levels (5×5 easy → 9×9 expert) and **90 dailies** from a curated, versioned catalog.
- **Tutorial** (5 interactive steps), **Zen** (no hearts/clock) and **Challenge** (3 hearts, timer, immediate checking).
- **Hints** that explain the next deduction first and reveal only on a second tap.
- **Faces only**: animals never move; eyes, lids, brows, mouth and cheeks react inside their tile. On / Minimal / Off, and iOS Reduce Motion is respected.
- **Daily calendar** with forgiving streaks, **stats**, **awards**, collectible **coats**, **unlimited** mode.
- Autosave on every move; dark mode; color-blind patterns; VoiceOver labels; keyboard play; Dynamic Type.

## Project layout

```
src/
  engine/      rules, exact solver, deduction engine (techniques + traces), generator, catalog format
  content/     catalog.v1.json (campaign, daily, tutorial pool)
  game/        session model, hints, tutorial lessons, faces (controller + expressions), records, streaks
  screens/     home, game, tutorial, levels, calendar, stats, collection, sheets
  ui/          board view, sheets
  services/    storage, sessions, ads (policy + providers), iap (entitlements), analytics, sound, haptics
  native/      Capacitor adapters: haptics, durable storage, share, lifecycle, reminders
  style/       animal-faces.css (the only motion), coats.css (colors only)
ios/           Capacitor iOS project (iPhone, portrait, privacy manifest, icon, splash)
scripts/       catalog builder, generator verifier, screenshots, store assets
e2e/           Playwright specs      test/  Vitest specs
docs/          see below
```

## Docs

| Doc | |
| --- | --- |
| [`docs/baseline-report.md`](docs/baseline-report.md) | Sprint 0 audit of v1 |
| [`docs/faces.md`](docs/faces.md) | facial-animation contract |
| [`docs/engine.md`](docs/engine.md) | solver, techniques, difficulty, catalog policy |
| [`docs/catalog-report.md`](docs/catalog-report.md) · [`docs/generator-report.md`](docs/generator-report.md) | content and 10k verification reports |
| [`docs/monetization.md`](docs/monetization.md) | ad policy, enabling AdMob / RevenueCat |
| [`docs/privacy-policy.md`](docs/privacy-policy.md) · `public/privacy.html` | privacy policy |
| [`docs/store/listing.md`](docs/store/listing.md) | App Store text, privacy answers, audience decision, screenshots, icon |
| [`docs/ios-release.md`](docs/ios-release.md) | Xcode → device → TestFlight |
| [`docs/qa-matrix.md`](docs/qa-matrix.md) | device test matrix |
| [`docs/playtest-plan.md`](docs/playtest-plan.md) | Sprint 7 external playtest kit |

## Name

"Cats vs Dogs" is already used by several apps; the final brand is TBD. Change it in `src/brand.ts` and `capacitor.config.ts`.
