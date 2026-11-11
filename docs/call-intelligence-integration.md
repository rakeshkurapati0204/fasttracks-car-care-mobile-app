# Call Intelligence in the Call Tracker

The Call Tracker (`src/app/more/call-tracker.tsx`, OWNER only) shows real calls from the Call Intelligence service: Exotel recording,
Sarvam transcript (speaker = recording channel) and a structured AI summary. The sample data that used to be in
`src/lib/call-tracker.ts` is gone. If the backend route below does not exist yet, the screen says so instead of showing anything made up.

## How it fits together

```
mobile app  --JWT-->  Node/Express backend (dashboard repo)  --bearer token-->  Call Intelligence service (Python PoC, read API)
```

- The app only talks to the existing backend, with the existing axios client and login. It never sees the service URL or its token.
- The service is `services/call-intelligence` in the `fasttracks-dashboard` repo (`docs/DASHBOARD_API.md` there). It is read-only for this
  purpose: `GET /api/recordings`, `GET /api/recordings/{id}`, `GET /api/recordings/{id}/audio`, all with `Authorization: Bearer <DASHBOARD_API_TOKEN>`.
- Exotel and Sarvam credentials stay in the service's own `.env`. Nothing secret goes into this app.

## Where the service lives

The Python service is server code, so it lives only in the `fasttracks-dashboard` repo at `services/call-intelligence/`, next to the backend
that runs it. This app holds no copy of it. Setup, tests and the mock stack (`ci:setup`, `ci:test`, `ci:stack`, `ci:e2e` used to be npm
scripts here) are in that folder's `README.md`; see also `docs/call-tracker-architecture.md` in the dashboard repo for where every part of
the call tracker lives.

## Backend routes (dashboard repo, `main`)

`backend/src/routes/callIntelligence.ts`, mounted at `/api/v1/call-intelligence`, behind `verifyToken` and `requireRoles('OWNER')`. Read-only proxy to the service:

| Route | Upstream (real PoC API) | Response (inside `{ success, data }`) |
|---|---|---|
| `GET /recordings?limit=&offset=&source=` | `GET /api/recordings` | `data = { items, limit, offset }`; limit 1-100 (default 50), source `exotel` or `android_native` |
| `GET /recordings/:id` | `GET /api/recordings/{id}` | `data = item` plus `transcriptText` and `summary` |
| `GET /recordings/:id/audio` | `GET /api/recordings/{id}/audio` | audio stream, `Range` forwarded (200/206) |

Server-side settings (backend `.env`, documented in `backend/.env.example`): `CALL_INTEL_API_URL` (e.g. `http://127.0.0.1:4435`) and
`CALL_INTEL_API_TOKEN` (the service's `DASHBOARD_API_TOKEN`). Unset means 503 `NOT_CONFIGURED`. Responses are rebuilt from a fixed field list:
`recordingInfo`, `attribution`, `createdAt`, `customField` and `resultId` are dropped, and `audioUrl` is replaced by the backend's own audio route.
Invalid ids and queries are 400, upstream trouble is a generic 502 (no upstream text), unknown id is 404.

Item fields passed on: `recordingId, source, salesperson, direction, callStatus, fromMasked, toMasked, startedAt, endedAt, durationSeconds,
conversationSeconds, status{recording,transcription,summary}, failureReason, audioUrl` (+ `transcriptText, summary` on the detail).

A call that was too short carries `summary = { "status": "not_enough_speech", "reason": "..." }`; the app shows that text. Summaries saved in the
older format (before 28 Oct) have none of the current fields and show "no content in the current format".

## Other things to decide before this can run for real

- Where the service runs and how the backend reaches it (today it runs only on a laptop; the API binds to 127.0.0.1 by default).
- Which database it uses (default is a local SQLite file; PostgreSQL in its own schema is supported).
- Who may read transcripts and hear recordings, retention, and the recording-consent notice.
- Audio playback in the app (needs the `/audio` route above and an authenticated player).

## What was verified

- Mapper and screen logic: `npm test` (Node's built-in runner) on fixtures that copy the real response shape; the text in them is synthetic.
- Backend proxy: 41 vitest tests against a local fake upstream, plus one local live run against the real PoC read API (loopback only) that returned the 3 stored real calls, the 12-turn SALESMAN/CUSTOMER transcript of 28 Oct, the structured summary and the real audio (200 and 206).
- The real response shape was checked against the service's own output for the real call of 28 Oct 2026 (stereo recording, SALESMAN/CUSTOMER
  transcript, structured summary).
- NOT verified: the app on a device or emulator against the running backend, a real call placed from the app, audio playback.
- Audio playback is NOT in the app: the backend streams audio, but the Call Tracker player is still a disabled stub (`expo-audio` is in package.json but unused, and an authenticated source was not tested on a device).
- The customer-page call button and the dialer pad are unchanged and separate: the dialer pad still only shows an alert.

## In-app VoIP calling (Option A, mock only so far)

Flow: Salesman app > Call > Exotel Voice SDK dials the SIP Exophone > Exotel asks our backend "Dial Whom" > Exotel rings the CUSTOMER. The salesman is never called (no SIM call, no in-app incoming call). Audio uses the app microphone and speaker. Recording, transcription and summary stay on the existing Exotel + Python + Sarvam pipeline.

Built and tested in mock mode (`CALLS_VOIP_ENABLED=true CALLS_VOIP_MOCK=true` on the backend, `EXPO_PUBLIC_VOIP_MOCK=true` in the app):
- Backend: `POST /calls/voip/prepare`, `POST /calls/voip/token`, `GET /calls/voip/dialwhom/:secret` (no schema change; context kept in `exotel_outbound_request`).
- App: `src/lib/voip/*` (state machine, engine interface, mock engine, orchestrator), `InCallModal`, dialer wiring. Old click-to-call flow is untouched when VoIP is off.

NOT verified (needs Exotel support, I cannot contact them):
1. Can Dial Whom for an SDK call return a plain PSTN number? Exotel's SDK page documents only `sip:<id>` and says SIP/PSTN intermixing is not supported.
2. How are subscriber tokens issued (Subscriber Management API), and which hostname/cluster applies?
3. Are recording and status callbacks sent for SDK-originated calls, and do `record` / dual-channel recording apply?
4. Does Exotel list these calls in the Calls API so our sweep can find them?

Still to build after approval: native Kotlin Expo module for the Exotel Android SDK + EAS dev build, and the real Subscriber API client. No real calls, paid APIs, migrations or deploys were done.
