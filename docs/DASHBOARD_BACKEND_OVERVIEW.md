# Fasttracks Dashboard + Backend – Feature Inventory (DRAFT)

Source: read-only code inventory of `~/fasttracks-dashboard`, branch `latest-main`. Function bodies were not read in depth. Items marked **(?)** are inferred from names or uncertain. Env var **names** only, no values. The mobile app side is in `APP_OVERVIEW.md`.

## 1. Stack and layout

| Part | Tech |
|---|---|
| `backend/` | Express + TypeScript + Prisma, PostgreSQL. All routes under `/api/v1/*`, health at `/health` and `/api/v1/health` |
| `frontend/` | Next.js 14 (App Router), TypeScript, Tailwind, Recharts, Capacitor Android shell |
| `services/call-intelligence/` | Python FastAPI call-intelligence service |
| Others | `android-app/`, `device-poller/`, `windows-agent/`, `paytm-proxy/`, `terminal-proxy/`, `n8n/`, `deploy/` |

The root `README.md` is outdated (lists only the original modules). Use this document instead.

## 2. Auth, roles, permissions

- Auth routes: login, `me`, change-password, logout, forgot-password, reset-password. The role is re-read from the DB on every request and fails closed (503) if the DB is down. A token is rejected if `passwordChangedAt` no longer matches.
- 12 roles: OWNER, STORE_MANAGER, SALES, TECHNICIAN, TECH_TEAM, SOCIAL_MEDIA, STAFF, INVENTORY_MANAGER, ACCOUNTING, HR, HOUSEKEEPING, CASHIER.
- Per-tab permissions: `lib/tabRegistry.ts` is the single source (about 47 tabs: overview, customers/jobs, job tracker, conversations, tasks, calls, HR, attendance, payroll, finance, accounting, inventory, devices, etc.). Per-employee overrides are stored and every change is audited (`PermissionChangeLog`).
- Calls have their own authz: `calls:initiate`, `calls:recording.listen`, `calls:recording.download`, `calls:view.all`, `calls:view.raw_numbers`. Call roles: OWNER, STORE_MANAGER, SALES.
- Other middleware: rate limiters, upload limits, webhook body limit, WhatsApp signature check (`WHATSAPP_SIGNATURE_MODE` off/log/enforce), invite-token auth for applications, letters and onboarding.

## 3. Calls and Exotel (`backend/src/routes/calls.ts`, `backend/src/calls/*`)

**Click-to-call**
- `POST /calls/dial` (dial pad). Needs `CALLS_DIAL_PAD_ENABLED=true`, an allowed role and `calls:initiate`. Body accepts only `phone`, `idempotencyKey`, `confirm`, `fromCallId`; anything else returns 400.
- Exotel "Connect Two Numbers" rings the agent's own phone first, then the customer.
- Guards: E.164 validation, allowed country codes (`CALLS_DIAL_ALLOWED_CC`, default 91), no self number, no company caller-id number, idempotency, rate limit (`CALLS_DIAL_RATE_PER_MIN`, default 3), daily cap (`CALLS_DIAL_DAILY_CAP`, default 50).
- Success returns 202 with `callId`, `callSid`, `status`, masked number, and an `autoAnswer` hint. Each call writes an `ExotelCall` row and an `ExotelOutboundRequest` audit row, and emits a socket event `call-updated`.
- Also: `POST /calls/initiate`, `POST /calls/direct`.

**Auto-answer hint**
- `GET /calls/auto-answer-hint` returns the Exotel caller IDs and a window so the mobile app can pre-arm auto-answer before the Call press. Flags: `CALLS_C2C_AUTOANSWER_ENABLED`, `CALLS_C2C_AUTOANSWER_WINDOW_S`.

**Capabilities:** `GET /calls/capabilities` tells the client what the user may do.

**Webhooks** (secret path segment, optional basic auth, IP allowlist, dedupe; real data is re-fetched from Exotel to verify): status callback, flow, route, direct, connect, inbound, after, ready, handoff, brief, missed, plus VoIP events.

**Inbound customer calls:** routing to the customer's own salesperson (via ad-lead owner), live view, handoff, callback, brief, lead creation, release. Flags: `CALLS_INBOUND_ROUTING_ENABLED`, `CALLS_INBOUND_STICKY_DAYS`, `CALLS_INBOUND_FALLBACK_PHONE`.

**Passed leads:** salespeople can pass a lead to another taker. Endpoints for takers, create from phone, list, mine, opened, note, reassign. Callback alerts via `CALLBACK_MODE`, `CALLBACK_ALERT_MINUTES`.

**In-app VoIP (Exotel CCM SDK):** prepare, token, start, cancel. Flags `CALLS_VOIP_*`, `EXOTEL_CCM_*`.

