# Production go-live checklist (DRAFT, nothing here has been run on production)

Written 18 Nov 2026. Everything below is prepared so that only "go live" is left. Items marked **BLOCKED** need a decision or access from someone else.

## 0. Facts that decide the plan

- `dashboard.fasttrackscarcare.in` and `staging.dashboard...` both point at **Hostinger (189.72.151.13)**. The Azure VM (4.224.62.247) forwards every request there (nginx file `xclrt-forward`, "cut-over 12 Nov 2026, Xclrt"). Deploying to Azure alone reaches no user.
- Live commits: production `d504e9ea4edb…`, Hostinger staging `f1816272…`. **Neither commit exists on GitHub** (`git fetch origin <sha>`: "not our ref"). Production runs code that is not in this repo, so its differences, and any database changes it needs, cannot be compared here. **BLOCKED**: ask Vikas or Xclrt what these commits contain and where their source lives. Deploying `main` over them could remove changes that exist only there.
- Azure VM prod pm2 apps (`fasttracks-backend` 4000, `fasttracks-frontend` 3007) crash-loop with `EADDRINUSE`. Something else holds those ports; finding it needs root.

## 1. Ready now (no access needed)

| Item | State |
|---|---|
| Calls commits: `GET /calls/auto-answer-hint` and parallel dial look-ups | Rebased onto `origin/main` as branch `feat/calls-auto-answer-hint` (local only, 2 commits). One conflict (`CALL_ROLES`) resolved: ACCOUNTING role kept, early definition kept. Typecheck passes, 22 calls test files, 341 tests pass. |
| Owner Assistant, accounting auto-post, chat monitoring | Already in `origin/main` (PRs 342, 340, 350). |
| Mobile app v24 (versionCode 21) | On the phone, tagged `v24-working-vc21`. Points at the staging domain. |
| Mobile and dashboard overview docs | `docs/APP_OVERVIEW.md`, `docs/DASHBOARD_BACKEND_OVERVIEW.md` (uncommitted). |

## 2. Steps, in order (after the blocked items are answered)

1. Push `feat/calls-auto-answer-hint`, open the PR into `main`, merge when reviewed.
2. Run the SQL by hand once, before turning the feature on: `backend/prisma/sql/2026-11-17_chat_view_audits.sql` (`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f …`). It is safe to re-run. Also check `backend/prisma/sql/` for any other file newer than what production already ran. **Unknown until the production commit is known.**
3. Deploy `main` with the repo's own script on the chosen server (`deploy-prod.sh`: pull, prisma validate/generate/migrate deploy, tsc, frontend build, pm2 restart, health check on port 4000).
4. Environment names to set or check on the server (values stay on the server, never in chat or git):
   - Auto-answer: `CALLS_C2C_AUTOANSWER_ENABLED=true`, `CALLS_C2C_AUTOANSWER_WINDOW_S`, `CALLS_DIAL_PAD_ENABLED=true`.
   - Owner Assistant: `ANTHROPIC_API_KEY`, `OWNER_ASSISTANT_API_BASE` if the API is not on localhost.
   - Chat monitoring: `CHAT_MONITORING=on`, `WHATSAPP_COEXISTENCE=on` (only when ready), `BOT_OWN_PHONE_NUMBERS` with both company lines (73525 25252 and 80199 65252).
   - Keep `STAGING_MODE` **unset** on production.
5. Check `https://<domain>/api/v1/health`: `gitCommit` must equal the deployed commit, `database: connected`.
6. If Azure becomes the live server: Xclrt removes the nginx forward, the port 4000/3007 holder is found and stopped, the database plan is agreed (same database as the current production, or a copy with a cutover time), and DNS moves last.

## 3. Phone test on production (after step 5)

- Build the app against the production API URL with the EAS profile `production-apk` (internal APK, production URL, dialer module on). Do not use `production` for this test: it has no dialer flag, so the APK would contain no auto-answer code, and it builds an AAB, which cannot be installed directly. `sales-trial` refuses the production URL on purpose, and `preview` now points at staging. Build only when asked.
- Dial a test number: expect the "Calling…" screen, auto-answer of the Exotel leg in about 0.3 s, no second ring.
- Press Call twice quickly and again 2-3 s after a call ends: expect no extra call.
- Open Ask AI as the owner: brief, stuck jobs, absent today. Money questions must be refused.
- Remove the `test_salesman` test user from production when done.

## 4. Rollback

- Backend: `git checkout <previous deployed commit>` (needs that commit's source, see section 0), rebuild, `pm2 restart`. The SQL added here only creates tables and one column, so it needs no rollback.
- App: the previous APK is versionCode 21; reinstall it.

## 5. Not built yet

- **Owner call transfer (1 = Vamsi, 2 = Niketh).** Waiting for Exotel to confirm a supported way to move a live call. Exotel's public Legs API names JoinBridge and LeaveBridge but documents neither the request format nor how to get a leg id for an incoming call. Building against that would be guessing, so nothing is written.
