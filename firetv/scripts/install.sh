#!/usr/bin/env bash
# Install onto a Fire Stick over Wi-Fi and allow auto-start on boot.
#   ./scripts/install.sh <stick IP> front|back
set -euo pipefail
IP="${1:?usage: install.sh <stick ip> front|back}"; SCREEN="${2:?front or back}"
ADB="$HOME/.pullboard-toolchain/android-sdk/platform-tools/adb"
cd "$(dirname "$0")/.."
"$ADB" connect "$IP:5555"
echo "If the TV shows 'Allow USB debugging?', pick 'Always allow from this computer' and OK."
"$ADB" -s "$IP:5555" wait-for-device
"$ADB" -s "$IP:5555" install -r "dist/pullboard-$SCREEN.apk"
# Needed so the board can open itself after a power cut (Android 10+ rule).
"$ADB" -s "$IP:5555" shell appops set com.slowride.pullboard SYSTEM_ALERT_WINDOW allow
"$ADB" -s "$IP:5555" shell am start -n com.slowride.pullboard/.MainActivity
echo "Installed $SCREEN board on $IP."
