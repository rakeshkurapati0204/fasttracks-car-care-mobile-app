# Sales trial (20-day pilot, 5-10 salesmen): EAS profile `sales-trial`

NOT built yet. Nothing here is deployed. Prepared for approval.

## What the profile builds
`eas build --profile sales-trial --platform android` makes a RELEASE APK (internal distribution): the full JavaScript bundle is inside, there is no Metro and no dev client (expo-dev-launcher is `debugImplementation` only in this Expo version, so it is not in a release build; confirm on the first APK with `aapt dump badging`/a class search). It carries the Kotlin phone-app module (`FASTTRACKS_DIALER=1` makes the `eas-build-pre-install` hook copy `native-optional/fasttracks-dialer` in and the config plugin edit the manifest).

## Guard (`scripts/check-trial-build.js`, runs before the build, only for this profile)
Refuses the build unless `EXPO_PUBLIC_API_URL` is https, ends in `/api/v1`, is not localhost / private IP / `.local` / placeholder, is not the production host (`dashboard.fasttrackscarcare.in`), and none of `EXPO_PUBLIC_VOIP_MOCK`, `EXPO_PUBLIC_VOIP_NATIVE`, `EXPO_PUBLIC_AUTOANSWER_LEARN` is true. The URL in `eas.json` is a placeholder on purpose (`REPLACE-WITH-STAGING-HOST.invalid`), so the build cannot start until a real staging URL is put there.

## Who controls what (independent of production)
- Auto-answer on/off, ExoPhone, Exotel keys, Sarvam, call limits: the STAGING backend's env (`CALLS_C2C_AUTOANSWER_ENABLED`, `EXOTEL_*`, ...). Production's env is separate. Turning the staging flag off stops arming in every phone at once (no hint is sent), without a new APK.
- The APK holds no secret. `EXPO_PUBLIC_*` values are readable inside the APK: only the staging URL is there.
- Learn mode is a build-time switch: it is NOT in this APK. The caller ID test uses a separate development build.

## Before any salesman gets the APK (gates)
1. A staging backend + database reachable over HTTPS, with the salesmen as users (and their SIM numbers in their profiles). Not existing yet.
2. One company phone passes the device test in `docs/c2c-auto-answer.md` (caller ID learned, personal calls ring and show Answer/Reject, missed call, second call, tel: link).
3. An Expo account/owner decision and a signing key kept safe: every pilot update must be signed with the same key, or phones must uninstall first. The package id stays `in.fasttrackscarcare.mobile` (google-services.json is tied to it).
4. No over-the-air updates exist (no expo-updates): a fix means a new APK and a reinstall.

## Install on a phone
Open the build page link EAS prints (internal distribution), download the APK, allow "Install unknown apps" for the browser, install, open Fasttracks, sign in, tap "Enable automatic answer" and approve Android's dialog. To undo: Android Settings > Apps > Default apps > Phone app > pick the normal dialer.
