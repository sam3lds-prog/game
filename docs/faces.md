# Animal faces — asset and motion contract

**Rule:** animals never move. Only facial parts change, inside the tile the animal already occupies.

## SVG structure (`src/game/icons.ts`)

```
<svg class="pet pet--cat|pet--dog" viewBox="0 0 64 64">     ← never animated
  <g class="pet__base">  ears, head, muzzle, nose, markings   ← never animated
  <g class="face">
    .cheek ×2
    .eye > .pupil + .shine     (×2)
    .eye-happy                 (closed "^ ^" eyes)
    .lid > ellipse.fur + line  (×2, scaleY 0 → 1 from the top)
    .brow--l / .brow--r
    .mouth--neutral | smile | grin | frown | flat | wavy | o
```

- No `id` attributes. Colorable parts use classes: `.fur`, `.fur-2`, `.muzzle`, `.nose` (coats in Sprint 5 only recolor these).
- `.detail` (whiskers, stripes, shine, blaze) is hidden when cells are under 36 px.
- `FACE_GEOMETRY` records the head box and each part's box; tests prove every expression stays inside.

## Expressions (`src/game/faceExpressions.ts`, `src/style/animal-faces.css`)

| Event | Cat | Dog | ms |
| --- | --- | --- | --- |
| idle | blink | blink | 160 |
| placed | happy: bright eyes, small smile, cheeks | happy: wider smile | 550 |
| adjacency conflict (the crowded pet) | annoyed: narrowed eyes, low brows, frown | surprised: wide eyes, raised brows, concerned mouth | 500 |
| other invalid (the existing same-species pet) | puzzled | puzzled | 500 |
| hint | thinking | thinking | 500 |
| lost | worried | worried | 750 per wave |
| won | celebrate: happy eyes, open smile | celebrate | waves of ≤ 6, total 0.8–1.5 s |
| long-press | content | content (tongue grin) | 600 |

Priority: won > lost > invalid > placed > hint > pet > idle. At most 3 reactions at once while solving (idle ≤ 2). Idle blinks are random per animal, 10–20 s apart (15–25 s on 9×9).

`solution_mismatch` and taps on fixed pets involve no visible animal, so they get static text only — no face is invented in an empty tile.

## Settings

- **Animal expressions: On / Minimal / Off.** Minimal = reactions to your moves only (no idle, no petting). Off = no reactions; win/lose show static happy/worried faces.
- **Reduced motion (OS setting):** no idle blinks or timed sequences; expressions swap with no transition.

## Enforcement

- `test/animal-faces.test.ts` — only `animal-faces.css` may contain motion; every moving selector ends on a face part; transforms per part keep it inside the head; priorities, caps, debounce, waves, pause/dispose, reduced motion, Off/Minimal.
- `e2e/faces.spec.ts` — plays 5×5 and 9×9 levels to the win while sampling `document.getAnimations()` every frame: every animation must target `.board .pet .face *`, and no cell, pet or board rectangle may change. Also measures every visible facial part in every expression against its cell.
