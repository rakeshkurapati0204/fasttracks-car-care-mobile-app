# Fasttracks Car Care – Mobile App Overview (DRAFT)

Source: read-only code and docs inventory of this repo, plus what was built and verified in this project. Items marked **(?)** are not confirmed. The dashboard and backend are in [DASHBOARD_BACKEND_OVERVIEW.md](DASHBOARD_BACKEND_OVERVIEW.md).

## 1. System at a glance

| Part | What it is |
|---|---|
| Mobile app (this repo) | Expo SDK 57, React Native 0.86, React 19, expo-router (typed routes, React Compiler), TypeScript. Package `in.fasttrackscarcare.mobile`, name "Fasttracks", portrait, light UI. |
| Native dialer module | Kotlin Android module `fasttracks-dialer` (`native-optional/`): in-call screen, auto-answer, notification actions. Built in only when `FASTTRACKS_DIALER=1`. |
| Backend | Fasttracks dashboard API (`/api/v1`, Node/Express/Prisma). The app has no backend of its own. About 340 API wrappers in `src/lib/api.ts` (4,700 lines). |
| Telephony | Exotel click-to-call and recordings, via backend. |
| AI | Owner "Ask AI" assistant (backend, Anthropic), Call Intelligence (Python service). |

No over-the-air updates (no `expo-updates`). Unit tests: `npm test` (`node --test`, about 27 files).

## 2. App shell and navigation

- **Providers:** Gesture > Theme (maroon, light/dark) > Auth > Permissions > Drawer > StallWatcher > PushShell > navigator. A brand splash holds until auth and fonts are ready (skipped when launched from a notification tap).
- **Routing:** signed out → `login` (and `forgot-password`); signed in → `/more/overview` (or `/more/change-password` first if the password must be changed).
- **Bottom tabs (2):** Home (`(app)/attendance.tsx`) and Conversations (WhatsApp inbox and chat thread). Everything else is in the menu.
- **Slide menu (`push-shell.tsx`):** the current screen slides right and shrinks, a maroon gradient menu sits behind it. Close by tapping the card, X, swipe left or Android Back. The menu list is one animated view (earlier per-row animation caused freezes). Entries use `router.replace`. Header shows name and role; sign-out is there. Long-press on the name opens the Speed log.
- **Menu content:** 56 entries in `src/constants/screen-registry.ts`, filtered by role and access flags (legal, ads, quotations, employee documents, company settings). Competencies and Onboarding Templates sit in a "Templates" group. Entries without a real screen show a generic stub.
- **Roles in code (12):** OWNER, STORE_MANAGER, HR, ACCOUNTING, CASHIER, SALES, TECHNICIAN, TECH_TEAM, SOCIAL_MEDIA, STAFF, INVENTORY_MANAGER, HOUSEKEEPING.

## 3. Login, roles, permissions

- **Login:** username and password (eye toggle), remember me (username only), session-expired message, forgot password (public).
- **Session:** JWT in SecureStore with a memory cache. Cold start opens instantly from a slim cached profile (no salary), then refreshes `/auth/me` in the background. A 401 anywhere signs the user out.
- **Permissions:** `/auth/me` returns tab permissions, tab modes (view only, sales mode, full access), and legal/ads access flags. The app fails closed: while loading or on error, gated screens are denied.
- **Change password** mirrors the dashboard rules.

## 4. Screens by role

### Owner only
- **Ask AI:** see section 7.
- **Call Tracker:** call-recording report with masked numbers, transcript and AI summary status, search, filters, call detail. Data from `/call-intelligence/recordings`. Audio playback may still be a stub **(?)**.
- **Overview (owner view):** KPIs, recent activity, daily report, customer stats. Other roles get a Welcome view on the same screen.
- **Accounts:** bank accounts (masked), EMIs, reminders (also ACCOUNTING).
- **Quotations:** list, detail, cancel (OWNER, or users with the quotations tab, own only).

### Owner and managers (OWNER, STORE_MANAGER, plus HR, ACCOUNTING, CASHIER, INVENTORY_MANAGER where noted)
- **People/HR:** Employees (directory, add/edit, deactivate, delete (owner), password reset, detail tabs), Employee Documents, Applications, Onboarding, Onboarding Templates, Competencies, Analytics, Audit Trail, HR Reports (PDF/Excel), Staff Config, Agreements **(?)**.
- **Attendance admin:** All Employees tab with Today, Calendar and Register views, bulk mark, CSV import, override, pardon. All Timesheets, Leave Requests queue, Overtime Approval.
- **Money:** Payroll (summary, overrides, disbursement with undo), Payslips, Incentives, Finance Approvals (advances/loans), Financial (current finances), ERP Finance, Purchase/Accounting (ledgers), Expenses.
- **Operations:** Inventory (products, batches, CSV import, barcode), Pipeline / Job Tracker (kanban by job status), Contacts directory, ERP Sales and Purchasing **(?)**, CRM **(?)**.
- **Security and devices:** Password Manager (passwords and cards, masked, cleared when the app leaves the foreground), Devices (MDM list, enroll, lock, unlock, unenroll), App Policies, Device Alerts, Live Location (60 s refresh), SIM Tracker.
- **Other:** Company Settings (letterhead), Meta Ads (spend and leads, access flag), Legal (access flag), AI Agents (coming-soon stub).