**Call log:** `GET /calls` (default 50, max 200). Non-viewers see only their own calls. Numbers masked unless `calls:view.raw_numbers`.

**Recordings:**
- `/call-recordings`: upload (used by the mobile app), list, audio, download, my-summary (salesmen get summaries only), retranscribe.
- Exotel recordings are mirrored to permanent storage and transcribed in a queue.
- `/call-intelligence` proxies recordings to the Python service (`CALL_INTEL_*`, `CALL_INTEL_PRIMARY`).

**Background lanes** (only when Exotel is configured): verification every 30 s, outbound completion every 30 s, sweep every 15 min, callback alerts every 60 s, VoIP stale reconcile every 60 s.

**Staging:** `STAGING_MODE` turns WhatsApp sends, push and Meta ad sync into no-ops. No `STAGING_MODE` check was found under `calls/`. Whether `/calls/dial` honours it is **not confirmed**; staging calls are governed by `CALLS_SIMULATE` and the `CALLS_*` flags. `docs/dashboard-dialer.md` says the dial pad was not yet verified against live Exotel and may be stale.

## 4. Owner AI Assistant

- `POST /api/v1/owner-assistant/chat`, body `{messages:[{role,content}]}`, returns `{reply}`. OWNER only, stateless.
- Model: Anthropic Haiku via `@anthropic-ai/sdk` (needs `ANTHROPIC_API_KEY`). Max 2000 output tokens, 4 tool rounds, 8 s fetch timeout. Costs and each question are logged.
- Read-only: it calls existing owner API endpoints with the owner's own token, so existing role checks apply. No new tables.
- Tools: daily brief, jobs today, stuck jobs (3+ days), pipeline counts, follow-ups (walkouts, last 30 days), attendance today, missed calls (no numbers), low stock.
- Money guard: a multilingual regex (English, Hinglish, Devanagari, Telugu) blocks payments, invoices, salary, bank, ledger, loans, price, revenue, profit questions with a canned refusal before the model runs. So it does **not** answer money, aging or accounting questions.
- Reply language is detected (English, Hinglish, Hindi, Telugu). Test accounts and phone-number-like names are hidden.
- Frontend: `owner-assistant-panel.tsx` on the dashboard overview with the mechanic avatar and quick-question pills.
- Other assistants: HR assistant, onboarding assistant, application-progress assistant, AI assignment.

## 5. Sales, billing, customers

- **Customers / CRM:** customers, vehicles, remarks, GST and vehicle lookup. Pages: CRM, customers, entry.
- **Job cards:** statuses IN_PROGRESS, READY, RELEASED, WALKED_OUT. Board stages CREATED, QUOTED, HANDED_OVER, COLLECTED, WALKED_OUT. Inspection media, edits log, list items, print, reassign. Pipeline page is a kanban. (The legacy `Job` model is still present.)
- **Invoices:** create, open invoices, stats, reports, cancel, payment, mark-paid, PDF, send by email or WhatsApp, Shiprocket waybill. Quotations: CRUD and print.
- **Payments:** record, history, Cashfree orders and webhook, advance receipts, split and batch payments, store payment methods. Paytm/Worldline terminal proxies exist at the repo root. The wallet route is unmounted.
- **Money summaries that exist:** financial overview, outstanding, payments today, revenue breakdown, growth, top customers, KPIs, revenue trend, source breakdown, customer slabs; dashboard overview, today snapshot, revenue by employee; invoice stats and reports; a daily sales summary sent to the owner on WhatsApp.
- **Aging report:** none found on `latest-main` **(?)**.

## 6. Accounting

- Supplier payables book only: ledgers, purchase vouchers, debit notes, payment vouchers, payment allocations, entries, attachments. Expenses with duplicate detection and receipt/statement extraction.
- Bank accounts (balances, history, audited reveal), EMIs, payment reminders.
- Auto-posting of customer payments as receipt vouchers is only a **proposal** (`docs/accounting-autopost-design.md`, untracked) on branch `feat/accounting-autopost`, not merged **(?)**.

## 7. Leads and bots

- Ad leads and daily ad spend, Meta ad spend sync (nightly), lead-desk sync (every minute plus reconciles), WhatsApp lead bot (`LEAD_BOT_ENABLED`), n8n inbound `/incoming/new-lead`, call-created leads. Page: Ads.
- Customer WhatsApp bot (`backend/src/bot/`, about 70 files, 42+ tests): screens, language understanding, history, accessories, vehicle, opt-out, staff alerts, store hours. Toggle `CUSTOMER_BOT_ENABLED`. Simulator `npm run bot:sim`.
- WhatsApp inbox: webhook (signature-verified), media, assign, flag, block, reactions.

## 8. Inventory and ERP

- Inventory: snapshot, deduct, bill upload, barcodes, restock, stock receipts and reconciliation, item-out log.
- ERP: items with media, stock, suppliers, purchase orders, sales orders. Pages: inventory, purchasing, sales.

