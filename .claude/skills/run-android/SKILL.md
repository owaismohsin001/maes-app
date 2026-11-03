---
name: run-android
description: Build, install and launch MaesApp on the Android emulator or a USB device, then confirm it is running with a screenshot and logs. Use when asked to run/start the app, or to verify a change in the real app rather than only in tests.
---

1. **Device.** `adb devices`.
   - Nothing listed → start the emulator in the background: `~/Android/Sdk/emulator/emulator -avd Pixel_9 -no-snapshot-save` (run it in the background), then wait until `adb wait-for-device shell getprop sys.boot_completed` prints `1` (poll every few seconds, give up after ~3 minutes).
   - A physical USB device → `adb reverse tcp:8081 tcp:8081`.
2. **Metro.** `curl -s http://localhost:8081/status`. If it doesn't print `packager-status:running`, start `npm start` in the background and re-check.
3. **Build + install.** `npm run android -- --no-packager`. If it fails, hand the full error to the `android-build-doctor` agent instead of guessing.
4. **Confirm it runs.**
   - `adb shell pidof com.maesapp` returns a PID.
   - Screenshot: `adb exec-out screencap -p > <scratchpad>/maesapp.png`, then read the image and describe what is on screen.
   - Logs: `adb logcat -d -t 200 ReactNativeJS:V ReactNative:V AndroidRuntime:E '*:S'` — report any red-box error or crash.
5. Report what you saw. Only say the change "works" if the screenshot or logs show it; otherwise say what is still unverified.

JS-only changes need a reload, not a rebuild: `adb shell input text "RR"` (or the dev menu via `adb shell input keyevent 82`). Native changes (new native lib, `android/` edits, permissions) need step 3 again.
