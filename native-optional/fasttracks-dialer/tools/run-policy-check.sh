#!/bin/bash
# Compiles AutoAnswerPolicy.kt and its check with the Kotlin compiler that ships inside the Gradle distribution (any build that has run on this Mac), then runs it.
set -e
cd "$(dirname "$0")"
GL=$(ls -d "$HOME"/.gradle/wrapper/dists/gradle-*-bin/*/gradle-*/lib 2>/dev/null | tail -1)
[ -n "$GL" ] || { echo "No Gradle distribution found under ~/.gradle (run one Android build first, or install kotlinc)."; exit 2; }
JAVA=${JAVA_HOME:+$JAVA_HOME/bin/java}; JAVA=${JAVA:-java}
OUT=$(mktemp -d)
CP=$(ls "$GL"/kotlin-compiler-embeddable-*.jar "$GL"/kotlin-stdlib-*.jar "$GL"/kotlin-script-runtime-*.jar "$GL"/kotlin-reflect-*.jar "$GL"/kotlin-daemon-embeddable-*.jar "$GL"/kotlinx-coroutines-core-jvm-*.jar "$GL"/annotations-*.jar 2>/dev/null | tr '\n' ':')
STD=$(ls "$GL"/kotlin-stdlib-*.jar | head -1)
"$JAVA" -cp "$CP" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -cp "$STD" \
  ../android/src/main/java/expo/modules/fasttracksdialer/AutoAnswerPolicy.kt AutoAnswerPolicyCheck.kt -d "$OUT" 2>&1 | grep -v "^warning" || true
"$JAVA" -cp "$OUT:$STD" expo.modules.fasttracksdialer.AutoAnswerPolicyCheckKt