### Salesman (SALES) and managers
- **Calls screen (OWNER, STORE_MANAGER, SALES), four tabs:** Dialer, Recents (call log, one-tap call back, sort by date/duration/person), Contacts (with add to contacts), Search customer by phone.
- **Conversations:** WhatsApp inbox and thread, calls tab, new conversation, manage numbers. A salesman sees only own customers.
- **New Entry:** create job card and draft invoice with customer lookup and autofill, lead source, vehicle details, handled-by, inspection photos and video.
- **Contact sync:** salesmen's phone contacts are copied to the server after a one-time prompt, then new contacts are checked at most every 10 minutes.

### Everyone
- **Home:** hero header with attendance (clock-in), timesheet, reminders and tasks, month history, customers shortcut. No manual clock-out.
- **Attendance** (self view: today, calendar, late records, warnings), **Tasks** (daily and assigned, replies; managers can create and filter), **Customers & Jobs** (directory, detail, job cards, status board, walkout, inspection media), **My Timesheet**, **My Salary**, **My Payslips** (PDF), **My Finance** (advance requests), **Overtime**, **Leave Requests**, **Expenses**, **Personal Info**, **Reminders**, **Remarks** (owner rates employees; employees see their own), **Team Chat** (1:1 and groups, voice messages, media), **Notifications**, **Invoices**, **Change Password**, **Install App** (web only).

## 5. Calls: dialer, native module, auto-answer

**Click-to-call flow**
1. Opening the dial pad warms the Exotel caller IDs (cached on the phone, refreshed from `GET /calls/auto-answer-hint` at most every 5 minutes) and capabilities (`GET /calls/capabilities`).
2. If auto-answer is on and Fasttracks is not yet the phone app, Android's "make Fasttracks your phone app?" dialog is shown (a "no" is re-asked after 24 h).
3. The pad takes a 10-digit Indian mobile, converts to `+91…`, supports paste, long-press 0 for `+91`, add to contacts. Call back from Recents asks "Call X?".
4. Press Call → native "Calling…" screen opens immediately → app pre-arms auto-answer with the cached caller IDs (60 s) → `POST /calls/dial` with an idempotency key and `confirm: true` → arms again from the reply.
5. Backend runs Exotel Connect Two Numbers: Exotel rings the salesman's own phone from the ExoPhone, the app auto-answers that leg, Exotel then connects the customer.
6. On failure: disarm, close the call screen, show a clear error.
7. Protections: Call is ignored while a call is live (up to 10 min) and for 3 s after a call ends; double taps blocked.

**Native Kotlin module (`expo.modules.fasttracksdialer`)**
- `FtInCallService`: Telecom binds it when Fasttracks is the phone app. For each ringing call it asks the policy. ANSWER → silence ringer and answer (audio). Otherwise normal incoming screen. A call that rings right after Call is pressed with nothing armed yet is held off-screen for 2.5 s while the app arms.
- `AutoAnswerPolicy`: the only place that decides. ANSWER needs an armed, unexpired attempt, a number with 10+ digits matching one of the attempt's caller IDs (last 10 digits), and no other live call. Extra path: if Call was pressed in the last 45 s and the ringing number is a known Exotel caller-ID tail, it answers even when no attempt is armed. Never answers unknown numbers, a busy phone, or in learn mode. 31 JVM checks pass.
- `PendingStore`: survives process kill, digits only, keeps the last 8 known caller IDs.
- `InCallActivity`: plain Android views (opens instantly, even on a locked screen). Shows name or number, timer, status, Mute, Keypad (real DTMF), Speaker, Hold, End. A call being auto-answered or held shows "Calling…", never Accept/Decline. Proximity wake lock at the ear.
- `DialerActivity`: handles `tel:` links, shows "Call <number>?" and places the call only after a tap. Never auto-answers.
- `CallActionReceiver` (notification Answer/Reject/Hang up), `KeyTones` (DTMF sounds follow the phone setting).
- Manifest additions only when `FASTTRACKS_DIALER=1` (answer-phone-calls, call-phone, full-screen intent, etc.).
- Logs (tag `FtDialer`) record the decision, armed state and window left, never the number.

**Learn mode** (`EXPO_PUBLIC_AUTOANSWER_LEARN=true`): reports the caller ID Exotel shows and never answers. The `sales-trial` build refuses to compile with it.

**Recording and logging:** no native recorder in this app. Recording is by Exotel on the server; the app shows history from `GET /calls`, and the owner Call Tracker shows transcripts and summaries. A separate "FT Call Recorder" Android app is mentioned in Install App **(?)**.

