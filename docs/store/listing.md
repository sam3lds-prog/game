# App Store listing draft

Final brand name is still TBD ("Cats vs Dogs" is taken by several apps). Candidates checked only informally: Hiss & Howl, Catnip & Kibble, Purrfect Peace, Fur Truce, Whisker & Wag. Before choosing: search the App Store and USPTO (TESS) for conflicts.

| Field | Draft |
| --- | --- |
| Name (30 chars) | Cats & Dogs — Logic Puzzles *(placeholder)* |
| Subtitle (30) | One cat, one dog, no squabbles |
| Category | Games › Puzzle (secondary: Games › Board) |
| Age rating | 4+ (no objectionable content; no ads, purchases, web access or user content in v1) |
| Price | Free |
| Keywords (100) | logic,puzzle,cats,dogs,queens,star battle,brain,daily,sudoku,zen,deduction,grid |
| Support URL | *(needed: a page or email form)* |
| Privacy policy URL | `public/privacy.html` hosted somewhere public, e.g. GitHub Pages (needs a public repo or a paid GitHub plan) or any static host |
| Copyright | © 2026 *(your name or company)* |

**Promotional text (170):** Two species, one rule of peace. Place a cat and a dog in every row, column and color — never side by side. A fresh Daily every day.

**Description:**

> Every row, every column and every color needs exactly one cat and one dog — and a cat and a dog can never sit side by side. Corners are fine.
>
> • 200 hand-checked levels from gentle 5×5 boards to tricky 9×9 experts
> • A new Daily Puzzle every day, with a forgiving streak (one rest day a week)
> • Zen mode: no hearts, no clock. Challenge mode: 3 hearts and a timer
> • Hints that explain the logic first — and reveal only if you ask
> • Every puzzle has exactly one answer and never needs guessing
> • Pets react with little expressions — calm, never distracting (or turn them off)
> • Unlimited boards, stats, awards and collectible coats
> • Dark mode, color-blind patterns, VoiceOver support, works offline

## App Privacy answers (v1 as built)

- Data collection: **Data Not Collected** (analytics is off by default and has no endpoint configured).
- If you later configure the analytics endpoint: Usage Data › Product Interaction, Diagnostics › Crash Data — *not linked to the user, not used for tracking*, purpose: Analytics and App Functionality. Update `PrivacyInfo.xcprivacy` to match.
- Ads or RevenueCat later change these answers — see `docs/monetization.md`.

## Audience decision (Kids Category)

Recommendation: **general audience, not the Kids Category.** The Kids Category forbids most third-party analytics and ad SDKs and requires parental gates, which would rule out the planned ad/IAP model. The game content is suitable for everyone (4+), it collects no personal data, and it doesn't market itself to children. Revisit only if you decide to build a kids-specific, ad-free product.

## Screenshots

`docs/store/screenshots/` — six 1290×2796 PNGs from the production build (iPhone 6.7"/6.9" slot). Confirm the currently required sizes in App Store Connect before upload; add captions in a design tool if you like.

## App icon

`docs/store/icon-1024.png` (opaque, no alpha) — also installed in `ios/App/App/Assets.xcassets/AppIcon.appiconset`. Regenerate with `npm run assets`.
