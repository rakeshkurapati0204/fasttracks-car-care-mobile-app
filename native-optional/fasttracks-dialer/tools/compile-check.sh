#!/bin/bash
# Compiles the dialer's Kotlin against the Android SDK on this Mac, so a syntax or type error shows up in a minute instead of after a 20 minute APK build.
# It covers every file except FasttracksDialerModule.kt (needs the Expo modules library). Nothing is run; this only checks that the code compiles.
set -e
cd "$(dirname "$0")"
GL=$(ls -d "$HOME"/.gradle/wrapper/dists/gradle-*-bin/*/gradle-*/lib 2>/dev/null | tail -1)
[ -n "$GL" ] || { echo "No Gradle distribution found under ~/.gradle."; exit 2; }
ANDROID_JAR=$(ls "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/platforms/android-*/android.jar 2>/dev/null | tail -1)
[ -n "$ANDROID_JAR" ] || { echo "No android.jar found (set ANDROID_HOME)."; exit 2; }
JAVA=${JAVA_HOME:+$JAVA_HOME/bin/java}; JAVA=${JAVA:-java}
OUT=$(mktemp -d)
CP=$(ls "$GL"/kotlin-compiler-embeddable-*.jar "$GL"/kotlin-stdlib-*.jar "$GL"/kotlin-script-runtime-*.jar "$GL"/kotlin-reflect-*.jar "$GL"/kotlin-daemon-embeddable-*.jar "$GL"/kotlinx-coroutines-core-jvm-*.jar "$GL"/annotations-*.jar 2>/dev/null | tr '\n' ':')
STD=$(ls "$GL"/kotlin-stdlib-*.jar | head -1)
SRC=../android/src/main/java/expo/modules/fasttracksdialer
FILES=$(ls $SRC/*.kt | grep -v FasttracksDialerModule.kt)
"$JAVA" -cp "$CP" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -cp "$STD:$ANDROID_JAR" $FILES StubR.kt -d "$OUT" 2>&1 | grep -E "error|exception" && { echo "COMPILE FAILED"; exit 1; }
echo "compiles: $(echo $FILES | wc -w | tr -d ' ') files against $(basename $(dirname $ANDROID_JAR))"
