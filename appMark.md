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
| 2026-10-26 | Typecheck, lint (0 warnings), 103 Jest tests incl. native transfer scan end-to-end with a mocked Odoo | `npx tsc --noEmit`, `npm run lint`, `npm test` | Pass |
| 2026-10-26 | Native Android debug build with `react-native-svg` | `bash ./gradlew assembleDebug` | Pass |
| 2026-10-26 | Phone test (vivo V2520, Android 16, no built-in scanner), **read-only on LIVE**: splash → Odoo → native Barcode menu; the WebView's login reaches the native screens (user name shown); Operations with live counts; Receipts list + Ready/All open filter; Android back; manual code entry with an unknown code (error toast); product search; product stock; lookup by internal reference (lowercase too); Count screen loads; status screen says "no built-in scanner"; ScanBar shows "type codes" | `adb install` + `adb shell input` + screencap | Pass. Not tested on purpose (they write to live): opening a transfer, scanning into it, validate, count apply, new transfer |
| 2026-10-26 | Found on the phone: product search field didn't focus by itself | — | Fixed (autofocus) |
| 2026-10-22 | Handheld step 2: Barcode app opens the scanner screen, "Ready", live reading; 4 reads decoded and passed to the app | screencap + `logcat --pid` (ScanJni `decodeIsOk:1` → `after java callback`) | Pass |
| 2026-10-22 | Handheld step 1: app launches, splash, Odoo home page (logged in), no crash | `adb shell am start -n com.maesapp/.MainActivity` + screencap/logcat | Pass |
