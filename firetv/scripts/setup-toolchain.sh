#!/usr/bin/env bash
# One-time: installs what's needed to build the APK and talk to the Fire Sticks, into
# ~/.pullboard-toolchain (nothing system-wide, no Homebrew, no admin password).
#   JDK 17 (Temurin) · Gradle 8.11.1 · Android cmdline-tools, platform 35, build-tools, platform-tools (adb)
set -euo pipefail
T="$HOME/.pullboard-toolchain"
mkdir -p "$T" && cd "$T"
ARCH=$(uname -m); [ "$ARCH" = "arm64" ] && JARCH=aarch64 || JARCH=x64

if [ ! -d jdk ]; then
  echo "→ JDK 17"
  curl -fL "https://api.adoptium.net/v3/binary/latest/17/ga/mac/$JARCH/jdk/hotspot/normal/eclipse" -o jdk.tar.gz
  mkdir jdk && tar -xzf jdk.tar.gz -C jdk --strip-components=1 && rm jdk.tar.gz
fi
export JAVA_HOME="$T/jdk/Contents/Home"

if [ ! -d gradle ]; then
  echo "→ Gradle"
  curl -fL https://services.gradle.org/distributions/gradle-8.11.1-bin.zip -o gradle.zip
  unzip -q gradle.zip && mv gradle-8.11.1 gradle && rm gradle.zip
fi

if [ ! -d android-sdk/cmdline-tools/latest ]; then
  echo "→ Android command-line tools"
  curl -fL https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip -o cmdline.zip
  mkdir -p android-sdk/cmdline-tools && unzip -q cmdline.zip -d android-sdk/cmdline-tools
  mv android-sdk/cmdline-tools/cmdline-tools android-sdk/cmdline-tools/latest && rm cmdline.zip
fi
SDKM="$T/android-sdk/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDKM" --sdk_root="$T/android-sdk" --licenses >/dev/null || true
"$SDKM" --sdk_root="$T/android-sdk" "platform-tools" "platforms;android-35" "build-tools;35.0.0"

echo
echo "Done. adb is at: $T/android-sdk/platform-tools/adb"
