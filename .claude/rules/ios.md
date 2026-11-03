---
paths:
  - "ios/**"
  - "Gemfile"
---

# iOS native project

- iOS **cannot be built or run on this Linux machine**. Never claim an iOS change is verified; say it needs a Mac (`bundle install && bundle exec pod install && npm run ios`).
- The RN module name is hard-coded in `ios/MaesApp/SceneDelegate.swift` (`withModuleName: "MaesApp"`) — keep it in sync with `app.json` and `MainActivity.kt`.
- Keep iOS in step with Android: every permission the app requests needs an `NS…UsageDescription` in `ios/MaesApp/Info.plist` (e.g. `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`), written in English with a Dutch `InfoPlist.strings` localisation once i18n exists.
- New native libraries may need entries in `ios/MaesApp/PrivacyInfo.xcprivacy` (required-reason APIs such as `UserDefaults`, file timestamps) — check the library's docs.
- `Podfile` / `Podfile.lock` change only via `pod install` on a Mac; don't hand-edit `Pods/` or `project.pbxproj` unless there is no other way.