**In-app VoIP:** an alternative design (`src/lib/voip/*`, `exotel-voice` module) is a skeleton only and not active (`SDK_ENABLED = false`).

## 6. Ask AI (owner chatbot)

- `more/assistant.tsx`, owner only (menu role filter plus an in-screen check).
- `POST /owner-assistant/chat`, 45 s timeout. Stateless server, so the app sends the last 20 messages each time; the chat is lost when the screen closes.
- Quick pills: Today's brief, Which jobs are stuck?, Who is absent today?
- Animated mechanic avatar, selectable chat bubbles.
- Server side (not verified from the app): read-only, replies in English, Hindi or Telugu, refuses payment, invoice, salary, bank, ledger and loan questions before any model call.
- Friendly error messages for 404, 403, 429, 502 and no connection.

## 7. Notifications and push

- Expo push token registered after login (never blocks login), Android channel `default`. iOS needs Apple credentials first.
- Tap actions: task → Tasks, reminder → Reminders, lead → that conversation.
- In-app notification list: 20 per page, unread highlighted, tap opens the mapped screen.
- After the first screen draws, push registration and contact sync run one at a time, 1.5 s apart.

## 8. Offline, caching, diagnostics

- **No offline mode.** Cached: token, slim profile, remembered username, Exotel caller IDs, contact-sync state, call capabilities (in memory).
- Polling (team chat, conversations) schedules the next run only after the previous one ends, backs off on failure, and stops in the background.
- **Speed log:** long-press the user name in the menu. Shows UI stalls (600 ms or more) and the latest menu open/close and dial key events; Copy, Clear, Close.

## 9. Builds and environments

| Profile | Use | API |
|---|---|---|
| `development`, `development-dialer`, `development-voip` | dev clients | per env |
| `preview` | internal APK | **production** URL (flagged risk) |
| `staging` | internal APK | staging URL |
| `production` | store build | production URL |
| `sales-trial` | 20-day pilot APK, dialer on | staging URL |

- A guard script blocks `sales-trial` builds that point at production, localhost, or use mock/learn flags.
- Local APK: `eas build --platform android --profile sales-trial --local`. Current phone build: **v24, versionCode 21**, locked by tag `v24-working-vc21`.
- Only `EXPO_PUBLIC_API_URL` is required by the app. Build flags: `FASTTRACKS_DIALER`, `FASTTRACKS_TRIAL`, `FASTTRACKS_VOIP_NATIVE`, `FASTTRACKS_ALL_ABIS`. Builds target arm64-v8a and armeabi-v7a only.
- Staging domain `staging.dashboard.fasttrackscarcare.in` is on Hostinger (old backend). The Azure VM has the new backend; domain move planned, then prod. Prod pm2 on the VM has a known crash loop (port 4000).

## 10. Verified on the phone (versionCode 21)

- Single call: ring → auto-answer decision → answered in about 0.3 s, no callback, no 1-second incoming screen.
- Menu no longer freezes (0 Reanimated warnings, no frame skips of 100 ms or more, no crash or ANR).

## 11. Known gaps and risks

- Ask AI never tested on the phone (staging domain still on the old backend).
- Back-to-back second call after the first ends not re-tested.
- Not verified on real phones: other OEMs (Xiaomi, Oppo, Vivo), personal calls, ringer silencing timing.
- Docs that are stale: README scope line, `NAV_REDESIGN_PLAN.md` (old side menu), the placeholder staging URL in `docs/sales-trial-pilot.md`, parts of `CODEX_REPORT.md`.
- **The local `.env` in this repo holds server-side variable names (Exotel, Sarvam, Anthropic, etc.).** The app reads only `EXPO_PUBLIC_API_URL`, but anything `EXPO_PUBLIC_*` is readable inside the APK, and the README and `CODEX_REPORT.md` disagree on whether `.env` is git-ignored. Check before committing or sharing the repo.
- Uncommitted: `DialerActivity.kt` change (removes the `/more/calls` deep link), keep or revert undecided. Local `app.json` edits (versionCode, projectId, owner) must never be committed.
- Screens without a menu entry (agreements, ERP sales, purchasing, CRM, staff config): how users reach them is unconfirmed.

## 12. Planned: owner call transfer (not built)

Goal: owner is on a customer call, presses **1 = Vamsi** or **2 = Niketh**, and the call goes to that salesman.

- 1/2 will be on-screen buttons on the owner's call screen (a keypad tone would go to the customer).
- Customers must call the **Exotel number** for server-side transfer; website, Google profile and ads must show it instead of the owner's personal SIM.
- Exotel docs: the Legs API can create a leg and a bridge, but removing only the owner's leg and getting the leg id of an incoming call are **not documented**. Exotel's own dashboard has a blind Transfer button, which is not usable inside our app.
- Next step: ask Exotel support (email draft prepared) whether a live transfer is supported on our account.
- Fallback if not: phone conference merge (carrier dependent, needs a phone test).
- Needs: salesman phone numbers, backend transfer endpoint, owner call-screen buttons, transfer log.
