---
paths:
  - "src/**/*[Ss]can*"
  - "src/**/*[Ss]can*/**"
  - "src/**/*[Cc]amera*"
  - "src/**/*[Bb]arcode*"
---

# Barcode / QR / document scanning

- **Decided (2026-10-21):** scanning uses the client's handheld's built-in scan engine through `android/libscan` (vendor Java, Newland "host decode" SDK) and the app-local TurboModule `MaesScanner` (`src/native/NativeMaesScanner.ts` → `android/app/src/main/java/com/maesapp/scanner/`). JS uses it only through `src/scanner/` (`useScanner`, `scanner.ts`). Don't add VisionCamera/ML Kit for this; see `.claude/memory/decisions.md`.
- Don't edit the vendor classes in `android/libscan` (`SoftEngine` says so itself). Behaviour changes go in `ScannerEngine.kt`, which mirrors the vendor app on the device (`com.hc.scancm60`): every SDK call on its one thread, scan service `com.hc.hckeyboardhelper` switched off before opening, `Close()` on pause. The native decoder `.so` exists only on the handheld; elsewhere the status must say `unavailable`, never crash.
- Reads go to Odoo's page as REAL Android key events + Enter (`NativeMaesScanner.typeText` → `KeyTyper.kt`, `WebView.dispatchKeyEvent`), like a keyboard-wedge scanner: Odoo 19's own `barcodes/static/src/barcode_service.js` takes them (Android Chrome: hidden `input.o-barcode-input` focused on the first key; a focused field gets the code typed in). `odooBarcodeScript` (simulated JS events) is only the fallback when `typeText` returns false.
- App control (v1.7, 2026-11-12): while `useAppControl` is not 'allowed' the lock screen covers Odoo and `useHandheldScanner(deliver, enabled=false)` drops every read (no beep, nothing typed into the hidden page). Keep that gate when touching the scanner.
- Flow (decided with the user, v1.6 2026-11-10): **the app is just the Odoo WebView + the CM60 scanner.** No floating button, no screen over Odoo (no scanner screen, no status screen, no native Barcode screens — never re-add them), no scanner page script. One press of the side button = one read (`useHandheldScanner` → `useScanner`), beep via `feedback()`, then typed into the page. Odoo's own scan buttons keep Odoo's behaviour.
- Native scan routing mirrors `stock_barcode`'s JS models (`barcode_picking_model.js`, `barcode_quant_model.js`); `src/barcode/picking.ts` / `count.ts` say which part. UI rules: `.claude/skills/maes-ui`.
- Debugging on the client's device happens through the scanner status screen ("Status" on the scanner screen): keep every new failure mode visible there, since we can't attach adb to that device.
- Only if a phone-camera scanner is ever needed as well (state of the art Oct 2026): **VisionCamera v5** (Nitro-based) + `react-native-vision-camera-barcode-scanner` (ML Kit; peers `react-native-nitro-modules`, `react-native-nitro-image`). v5 is a hard break from v4 — `useCodeScanner`, the `codeScanner` prop and `codeTypes` no longer exist. The camera bullets below apply to that case.
- Camera runs only while visible: `isActive` = screen focused (`useIsFocused`) **and** `AppState` is `active`. Never leave it running in the background.
- Restrict barcode formats to what MAES labels actually use (confirm with the user; likely EAN-13, Code 128, QR). Scanning every format is slow and causes misreads.
- The scan callback fires on almost every frame (~30×/s). Accept the first code, then pause (`isActive={false}`) or de-duplicate by value + timestamp in a `ref` (not state). Give clear feedback (vibration/sound + visual) when a code is accepted.
- Lookup order for a scanned product code: `barcode` exact → `default_code` exact → manual search. Only ~18% of products have a barcode, so a "not found" must offer manual search, never a dead end.
- Always offer manual code entry and a torch toggle (dark plant rooms, damaged labels).
- Permissions: request camera permission in context (on the scan screen, not at app start). If permanently denied, explain why and link to `Linking.openSettings()`. Needs `android.permission.CAMERA` in the manifest and `NSCameraUsageDescription` in `Info.plist`.
- Frame processors: always `frame.dispose()`. Still images / document photos: use the scanner's image API (`scanCodesInImageAsync`) rather than a live preview.
- A second ML Kit-based library (OCR, document scanner) can cause "duplicate class com.google.mlkit" build errors — check before adding one.
