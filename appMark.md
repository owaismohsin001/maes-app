# appMark — Problems & Passed Tests Log

Running log for MaesApp. Newest entries on top. No client data, tokens or passwords here.

## Test device

Connected over USB via adb, read on 2026-10-22.

| Property | Value |
| -------- | ----- |
| Type | Handheld PDA with built-in scanner (client's device) |
| Manufacturer / brand | alps / alps |
| Model | PDA |
| Device / product | d605_62_hd_v1_572 / full_d605_62_hd_v1_572 |
| adb serial | 412D…9646 (masked) |
| Android | 12 (API 31), build SP1A.210812.016 release-keys |
| Security patch | 2022-02-05 |
| CPU ABI | arm64-v8a |
| Screen | 720x1440, density 320 (xhdpi) |
| MaesApp installed | Yes (`com.maesapp`) |

## Modified files

Files changed after the project was set up (2026-10-22 04:47). Times are the files' last-modified times.

| Date / time | File | What changed / why |
| ----------- | ---- | ------------------ |
| 2026-11-12 | `src/api/appControl.ts`, `src/control/device.ts`, `src/control/useAppControl.ts`, `src/screens/LockScreen.tsx`, `src/native/NativeMaesDevice.ts`, `android/app/src/main/java/com/maesapp/device/MaesDeviceModule.kt` + `MaesDevicePackage.kt` (new); `App.tsx`, `OdooWebViewScreen.tsx`, `useHandheldScanner.ts`, `src/brand/*` (`controlOrigin`, new `servers.ts`), `AndroidManifest.xml`, `Info.plist`, `src/i18n/index.ts`, `jest.setup.js`, tests, `build.gradle`/`config.ts` (1.7 / versionCode 8) | **v1.7 — app control** (user: *"remotely disable krny ka system, and location restriction … app sirf ek hi jgh use ho sky … remotely disable bhi kr sky admin odoo se"*). The app asks MAES's Odoo (`POST /maes_app/check`, odoo19Module §P450) on start, on resume and every 60 s: the handheld must be allowed by an admin (Inventory › Configuration › Scan app), the app switched on, and the device at the allowed place (GPS radius around HQ Lokeren OR the office Wi-Fi's internet address). Anything else covers Odoo with a lock screen (reason, device code, Allow location / Open settings / Try again) and mutes the scanner. Offline: the last 'allowed' holds for the server's grace (10 min). Castillo Scan asks the same server (Odoo Online can't run the module). jest 102/102 (both brands), tsc 0, eslint 0 |
| 2026-11-10 | `android/app/src/main/java/com/maesapp/scanner/KeyTyper.kt` (new), `MaesScannerModule.kt` (`typeText`), `src/native/NativeMaesScanner.ts`, `src/scanner/useHandheldScanner.ts` (new), `src/screens/OdooWebViewScreen.tsx`, `src/utils/odooBarcodeScript.ts`, `jest.setup.js`, tests, `build.gradle`/`config.ts` (1.6 / versionCode 7); deleted `ScannerOverlay.tsx`, `BarcodeScannerScreen.tsx`, `ScannerStatusScreen.tsx`, `useLiveScanning.ts`, `useScanLog.ts` | **v1.6 — the app is just the Odoo WebView + the CM60 scanner** (user: "the app should be just a webview, the scanner should read from the cm60"). Side button → one CM60 read (SDK, 1.5 fixes kept) → beep → the code is typed into the WebView as REAL Android key events + Enter (`KeyTyper`, `WebView.dispatchKeyEvent`), like a keyboard-wedge scanner; Odoo's own listener takes it (on Android its hidden `o-barcode-input`). `odooBarcodeScript` only as fallback when no key events can be sent. Nothing covers Odoo any more: no scanner screen, no status screen, no scanner page script (Odoo's own scan buttons stay Odoo's). |
| 2026-11-05 | `android/app/src/main/java/com/maesapp/scanner/ScanText.kt` (new), `ScannerEngine.kt`, `src/components/ScannerOverlay.tsx`, `src/i18n/index.ts`, `__tests__/Scanner.test.tsx`, `src/brand/index.ts`, `build.gradle`, `src/config.ts` | Scanner fixes received from the office tester over the upload drop (patch vs 354c0ad, 15:03 UTC): `ScanText.clean` strips the CM60 engine's 128-byte result header (symbology id, 0xFF ×4, corner points, read time) that turned every code into junk (`]E0ÿÿÿÿ…`), 0xFF padding, control chars and leading symbology ids; no continuous reading — one scan-button press = one read (`CONTINUOUS_READING = false`); MAES brand now points at the LIVE server (handheld rollout Nov03/04); v1.5 / versionCode 6. Encoding glitches of the uploaded files fixed (BOM, mojibake); the version test reads `APP_VERSION` |
| 2026-11-05 | `src/assets/images/castillo_logo.png`, `castillo_logo_mark.png` (new), `android/app/src/castillo/res/mipmap-*` (new), `src/brand/types.ts` (`BrandLogo`), `src/brand/index.ts`, `src/brand/castillo.ts`, `src/assets/logo.ts`, tests | The logo comes from the brand: `BRAND.logo` (full / withoutRing / mark + ring geometry) feeds `src/assets/logo.ts`, so splash, `LogoSpinner`, home screen draw the brand's logo; the `castillo` flavor has its own launcher icons (diamond). Castillo assets = 4× upscale of the client's 259×300 image (ask for a vector/high-res original) |
| 2026-11-05 | `src/brand/` (new: `types.ts`, `index.ts` = MAES, `castillo.ts`), `src/config.ts`, `metro.config.js`, `jest.config.js`, `android/app/build.gradle`, `strings.xml`, `scripts/build-apk.sh` (new), `__tests__/brand.test.ts` (new), `ScannerStatusScreen.tsx`, `SplashScreen.tsx`, `i18n` | One app per customer (brand) from one source tree: `APP_BRAND` picks the brand file at bundle time, the Android flavor of the same name the `applicationId`/launcher name; `build.gradle` refuses a mismatch, the build script checks the bundled host. First second brand: Castillo Valère (`castillo-valere.odoo.com`, app "Castillo Scan", `com.castillovalere.scan`) |
| 2026-10-26 | `src/api/` (new: `odoo.ts`, `barcode.ts`) | Odoo JSON-RPC client using the WebView's session; typed calls to Odoo's Barcode routes (`/stock_barcode/*`, `call_kw`) |
| 2026-10-26 | `src/barcode/` (new: `picking.ts`, `count.ts`, `useSyncedEdits.ts`) | Transfer and count models (scan → line, ORM commands like Odoo's Barcode app); background saving that keeps scans made during a save |
| 2026-10-26 | `src/navigation/`, `src/screens/barcode/` (new) | Native Barcode screens: menu, operations, transfers, transfer (scan/serial/location/validate/backorder), count, product stock |
| 2026-10-26 | `src/ui/` (new), `.claude/skills/maes-ui/` (new) | Design system (MAES white/black/gold tokens, components, Sheet, ScanBar, icons) and its skill |
| 2026-10-26 | `src/components/ScannerOverlay.tsx`, `src/screens/OdooWebViewScreen.tsx` | Overlay shows the native screens instead of relaying reads into Odoo's Barcode app; "Open in Odoo" and sign-in hand back to the WebView. `BarcodeScannerScreen.tsx` and `useScanLog.ts` are no longer used |
| 2026-10-26 | `src/i18n/index.ts` | ~130 new strings, English + Dutch |
| 2026-10-26 | `package.json`, `jest.setup.js` | `react-native-svg` 15.16.0 (icons) + its Jest mock |
| 2026-10-26 | `__tests__/` | New: `barcodeApi`, `barcodePicking`, `barcodeCount`, `useSyncedEdits`; `Scanner.test.tsx` rewritten for the native flow |
| 2026-10-26 | `.claude/memory/`, `.claude/rules/`, `.claude/CLAUDE.md` | Backend review (`odoo-module-review.md`), scan-module study (`odoo-scan-modules.md`), decisions, rules |
| 2026-10-22 17:07 | `appMark.md` | Test-device info, the problems and passed tests below, and this list |
| 2026-10-22 16:54 | `src/scanner/useScanner.ts` | Changed while debugging the WebView "spinning M" hang: early scanner power-up on mount (the `useEffect` that calls `prepare()`) was switched off to rule it out, then put back. The hang was not caused by it. Current file: early power-up is on |
| 2026-10-22 16:54 | `src/scanner/useLiveScanning.ts` | Saved in the same debugging step as `useScanner.ts` (live reading on the scanner screen). No lasting behaviour change recorded |
| 2026-10-22 15:30 | `package-lock.json` | Rewritten by `npm install`; `package.json` itself unchanged |

Not project files: `../MaesApp.zip` (project zip without `node_modules` and Android build output), created 2026-10-22.

## Problems

| Date | Area | Problem | Cause | Status / Fix |
| ---- | ---- | ------- | ----- | ------------ |
| 2026-11-03 | Scanner / Barcode | Office handheld: "keeps on scanning… does not add" (Mathias, videos). | The decoder's length included the C string terminator → `1353135\x00` → Odoo HTTP 500 on every scan; the native overlay re-armed the laser 250 ms after each read. Deeper: the native Barcode screens re-implemented Odoo's Barcode app and drifted. | Fixed (v1.4): native screens deleted, reads relayed into Odoo's own Barcode page and held until Odoo answered; `decodeText` strips control characters; the reference lookup now lives on the Odoo server (§P418). Server guard for the NUL on both Odoo boxes since Nov03 21:24 UTC. |
| 2026-10-22 | Scanner screen layout | In landscape (handheld rotates, ~360dp tall) the "Recent scans" list on the scanner screen gets zero height and the screen doesn't scroll: reads and Odoo's answers can't be seen. | `BarcodeScannerScreen`: header + 195dp indicator area leave no room for the `flex: 1` FlatList; no ScrollView/landscape layout. | Open: lock to portrait, or a compact landscape layout |
| 2026-10-22 | WebView (handheld test) | After a cold start the app shows a spinning "M" forever (first reported as "scanner stuck loading"). No crash, no JS error. | Not the scanner: it is the WebView's own `renderLoading` view (`OdooWebViewScreen`, `live=false`). Android never starts the WebView renderer process: `dumpsys activity services com.maesapp` shows `Pending ServiceRecord … SandboxedProcessService1:0, app=null`, and there's no `am_proc_start` for it. Reproduced on 3 cold starts (after `am force-stop`); a JS reload doesn't help; it also happens with the scanner's early power-up disabled. The working launch at 16:26 used `SandboxedProcessService0`. WebView 155.0.8059.43, enough free RAM. | Worked around 2026-10-22 17:00: `adb reboot` → renderer starts again (`SandboxedProcessService0`), Odoo home loads. Root cause in Android/WebView unknown; if it comes back without a force-stop, add an app-side watchdog/recovery |
| 2026-10-22 | Config | Debug build points at the LIVE Odoo server (`src/config.ts` `ODOO_ORIGIN`), against the CLAUDE.md rule. | Config value | Open: flagged, not changed. **2026-10-26: more urgent** — the native Barcode screens now validate transfers and apply counts on that server |
| 2026-10-26 | Native Barcode screens (review) | Review found: destination scan after a save did nothing; scans during validate could change a done transfer; queued scans used stale state; double back could crash; a refused save blocked all later saves; same new lot twice made two quants; Apply missed last scans | Race conditions / model gaps | Fixed 2026-10-26, regression tests added |
| 2026-10-26 | `./gradlew` | `Permission denied` | File has no execute bit (mode 666) | Run as `bash ./gradlew …` (not changed) |

## Passed tests

| Date | Test / Check | Command | Result |
| ---- | ------------ | ------- | ------ |
| 2026-11-10 | v1.6: typecheck, lint, 65 Jest tests (maes) + 65 (castillo); Kotlin compiles (both flavors). Browser check on the TEST box (Odoo 19, Android-Chrome UA = Odoo's hidden-input path): real key presses + Enter into `/odoo/barcode` → unknown code gives Odoo's warning, `001/000180` opens the product | `npx tsc --noEmit`, `npx eslint .`, `npx jest`, `APP_BRAND=castillo npx jest`, `scripts/build-apk.sh maes|castillo`, Playwright (Pixel 7 profile) | Pass — the WebView key path itself still to be confirmed on the handheld |
| 2026-11-05 | Scanner-fix patch applied: typecheck, lint, 82 Jest tests (maes) + 82 (castillo) incl. the rewritten relay tests | `npx tsc --noEmit`, `npx eslint .`, `npx jest`, `APP_BRAND=castillo npx jest` | Pass |
| 2026-11-05 | Brands: typecheck, lint, 82 Jest tests for the MAES build and again for the Castillo build (`APP_BRAND=castillo`, incl. `brand.test.ts`: config exposes the brand under test); Castillo server checked over JSON-RPC (Odoo 19.0+e SaaS, login OK, `stock_barcode` installed) | `npx tsc --noEmit`, `npx eslint .`, `npx jest`, `APP_BRAND=castillo npx jest` | Pass |
| 2026-10-26 | Typecheck, lint (0 warnings), 103 Jest tests incl. native transfer scan end-to-end with a mocked Odoo | `npx tsc --noEmit`, `npm run lint`, `npm test` | Pass |
| 2026-10-26 | Native Android debug build with `react-native-svg` | `bash ./gradlew assembleDebug` | Pass |
| 2026-10-26 | Phone test (vivo V2520, Android 16, no built-in scanner), **read-only on LIVE**: splash → Odoo → native Barcode menu; the WebView's login reaches the native screens (user name shown); Operations with live counts; Receipts list + Ready/All open filter; Android back; manual code entry with an unknown code (error toast); product search; product stock; lookup by internal reference (lowercase too); Count screen loads; status screen says "no built-in scanner"; ScanBar shows "type codes" | `adb install` + `adb shell input` + screencap | Pass. Not tested on purpose (they write to live): opening a transfer, scanning into it, validate, count apply, new transfer |
| 2026-10-26 | Found on the phone: product search field didn't focus by itself | — | Fixed (autofocus) |
| 2026-10-22 | Handheld step 2: Barcode app opens the scanner screen, "Ready", live reading; 4 reads decoded and passed to the app | screencap + `logcat --pid` (ScanJni `decodeIsOk:1` → `after java callback`) | Pass |
| 2026-10-22 | Handheld step 1: app launches, splash, Odoo home page (logged in), no crash | `adb shell am start -n com.maesapp/.MainActivity` + screencap/logcat | Pass |
