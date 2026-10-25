# Ads and purchases

**Status in this build: both OFF.** Release builds use `noAdsProvider` and `unavailableIap`: no ad is ever shown, no reward is ever faked, the purchase UI is hidden, and nothing ever blocks progress. This is deliberate — the spec forbids unverified entitlements or fake rewards in production, and real ads/purchases need accounts only you can create.

To preview the flows while developing: run `npm run dev`, then in the browser console `localStorage.setItem('cd.dev.demo', '1')` and reload. A clearly labeled demo ad screen and a demo store appear. Demo purchases are ignored by release builds.

## Ad policy (`src/services/ads.ts`)

| Rule | Value |
| --- | --- |
| No ads in the tutorial or levels 1–5 | `firstLevelWithAds: 6` |
| Never mid-puzzle; interstitial only when tapping **Next** after a win | between-level transition |
| At most one interstitial per N solved puzzles | `solvesBetweenInterstitials: 4` |
| Minimum gap | `minGapMs: 6 min` |
| Never after the Daily | enforced |
| Rewarded ads optional; reward only after the SDK confirms completion | `rewarded()` resolves true only on `'rewarded'` |
| No ad available → never blocked | "Keep going in Zen" is always offered when hearts run out; hints are free |
| Verified Remove Ads purchase → no interstitials | `hasEntitlement('remove_ads')` |

Tests: `test/monetization.test.ts`, `e2e/release.spec.ts`.

## Turning ads on (AdMob example)

You need: an AdMob account, an iOS app registered in AdMob, the **App ID** (`ca-app-pub-…~…`) and two **ad unit IDs** (interstitial, rewarded).

1. `npm i @capacitor-community/admob@6` and `npx cap sync ios`.
2. Add `GADApplicationIdentifier` (your App ID) and AdMob's `SKAdNetworkItems` list to `ios/App/App/Info.plist`.
3. Decide on tracking: either request App Tracking Transparency (add `NSUserTrackingUsageDescription`) or serve non-personalized ads only. Without ATT consent, iOS ads are non-personalized anyway.
4. Create `src/services/admobProvider.ts` implementing `AdProvider`:
   - `available()` → SDK initialized and an ad loaded for that format.
   - `showInterstitial()` → `'shown'` only after the ad was presented.
   - `showRewarded()` → `'rewarded'` **only** from the SDK's reward callback; `'dismissed'` if closed early.
5. In `src/main.ts`, pass it instead of `noAdsProvider` (release builds only).
6. Update `ios/App/App/PrivacyInfo.xcprivacy` (AdMob ships its own manifest, but your App Store privacy answers change: Identifiers, Usage Data, Diagnostics) and the privacy policy.
7. Test with AdMob **test ad unit IDs** first. Verify: no ad in levels 1–5, never after the Daily, spacing works, reward only after a completed rewarded ad, airplane mode never blocks play.

## Turning purchases on (RevenueCat or StoreKit)

You need: the Paid Apps agreement signed in App Store Connect, a **non-consumable** product with id `remove_ads`, and (for RevenueCat) a project + public iOS API key.

1. `npm i @revenuecat/purchases-capacitor@^9` (or a StoreKit 2 Capacitor plugin) and `npx cap sync ios`.
2. Create `src/services/revenuecatIap.ts` implementing `IapProvider`:
   - `purchase()` returns `{ status: 'purchased', entitlement }` **only** when the SDK reports the `remove_ads` entitlement active, with the store `transactionId`.
   - Map user cancel → `'cancelled'`, Ask-to-Buy/deferred → `'pending'`, errors → `'failed'`.
   - `restore()` returns active entitlements from the SDK.
3. Pass it to `new Purchases(...)` in `src/main.ts`. The Settings screen then shows **Remove ads** and **Restore purchases** with cancel/pending/error messages.
4. Test in the App Store sandbox: buy, cancel, pending (Ask to Buy), restore on a second device, delete and reinstall then restore.

Kids: if you ever target children (Apple Kids Category), third-party ad and analytics SDKs are heavily restricted — keep the app in the general audience (see `docs/store/listing.md`).
