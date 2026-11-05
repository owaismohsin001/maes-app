#!/bin/bash
# Build one customer's release APK:  scripts/build-apk.sh <brand>   (maes | castillo)
#
# The brand picks the Odoo server (src/brand/<brand>.ts, through APP_BRAND at
# bundle time) and the Android flavor (applicationId + launcher name). Output:
# $APK_DIR/<AppName>-<version>.apk, with the bundled server host checked.
set -u
BRAND="${1:-maes}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK_DIR="${APK_DIR:-$HOME/maes-app-apk}"
[ -f "$ROOT/src/brand/$BRAND.ts" ] || [ "$BRAND" = maes ] || { echo "no brand '$BRAND' (src/brand/$BRAND.ts)"; exit 2; }
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export APP_BRAND="$BRAND"
FLAVOR="$(echo "${BRAND:0:1}" | tr a-z A-Z)${BRAND:1}"
VERSION="$(sed -n 's/^ *versionName "\(.*\)"/\1/p' "$ROOT/android/app/build.gradle")"
BRAND_FILE="$ROOT/src/brand/index.ts"; [ "$BRAND" = maes ] || BRAND_FILE="$ROOT/src/brand/$BRAND.ts"
APP_NAME="$(sed -n "s/^ *appName: '\(.*\)',/\1/p" "$BRAND_FILE" | tr -d ' ')"
HOST="$(sed -n "s#^ *odooOrigin: *\(ODOO_[A-Z_]*\|'https\?://\([^/']*\)'\),.*#\2#p" "$BRAND_FILE")"
cd "$ROOT/android" || exit 1
bash ./gradlew "assemble${FLAVOR}Release" --no-daemon
rc=$?
if [ $rc -eq 0 ]; then
  APK="$ROOT/android/app/build/outputs/apk/$BRAND/release/app-$BRAND-release.apk"
  OUT="$APK_DIR/${APP_NAME:-App}-$VERSION.apk"
  mkdir -p "$APK_DIR" && cp "$APK" "$OUT" && ls -la "$OUT"
  # The JS bundle must carry this brand's server (guards against a stale bundle).
  if [ -n "$HOST" ]; then
    if unzip -p "$OUT" assets/index.android.bundle | grep -a -q "$HOST"; then
      echo "bundle check OK: $HOST"
    else
      echo "bundle check FAILED: $HOST not in the JS bundle"; rc=3
    fi
  fi
fi
echo "DONE rc=$rc"
exit $rc
