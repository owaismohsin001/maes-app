---
name: release-apk
description: Build a signed release APK/AAB of MaesApp for internal distribution.
argument-hint: "[apk|aab]"
disable-model-invocation: true
---

Build a release of MaesApp. Default output is an APK (internal sideload / MDM); pass `aab` for a Play Store bundle.

1. **Signing precondition.** Open `android/app/build.gradle`. If `buildTypes.release` still uses `signingConfigs.debug` (the template default), STOP and tell the user a real upload keystore is needed first. Guide them, but let them run the commands that involve passwords:
   - `keytool -genkeypair -v -storetype PKCS12 -keystore maesapp-upload.keystore -alias maesapp-upload -keyalg RSA -keysize 2048 -validity 10000` — keep the keystore **outside** the repo and back it up.
   - Put `MAESAPP_UPLOAD_STORE_FILE`, `MAESAPP_UPLOAD_KEY_ALIAS`, `MAESAPP_UPLOAD_STORE_PASSWORD`, `MAESAPP_UPLOAD_KEY_PASSWORD` in `~/.gradle/gradle.properties` (never in the repo).
   - Then add a `release` signing config that reads those properties, and switch `buildTypes.release` to it.
2. **Target backend.** Find which Odoo base URL the release build uses. If it is the live box, get the user's explicit go-ahead before continuing.
3. **Version.** Ask for (or propose) the new `versionName`, and increment `versionCode` in `android/app/build.gradle`.
4. **Quality gate.** Run `/check`; stop on failures.
5. **Build.**
   - APK: `scripts/build-apk.sh <brand>` (maes | castillo; sets `APP_BRAND`, runs `assemble<Brand>Release`, copies to `~/maes-app-apk/<AppName>-<version>.apk` and checks the bundled Odoo host) → `android/app/build/outputs/apk/<brand>/release/app-<brand>-release.apk`
   - AAB: `cd android && ./gradlew bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`
6. **Smoke test the APK.** `adb install -r <apk>`, launch it, and check `adb logcat -d -t 200 ReactNativeJS:V AndroidRuntime:E '*:S'` for crashes. Release builds have no Metro and no cleartext HTTP.
7. Report the file path, size, versionName/versionCode, the backend URL baked in, and anything not verified (iOS is not buildable here).
