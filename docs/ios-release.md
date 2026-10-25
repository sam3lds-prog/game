# Getting it onto your iPhone and into TestFlight

Everything below happens on your Mac. Budget an afternoon the first time.

## One-time setup
1. **Xcode** — install from the Mac App Store (large download). Open it once and accept the license.
2. **CocoaPods** — in Terminal: `brew install cocoapods` (or `sudo gem install cocoapods`).
3. **Node.js 20+** — from nodejs.org if `node -v` shows nothing or an older version.
4. **Apple Developer Program** ($99/year) — developer.apple.com/programs. Needed for TestFlight and the App Store (not for running on your own phone with a free account, but that build expires in 7 days).

## Build and run on your phone
```bash
git clone https://github.com/sam3lds-prog/game && cd game
npm ci
npm run ios:sync      # builds the web app, copies it into ios/, runs pod install
npm run ios:open      # opens Xcode
```
In Xcode:
1. Left sidebar → **App** (blue icon) → target **App** → **Signing & Capabilities** → pick your **Team**.
2. Bundle Identifier is `com.sam3lds.catsanddogs`. Change it now if you want something else — it can't change after the first upload (also change `appId` in `capacitor.config.ts`).
3. Plug in your iPhone (or pair over Wi-Fi), choose it at the top, press **Run** (▶). First time: on the phone, Settings → General → VPN & Device Management → trust your developer profile.
4. Walk through `docs/qa-matrix.md` on the device.

After any code change: `npm run ios:sync`, then Run again in Xcode.

## TestFlight
1. **App Store Connect** (appstoreconnect.apple.com) → Apps → **+** → New App: platform iOS, name, primary language, the bundle id above, any SKU.
2. Fill in **App Privacy** (answers in `docs/store/listing.md`), age rating, and a privacy policy URL (`public/privacy.html` hosted publicly).
3. In Xcode: set **Version** (e.g. 1.0) and **Build** (1, then 2, 3…) on the App target → General.
4. Choose **Any iOS Device (arm64)** at the top → **Product → Archive** → **Distribute App** → **App Store Connect** → Upload.
5. In App Store Connect → TestFlight: the build appears after processing (~15–30 min). Add yourself as an internal tester, install the **TestFlight** app on your phone, accept.
6. For outside testers (Sprint 7), create an external group; the first external build goes through a short Beta App Review.

## Before submitting to the App Store
- Final name, subtitle, description, keywords, screenshots (`docs/store/`).
- Support URL and privacy policy URL live.
- Every row in `docs/qa-matrix.md` checked on a real device.
- Ads/purchases: still off unless you completed `docs/monetization.md`.
