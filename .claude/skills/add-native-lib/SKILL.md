---
name: add-native-lib
description: Safely add an npm library to MaesApp — especially one with native code (camera/scanner, secure storage, navigation, file pickers). Checks New Architecture support and maintenance, installs it, wires Android/iOS config and Jest mocks, and records the decision. Use whenever a new dependency is about to be installed.
argument-hint: "<npm-package> [purpose]"
---

Adding `$ARGUMENTS`.

1. **Already decided?** Read `.claude/memory/decisions.md`. If a library is already chosen for this purpose, use it, or ask before introducing a second one.
2. **Vet it** and show the user a 3–4 line summary before installing:
   - `npm view <pkg> version peerDependencies time.modified repository.url` — recent release, peer range includes `react-native@0.88` / `react@19`.
   - New Architecture support: the library's README/changelog, and https://reactnative.directory/?search=<pkg> ("New Architecture" badge). The app has `newArchEnabled=true` — an old-architecture-only library is a no-go.
   - Pure-JS libraries skip the native steps below.
3. **Install** (asks for permission by design): `npm install <pkg>`. Don't use yarn or `--legacy-peer-deps` without saying why.
4. **Native wiring**, following the library's own install docs for bare React Native (not Expo):
   - Android: `<uses-permission>` in `android/app/src/main/AndroidManifest.xml`, any `gradle.properties` flag, Proguard rules if documented.
   - iOS: `NS…UsageDescription` in `ios/MaesApp/Info.plist`, `PrivacyInfo.xcprivacy` entries if documented. Note in the summary that `bundle exec pod install` must be run on a Mac.
   - Runtime permission request in JS for anything permission-gated.
5. **Jest**: if it has native code, add a mock to the shared Jest setup file (create `jest.setup.js` and reference it via `setupFiles` in `jest.config.js` if missing). Prefer the mock the library ships, if any.
6. **Verify**: `/check`, then `/run-android` (a native library needs a full rebuild).
7. **Record**: append a line to "Decided" in `.claude/memory/decisions.md` — date, library + version, purpose, why this one.
