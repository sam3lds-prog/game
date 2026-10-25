# QA matrix

✅ automated (where) · ☐ needs a real-device check (fill in on TestFlight builds)

| Area | Case | Automated | Device |
| --- | --- | --- | --- |
| Install | Fresh install → tutorial → Level 1 | ✅ `e2e/play.spec.ts` | ☐ |
| Install | Returning install (v1 data) migrates progress, skips tutorial | ✅ `test/lifecycle.test.ts` (migration) | ☐ |
| Boards | 5×5 and 9×9 fit with all controls: 320×568, 375×667, 430×932 | ✅ `e2e/play.spec.ts` | ☐ SE, mini, Pro Max |
| Orientation | Portrait only (iPhone) | Info.plist | ☐ rotate the phone |
| Lifecycle | Background/foreground mid-level restores board, marks, tool, timer | ✅ `e2e/restore.spec.ts`, `test/lifecycle.test.ts` | ☐ |
| Lifecycle | Force-quit mid-level, relaunch → Continue restores | ✅ (reload) | ☐ |
| Lifecycle | iOS clears WebView storage → progress restored from Preferences backup | `src/native/durableStorage.ts` | ☐ (Settings → General → iPhone Storage → offload app, reinstall) |
| Offline | Airplane mode: everything works | no network used | ☐ |
| Ads | No ad provider: never shown, never blocks; "Keep going in Zen" | ✅ `e2e/release.spec.ts` | ☐ |
| Ads | Missing fill / rewarded dismissed → no reward | ✅ `test/monetization.test.ts` | ☐ when ads enabled |
| Purchases | Cancel / pending / failed grant nothing; restore on another device | ✅ unit (fake provider) | ☐ sandbox when enabled |
| Motion | Only facial parts animate; no tile movement | ✅ `e2e/faces.spec.ts` | ☐ watch for jank |
| Motion | Reduce Motion (iOS setting) → no animation | ✅ `e2e/faces.spec.ts` | ☐ |
| Appearance | Dark mode follows iOS; manual override | ✅ `e2e/play.spec.ts` | ☐ |
| Appearance | Region patterns (color-blind) | ✅ visual review | ☐ |
| Accessibility | VoiceOver reads every cell and move | labels + live region | ☐ VoiceOver pass |
| Accessibility | Large text (Settings → Display → Text Size) | Dynamic Type base font | ☐ largest size |
| Haptics | Light / error / success taps | `src/native/haptics.ts` | ☐ |
| Reminder | Opt-in, quiet, at chosen time; denied permission handled | `src/native/reminders.ts` | ☐ |
| Daily | New puzzle at local midnight; time zone change | ✅ `test/streak.test.ts`, `test/calendar.test.ts` | ☐ change time zone |
| Daily | Opened before midnight, solved just after → counts for its day | ✅ `test/review-fixes.test.ts` | ☐ |
| Reset | Reset from inside a game leaves no saved board; keeps settings, reminder, purchases, privacy choice | ✅ `test/review-fixes.test.ts` | ☐ |
| Saves | Browsing boards never evicts today's Daily or the current level; untouched boards aren't saved | ✅ `test/review-fixes.test.ts` | ☐ |
| Hints | Explain + Reveal counts as one hint (share text, stats) | ✅ `test/review-fixes.test.ts` | ☐ |
| Layout | Pips on/off mid-game refits the board; tutorial board never moves | ✅ `e2e/play.spec.ts` | ☐ |
| Ads/IAP | A throwing SDK never blocks Next, never rewards; "purchased" shown only when stored | ✅ `test/review-fixes.test.ts` | ☐ when enabled |
| Performance | No jank on 9×9 with faces On; battery idle | — | ☐ Instruments / feel |
| iOS versions | Deployment target iOS 13+ | Xcode | ☐ oldest supported device you have |
