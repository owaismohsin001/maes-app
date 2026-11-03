---
paths:
  - "android/**"
---

# Android native project

- Kotlin (`MainActivity.kt`, `MainApplication.kt`), namespace/applicationId `com.maesapp`. SDK levels and AGP/Kotlin/NDK versions are set in `android/build.gradle` — don't bump them without asking; RN 0.88 expects these.
- The New Architecture is the only runtime since RN 0.82 (`newArchEnabled=false` is ignored); keep `hermesEnabled=true`. Library-specific flags (e.g. a camera library's code-scanner switch) also go in `gradle.properties`, with a comment naming the library.
- Every permission needs **both** the `<uses-permission>` in `AndroidManifest.xml` **and** a runtime request in JS. Add the matching `NS…UsageDescription` to `ios/MaesApp/Info.plist` in the same change.
- Signing: never commit a release keystore or its passwords. Passwords go in `~/.gradle/gradle.properties` (outside the repo); see `/release-apk`.
- `usesCleartextTraffic` is a manifest placeholder: HTTP is allowed in debug only. The app must talk to Odoo over HTTPS.
- Any change here needs a rebuild (`npm run android`) to verify — a Metro reload doesn't pick it up. Build failures → `android-build-doctor` agent.