## 9. HR, attendance, payroll

- Employees, attendance (biometric device punches, mobile check-in, daily log, late records, warnings, pardon, overrides, bulk mark, orphan replay), leave requests, overtime and approval, timesheets, payroll, payslips, incentives, loans, agreements, staff config, phone numbers, SIM tracker.
- HR letters (PDF, email), candidates, onboarding invites and tasks, probation check-ins, discipline, identity documents.
- Recruiting: applications, AI interviewer "Aria" (Azure speech), competency templates, assignments.
- Devices: biometric devices, location, app policies, alerts.

## 10. Team tools

- Internal team chat, tasks, recurring tasks, reminders, remarks, work documentation, contacts with nicknames per salesperson, legal cases and documents, password and card vaults (encrypted with `ENCRYPTION_KEY`), action log, reports.

## 11. Notifications

- Per-user read state, live socket push, FCM phone push (`NEW_LEAD` is never pushed), Telegram alerts, WhatsApp and email. Retention cleanup nightly (`NOTIFICATION_RETENTION_DAYS`).

## 12. Scheduled jobs

Crons are skipped when `DISABLE_CRON=true`. Timezone **not confirmed (?)**; times look like UTC.
- Attendance: daily summary, intraday and nightly absent checks, leave reminders, clock-out settle, stuck clock-ins, monthly attendance report, absent-staff job reassign.
- Sales: daily sales summary to owner (WhatsApp).
- Others: poller health, deploy drift check, recurring tasks and reminders (every 15 min), onboarding reminders, probation reminders, Meta ad sync, lead-desk sync, notification cleanup, interview recording cleanup, transcription queue, biometric device polling.
- A shared lifecycle helper provides graceful shutdown (8 s drain).

## 13. Database

About 150 Prisma models (`schema.prisma`, about 5,300 lines), PostgreSQL. Groups: core (users, customers, jobs, job cards, notifications, permissions), attendance and HR, onboarding and recruiting, sales and billing, accounting and accounts, inventory and ERP, calls and leads (`ExotelCall`, `ExotelCallEvent`, `ExotelOutboundRequest`, `CallRecording`, `PassedLead`, `AdLead`), comms and tasks, and others (legal, vaults, devices). Migrations: Prisma `migrate deploy` plus idempotent SQL files in `backend/prisma/`. `DATABASE_URL` is the pooler, `DIRECT_URL` the direct connection.

## 14. Frontend pages (inferred from file names)

Public: login, forgot/reset/change password, APK install, privacy policy, application form, assignment/interview/letter/onboarding invites.
Dashboard: overview (with Owner Assistant), entry, customers, CRM, pipeline, quotations, invoices, sales, purchasing, inventory, ads, conversations, team chat, contacts, calls, call-intelligence, agents, financial, finance, finance-approvals, accounting, accounts, expenses, wallet, my-finance, employees, attendance, leave-requests, overtime, timesheets, payroll, payslips, incentives, agreements, staff-config, personal-info, employee-documents, HR reports, analytics, applications, competencies, onboarding, tasks, my-tasks, remarks, reminders, legal, password-manager, notifications, audit-trail, company settings, devices, SIM tracker. Capacitor Android wrapper, service worker, update and offline banners. Dev port 3007.

## 15. Deployment

- `main` is production (`deploy-prod.sh`), `dev` is staging (`deploy-staging.sh`). `latest-main` is not described in DEPLOY.md, so its role is unknown **(?)**.
- Prod script: pull, `prisma validate/generate/migrate deploy`, additive SQL, `tsc`, frontend build, `pm2 restart`, health check on port 4000.
- PM2: prod `fasttracks-backend` (4000) and `fasttracks-frontend`; staging `fasttracks-staging-backend` (4001) and `fasttracks-staging-frontend` (3008). Backend must stay a single instance (crons and the transcription queue).
- Azure pilot scripts in `deploy/staging-pilot/` (provision, bootstrap, systemd, nginx, DB backup, disk check). Plan: `docs/azure-staging-pilot-plan.md`.
- Env var groups (names only): core, AI, Azure storage and speech, Exotel, `CALLS_*`, WhatsApp, bot, payments (Cashfree, Paytm, Worldline), mail, shipping, GST, ads and lead desk, devices, Telegram.

## 16. Tests

Vitest in backend and frontend, about 175 test files (bot 42, routes 41, services 18, lib 14, calls 9). Backend tests that touch accounting use a real local Postgres. No React component tests. The Python service has its own tests.

## 17. Gaps

- No aging report on `latest-main`; accounting auto-post only proposed.
- Owner Assistant refuses money questions by design.
- `STAGING_MODE` effect on Exotel calls unconfirmed.
- Cron timezone, prod frontend port, and per-page frontend content not confirmed.
