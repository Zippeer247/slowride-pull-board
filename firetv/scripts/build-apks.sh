#!/usr/bin/env bash
# Build the two APKs (front + back) pointing at the deployed board.
#   ./scripts/build-apks.sh https://<app>.vercel.app <DISPLAY_KEY>
set -euo pipefail
URL="${1:?usage: build-apks.sh <board base url> <display key>}"
KEY="${2:-}"
T="$HOME/.pullboard-toolchain"
export JAVA_HOME="$T/jdk/Contents/Home"
export ANDROID_HOME="$T/android-sdk"
cd "$(dirname "$0")/.."
"$T/gradle/bin/gradle" --no-daemon -q assembleFrontDebug assembleBackDebug -PboardBaseUrl="$URL" -PdisplayKey="$KEY"
mkdir -p dist
cp app/build/outputs/apk/front/debug/app-front-debug.apk dist/pullboard-front.apk
cp app/build/outputs/apk/back/debug/app-back-debug.apk dist/pullboard-back.apk
ls -lh dist
