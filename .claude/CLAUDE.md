# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

MaesApp is an internal React Native app for MAES Security staff (Belgian installer of alarm, camera, fire and gas systems). Its main job: scan product barcodes/QR codes and documents, then look them up / act on them in the company's **Odoo 19 Enterprise** backend. Users are internal Odoo users (~18), never customers.

**Status (2026-10-26):** the app shows the Odoo web client in a WebView (`src/screens/OdooWebViewScreen.tsx`) behind a JS splash. When Odoo's Barcode app opens, the app's own **native Barcode screens** cover it (`src/navigation/BarcodeNavigator.tsx`, `src/screens/barcode/`): operations, transfers (scan, serials, locations, validate, backorder), inventory count, product stock — talking to Odoo through `src/api/` with the WebView's session. Scanning uses the client's handheld's built-in scanner (`android/libscan` + TurboModule `MaesScanner`, `src/scanner/`). UI is built from `src/ui/` (skill `/maes-ui`). Open scope questions (documents, offline, technicians) — check `.claude/memory/decisions.md` and ask before assuming.

## Commands

Run everything from this folder (`MaesApp/`). npm only (`package-lock.json`); Node >= 22.11.

```sh
npm start                         # Metro — keep it running in its own terminal
npm run android                   # build + install the debug app on emulator/device
npm run lint                      # eslint . (@react-native config)
npx tsc --noEmit                  # typecheck — there is no npm script for it
npm test                          # jest (@react-native/jest-preset)
npx jest __tests__/App.test.tsx   # one test file
npx jest -t "renders correctly"   # one test by name
```

- Emulator on this machine: AVD `Pixel_9` (`~/Android/Sdk/emulator/emulator -avd Pixel_9`). JDK 21, SDK in `~/Android/Sdk`.
- Native build only: `cd android && ./gradlew assembleDebug`. After Gradle/cache weirdness: `./gradlew clean`, then `npm start -- --reset-cache`.
- USB device: `adb reverse tcp:8081 tcp:8081` so it can reach Metro.
- iOS cannot be built on this Linux machine. On a Mac: `bundle install && bundle exec pod install`, then `npm run ios`.
- Project skills: `/check` (typecheck + lint + tests), `/run-android`, `/add-native-lib`, `/odoo-api-contract`, `/release-apk`, `/maes-ui` (design system for native screens).

## How the project is wired

- `index.js` registers `App` (`App.tsx`) under the name in `app.json` (`MaesApp`). Native code hard-codes the same name (`MainActivity.kt` `getMainComponentName`, `ios/MaesApp/SceneDelegate.swift` `withModuleName`) — rename all three together.
- **New Architecture is the only runtime** (since RN 0.82 it can't be switched off) and Hermes is on. Every native dependency must support the New Architecture — use `/add-native-lib`.
- `edgeToEdgeEnabled=true`: the app draws under the system bars, so screens must apply `react-native-safe-area-context` insets (the root is already wrapped in `SafeAreaProvider`).
- Native modules autolink. Adding/removing one needs a full rebuild (`npm run android`), not a Metro reload.
- Android: `applicationId com.maesapp`, minSdk 24 / target 36 / compile 37. Release builds are still signed with the **debug** keystore (template default). The manifest requests `INTERNET`, `CAMERA` and `VIBRATE` (the handheld's scan engine is a camera module) and declares `<queries>` for the handheld's scan service; cleartext HTTP works in debug builds only. `android/libscan` is a Gradle library module (vendor scanner SDK).
- Formatting is Prettier (single quotes, trailing commas, `arrowParens: avoid`). A hook runs prettier + `eslint --fix` on every file Claude edits.

## Backend: Odoo 19

- **Test box — use this:** `https://testing.maes-security.com` (13.60.79.10).
- **`16.16.235.235` is LIVE production** — the client's team works on it all day. Never point dev builds, tests or scripts at it (shell access to it is denied in settings).
- The backend is a separate repo on the server (`/opt/odoo19/custom-addons/odoo19Module`) with its own CLAUDE.md and strict deploy rules. Don't change it from here: specify what the app needs with `/odoo-api-contract`; investigate with the `odoo-explorer` agent.
- The existing `/api/*` controllers there (`product_api`, `customer_api`, `auth_api` email-OTP, `buy_request_api`) serve the public website / customer portal, not staff. Don't build the app on them — `/api/customers/<id>` is `auth='public'` + `sudo()` and returns `security_system_password`.
- Only ~872 of 4,702 products have a `barcode`; nearly all have `default_code`. Every scan lookup needs a `default_code` fallback and a manual search.
- More: `.claude/memory/odoo-backend.md`.

## Non-negotiable rules

- **No client data or secrets in git — contractual with the client.** No real customer names, addresses, serials or alarm codes in code, fixtures, mocks or screenshots; no tokens or passwords in source. `*.pem`, keystores and `.env*` are gitignored and Claude is denied reading them.
- UI text: English source strings with Dutch (`nl`) translations — same convention as the Odoo backend.
- Auth tokens live only in the OS secure store (Android Keystore / iOS Keychain) — never in AsyncStorage/MMKV, logs or crash reports.

## Where the rest lives

- `.claude/rules/` — path-scoped rules that load when matching files are touched (RN code, scanner, Odoo API code, Android, iOS, tests).
- `.claude/memory/` — committed project knowledge (decisions log, backend facts). Read the relevant file before working in that area; append to `decisions.md` when a decision is made.
- `.claude/agents/` — `rn-reviewer` (review after changes), `odoo-explorer` (read-only backend facts), `android-build-doctor` (build/run failures).
- `.mcp.json` (repo root) — MCP servers: `mobile` (mobile-mcp: Android emulator screenshots, taps, logs) and `context7` (up-to-date library docs).
- `CLAUDE.local.md` (repo root, gitignored) — personal notes such as SSH access.
