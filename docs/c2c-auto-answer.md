# Click-to-call with automatic answer (company Android phones)

Flow (the existing Exotel click-to-call is NOT replaced): salesman taps Call > backend `POST /calls/dial` (Connect Two Numbers, unchanged) > Exotel rings the salesman's SIM > the Fasttracks app, as the phone app of that phone, answers ONLY that call silently > Exotel connects the customer > recording and the Python/Sarvam pipeline continue as before.

## How it decides (and why personal calls are safe)
`modules/fasttracks-dialer/.../AutoAnswerPolicy.kt` is the only place that answers. ALL of these must hold: an armed attempt exists (armed by the app right after a NEW call was accepted, single use, max 3 minutes, expiry set by the native clock); the caller number is present with 10+ digits; its last 10 digits equal the ExoPhone sent by the backend; no other call is in progress. Otherwise the call is a normal call. Telecom itself plays the ringtone and vibration (the service does not declare IN_CALL_SERVICE_RINGING); only an answered Exotel call has its ringer silenced. The attempt is cleared on use, on expiry, and when the dial request fails. A repeated (deduped) request carries no hint, so a retry cannot open a second window.

## Pieces
- Backend (flag `CALLS_C2C_AUTOANSWER_ENABLED`, off by default): dial/initiate response gets `autoAnswer: {callerIds:[ExoPhone], windowSeconds}`; capabilities get `c2cAutoAnswerEnabled`.
- App: `src/lib/auto-answer/arm.ts` (pure, tested), dialer pad (arms after a new call, "Enable automatic answer" button, status text), `modules/fasttracks-dialer` (Kotlin: `FtInCallService`, `InCallActivity`, `DialerActivity`, `CallActionReceiver`, `PendingStore`), `plugins/with-fasttracks-dialer.js` (manifest, only when `FASTTRACKS_DIALER=1`), EAS profile `development-dialer`.
- Normal calls handled by the phone app: incoming screen with Answer/Reject, ongoing screen with Mute/Speaker/Hang up, notification actions, tel: handler (ACTION_DIAL only opens the app; it places no call).

## Native code layout (important)
Expo autolinks every folder in `modules/` that has an `expo-module.config.json`, which would compile experimental Kotlin into ALL builds, production included. So the Kotlin lives in `native-optional/<name>/` and `scripts/enable-native-modules.js` copies it into `modules/<name>/` only when `FASTTRACKS_DIALER=1` (dialer) or `FASTTRACKS_VOIP_NATIVE=1` (Exotel SDK skeleton). It runs on EAS as the `eas-build-pre-install` hook and removes a leftover copy when the flag is off. For a local `expo run:android`, run `FASTTRACKS_DIALER=1 node scripts/enable-native-modules.js` first. The JS side (`modules/<name>/src`) is always present and returns null when the native module is missing.

## Verified in the session (2026-11-02, no phone)
- `AutoAnswerPolicy` JUnit tests: 12/12 pass, compiled with kotlinc 2.1.0 on JDK 17.
- `FtInCallService`, `InCallActivity`, `DialerActivity`, `CallActionReceiver`, `PendingStore`, `CallRegistry` compile cleanly against Android 14 (API 34) with warnings treated as errors; the Exotel skeleton bridge and service compile too.
- `expo prebuild` in a scratch copy: flag OFF gives a manifest with no dialer entries; flag ON gives the InCallService (BIND_INCALL_SERVICE, IN_CALL_SERVICE_UI, no IN_CALL_SERVICE_RINGING), the DIAL activities, the receiver and the permissions; autolinking resolves `FasttracksDialerModule` only with the flag ON.
- The two Expo module classes (`FasttracksDialerModule`, `ExotelVoiceModule`) could NOT be compiled here (they need expo-modules-core and React Native). Every DSL call used was checked by hand against the installed expo-modules-core sources (AsyncFunction with Promise, `return@AsyncFunction`, `sendEvent(String, Map)`, `OnActivityResult(Activity, payload)`, `appContext.currentActivity`). The first EAS build is the real compile.

## NOT verified yet (needs a real phone and the EAS build)
1. The EAS build itself (Gradle, the two Expo module classes, Android lint on release builds).
2. The caller ID the operator actually shows for Exotel's first leg (expected: the ExoPhone in `EXOTEL_CALLER_ID`). Use learn mode first (`EXPO_PUBLIC_AUTOANSWER_LEARN=true`): any call that rings inside the armed window is reported on screen with its number and is NOT answered.
3. Whether an operator hides or rewrites the number (then nothing is answered: safe failure).
4. `TelecomManager.silenceRinger()` may let a split second of ring through before the answer.
5. OEM behaviour (Xiaomi, Oppo, Vivo restrict background starts and the phone role); missed-call notifications and call-log entries for personal calls (expected from Telecom, not confirmed).
6. Personal-call behaviour on the device: ringtone and vibration, full-screen incoming screen on a locked phone, Answer/Reject, ongoing screen, hang up, a second call during a call, tel: links asking "Call <number>?".

## First approved device test (needs your OK for the cloud build and the real calls)
1. `eas build --profile development-dialer --platform android` (the profile sets `FASTTRACKS_DIALER=1`, so the module is copied in and the manifest changes), install on ONE company phone.
2. Backend: `CALLS_C2C_AUTOANSWER_ENABLED=true`, `EXOTEL_CALLER_ID` set. Do not touch production.
3. In the app Dialer tab tap "Enable automatic answer" and approve Android's dialog.
4. Learn run: a build with `EXPO_PUBLIC_AUTOANSWER_LEARN=true`, place one call to your own number, read the caller ID shown, compare.
5. Real run (learn off): place one call; expect no ring, call answered, customer rung, recording present.
6. Personal checks: call the phone from another number (must ring and show Answer/Reject), place an outgoing call from the system dialer, hang up, a second call while on a call.
