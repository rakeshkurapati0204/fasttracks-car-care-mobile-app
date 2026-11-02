export interface ScreenMeta {
  id: string;
  title: string;
  dashboardRoute: string;
  purpose: string;
  endpoints: string[];
  note?: string;
  // When set, the More list hides this entry entirely for any other role —
  // not just a backend 403 after tapping in. Used for screens where the
  // dashboard itself never shows the nav item to unauthorized roles either.
  visibleToRoles?: string[];
  // Optional first-class app route this entry should navigate to instead of
  // the generic `/more/:id` stub screen. Added for the side-menu redesign so
  // Tasks/Customers (formerly their own bottom tabs) can live in this same
  // registry-driven menu without going through ScreenStub. Purely a
  // navigation target — does not affect `visibleToRoles` gating.
  route?: string;
  // When set, the menu entry shows only to users who pass that backend access
  // check (resolved by PermissionsProvider from GET /auth/me) instead of by
  // role. For screens whose gate is a per-user grant, not a role list.
  requiresAccess?: 'ads';
}

// Screens reachable from a dedicated bottom tab (attendance, conversations)
// still get a `route` entry below once they moved off the tab bar. Screens
// with no `route` fall back to the generic `/more/:id` stub screen.
export const SCREEN_REGISTRY: ScreenMeta[] = [
  {
    id: 'overview',
    title: 'Overview',
    dashboardRoute: '/dashboard',
    purpose: 'Owner KPI summary — attendance, open jobs, revenue, and a recent-activity feed.',
    endpoints: ['GET /dashboard/overview', 'GET /dashboard/recent-activity'],
    note: 'requireOwner (backend/src/routes/dashboard.ts, verified 2026-09-20) gates every /dashboard/* route — recent-activity, today-snapshot, revenue-by-employee, and overview are all OWNER-only, a static single-role check. Mobile screen calls /dashboard/overview (single-call aggregate: attendance, open jobs by employee, revenue, recent invoices/jobs) plus /dashboard/recent-activity for a feed; today-snapshot and revenue-by-employee cover overlapping ground already surfaced by overview, so they were left out of this pass.',
    visibleToRoles: ['OWNER'],
    route: '/more/overview',
  },
  {
    id: 'customers',
    title: 'Customers & Jobs',
    dashboardRoute: '/dashboard/customers',
    purpose: 'Customer directory and job history.',
    endpoints: ['GET /customers', 'GET /customers/:id'],
    route: '/customers',
  },
  {
    id: 'new-entry',
    title: 'New Entry',
    dashboardRoute: '/dashboard/entry',
    purpose: 'Quick-add form for a new customer/vehicle job intake.',
    endpoints: ['GET /job-cards/lookup', 'POST /job-cards'],
    note: 'CORRECTED 2026-09-28 (re-verification sweep) — the previous note here was stale/false. POST /job-cards and GET /job-cards/lookup (backend/src/routes/job_cards.ts) both call hasCJAccess(user) (role-default or a per-employee customers_jobs permission override), and POST / additionally 403s when the caller\'s customers_jobs mode is view_only — this is a real, non-trivial gate, not "no role gate at all." The mobile screen is now gated with usePermissions().tabMode(\'customers_jobs\') the same way customers/[id].tsx already does (canWrite = mode !== null && mode !== \'view_only\'), showing a blocked message instead of letting an unauthorized user fill out the whole form only to have it 403 on submit. Dashboard\'s full entry form (frontend/src/app/(dashboard)/dashboard/entry/page.tsx) also covers GST/address fields, lead-source tracking, an owner/driver toggle, employee assignment, and inspection photo/video upload; this mobile pass keeps the required fields (customer name, vehicle number, reason for visit) plus the same phone-based existing-customer lookup, and skips photo/video capture and the employee-assignment picker (defaults server-side).',
    route: '/more/new-entry',
  },
  {
    id: 'employees',
    title: 'Employees',
    dashboardRoute: '/dashboard/employees',
    purpose: 'Employee directory with create, edit, deactivate, permanent delete, and password reset.',
    endpoints: [
      'GET /employees', 'GET /employees/:id', 'POST /employees', 'PUT /employees/:id',
      'PATCH /employees/:id/deactivate', 'DELETE /employees/:id/permanent', 'POST /employees/:id/reset-password',
    ],
    note: 'requireManagerOrOwner=[OWNER,STORE_MANAGER,HR,ACCOUNTING,CASHIER] (backend/src/routes/employees.ts, re-verified 2026-09-21) gates GET/POST/PUT/deactivate. Role field OWNER-only; SALARY_EDIT_ROLES=[OWNER,STORE_MANAGER,CASHIER] for salary — both confirmed against the route body, not assumed. DELETE /:id/permanent is narrower than the rest of the file: OWNER-only, checked inline, not requireManagerOrOwner. A STORE_MANAGER editing an OWNER or peer STORE_MANAGER account 403s server-side — handled via getErrorMessage, not predicted client-side. Not covered: GET /:id/analytics and GET /:id/performance-chart (read-only reporting dashboards — a 6-month chart has no charting library in this app yet; deliberately skipped, not silently dropped).',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING', 'CASHIER'],
  },
  {
    id: 'employee-documents',
    title: 'Employee Documents',
    dashboardRoute: '/dashboard/employee-documents',
    purpose: 'Admin directory: view, upload, and delete any employee\'s identity documents.',
    endpoints: ['GET /identity-documents/directory', 'GET /identity-documents/:userId', 'POST /identity-documents/:userId', 'DELETE /identity-documents/file/:id', 'GET /identity-documents/file/:id'],
    note: 'PRIVILEGED_ROLES=[OWNER,HR,STORE_MANAGER] OR a per-employee \'employee_documents\' tab override (usePermissions().hasTab(\'employee_documents\')) gates every route in this file, including the directory list itself (backend/src/routes/identity-documents.ts, re-verified 2026-09-21) — no visibleToRoles set in this registry entry, deliberately, since a role outside PRIVILEGED_ROLES can still be granted access via the override and must still see this menu item. Distinct from Personal Info, which is self-view-only. Built new this pass, reusing src/lib/upload.ts unchanged — no changes were needed to the shared helper for this second call site.',
  },
  {
    id: 'applications',
    title: 'Applications',
    dashboardRoute: '/dashboard/applications',
    purpose: 'Job applicants — list, filter by stage, view details, move through the pipeline.',
    endpoints: ['GET /applications', 'GET /applications/:id', 'PATCH /applications/:id/status'],
    note: 'router.use(verifyToken, requireHROrOwner) = OWNER/STORE_MANAGER/HR/ACCOUNTING (backend/src/routes/applications.ts + middleware/auth.ts) — static role check, visibleToRoles mirrors it. Core subset only: resume view, AI screening/interview/assessment, scheduling, invites and outcome emails are not mirrored. PATCH status to SELECTED creates a candidate record (confirmed in-app first); an already-converted application cannot change status (server 400, surfaced as-is). AI_SCREENING also makes the server email the applicant a verification invite when an email is on file.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'],
    route: '/more/applications',
  },
  {
    id: 'onboarding',
    title: 'Onboarding',
    dashboardRoute: '/dashboard/onboarding',
    purpose: 'Employee onboarding checklists — progress overview and per-task completion.',
    endpoints: ['GET /hr/onboarding', 'GET /hr/onboarding/:userId', 'PATCH /hr/onboarding/task/:taskId'],
    note: 'Entire /hr router is router.use(verifyToken, requireHROrOwner) = OWNER/STORE_MANAGER/HR/ACCOUNTING (backend/src/routes/hr.ts + middleware/auth.ts) — a static role check, so visibleToRoles mirrors it exactly. The checklist PDF (GET /hr/onboarding/:userId/pdf) needs a Bearer header, so it cannot be opened as a plain URL and is not mirrored here.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'],
    route: '/more/onboarding',
  },
  {
    id: 'contacts',
    title: 'Contacts',
    dashboardRoute: '/dashboard/contacts',
    purpose: 'Company-wide contact directory — create, search, edit, and delete.',
    endpoints: ['GET /contacts', 'GET /contacts/:id', 'POST /contacts', 'PATCH /contacts/:id', 'DELETE /contacts/:id'],
    note: 'CONTACTS_DIRECTORY_ROLES=[OWNER,STORE_MANAGER,TECH_TEAM] (requireContactsDirectoryAccess, backend/src/middleware/auth.ts) gates list/detail/create — matches tabRegistry.ts\'s \'contacts\' entry exactly, confirmed against the route, not assumed. PATCH /:id (edit) is open to any authenticated user server-side (verifyToken only, no directory gate on that specific route) but only reachable through this directory-gated screen, so no extra client check was added. DELETE /:id is narrower — CONTACTS_DELETE_ROLES=[OWNER,STORE_MANAGER], no TECH_TEAM — the delete button is hidden for TECH_TEAM accordingly. Built new this pass.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'TECH_TEAM'],
  },
  {
    id: 'competencies',
    title: 'Competencies',
    dashboardRoute: '/dashboard/competencies',
    purpose: 'Per-role competency templates behind AI interviews — view, approve, archive/restore, delete.',
    endpoints: [
      'GET /competency-templates', 'GET /competency-templates/:id', 'POST /competency-templates/:id/approve',
      'POST /competency-templates/:id/archive', 'POST /competency-templates/:id/unarchive', 'DELETE /competency-templates/:id',
    ],
    note: 'router.use(verifyToken, requireHRModuleAccess) (backend/src/routes/competencyTemplates.ts): OWNER/STORE_MANAGER/HR/ACCOUNTING pass on role, anyone else needs the hr_module tab — gated like analytics (static roles, else PermissionGate hr_module; the menu entry is limited to the four roles). ?includeArchived=true returns ONLY archived roles, so the screen has an Active/Archived switch. Archive/unarchive/delete act on the whole role; delete is refused (409) once any interview/assessment used it. Phase 1 only: create, edit, AI suggest/regenerate and version history are not mirrored.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'],
    route: '/more/competencies',
  },
  {
    id: 'onboarding-templates',
    title: 'Onboarding Templates',
    dashboardRoute: '/dashboard/onboarding-templates',
    purpose: 'Role-specific onboarding checklists — create, edit, and AI-suggest tasks per role.',
    endpoints: [
      'GET /onboarding-task-templates', 'GET /onboarding-task-templates/:id', 'POST /onboarding-task-templates',
      'POST /onboarding-task-templates/suggest', 'PATCH /onboarding-task-templates/:id',
    ],
    note: 'router.use(verifyToken, requireHRModuleAccess) (backend/src/routes/onboardingTaskTemplates.ts): OWNER/STORE_MANAGER/HR/ACCOUNTING pass on role, anyone else needs the hr_module tab — gated like analytics and competencies (static roles, else PermissionGate hr_module; the menu entry is limited to the four roles). POST /suggest persists nothing — it returns drafted tasks into the editor and only an explicit Save writes. roleName is immutable after creation (PATCH only replaces tasks); creating a role that already has a template is refused (400).',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'],
    route: '/more/onboarding-templates',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    dashboardRoute: '/dashboard/analytics',
    purpose: 'HR hiring and retention analytics — time-to-hire, rejection funnel, interview scores by role, departure reasons.',
    endpoints: ['GET /analytics/hiring', 'GET /analytics/retention'],
    note: 'router.use(verifyToken, requireHRModuleAccess) (backend/src/routes/analytics.ts): OWNER/STORE_MANAGER/HR/ACCOUNTING pass on role, anyone else needs the hr_module tab. The screen mirrors both (static roles, else PermissionGate hr_module). visibleToRoles lists only the four roles, so the menu entry is hidden from everyone else — an hr_module grantee in another role is still admitted if they open /more/analytics directly. Charts are plain-View bars (no chart library); the dashboard\'s axes/tooltips are not mirrored.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'],
    route: '/more/analytics',
  },
  {
    id: 'audit-trail',
    title: 'Audit Trail',
    dashboardRoute: '/dashboard/audit-trail',
    purpose: 'Read-only Document Access Log (every document view/reveal) and HR Action Log (hiring, discipline, letter decisions).',
    endpoints: ['GET /identity-documents/views', 'GET /action-log'],
    note: 'Both routes are requireHROrOwner = OWNER/STORE_MANAGER/HR/ACCOUNTING (backend/src/routes/identity-documents.ts, actionLog.ts), and the dashboard page is those four roles only with no hr_module override, so visibleToRoles mirrors it exactly. Newest first, capped at 200 rows server-side; from/to are YYYY-MM-DD IST day boundaries. Action Log rows have no revealed-value field — "Revealed Value" is an action filter on the Document Access Log, not a column.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'],
    route: '/more/audit-trail',
  },
  {
    id: 'hr-reports',
    title: 'HR Reports',
    dashboardRoute: '/dashboard/hr-reports',
    purpose: 'Export Hiring, Onboarding, Attendance or Discipline data for a date range as PDF or Excel.',
    endpoints: ['GET /hr-reports/hiring', 'GET /hr-reports/onboarding', 'GET /hr-reports/attendance', 'GET /hr-reports/discipline'],
    note: 'router.use(verifyToken, requireHROrOwner) = OWNER/STORE_MANAGER/HR/ACCOUNTING (backend/src/routes/hrReports.ts + middleware/auth.ts) — a static role check with no hr_module override (the dashboard page is roles-only too), so visibleToRoles mirrors it exactly. from/to are YYYY-MM-DD (not ISO timestamps), from <= to, format=pdf|excel. Files are downloaded with the Bearer token to the cache, then opened via the share sheet; a non-2xx response is read for its JSON error and never saved as a file.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'],
    route: '/more/hr-reports',
  },
  {
    id: 'attendance',
    title: 'Attendance',
    dashboardRoute: '/dashboard/attendance',
    purpose: 'Full self-attendance history — today, monthly calendar, late records, warnings. Read-only.',
    endpoints: ['GET /attendance/today', 'GET /attendance/monthly', 'GET /attendance/late-records', 'GET /attendance/warnings'],
    note: 'All four routes are gated by verifyToken alone, self-scoped by JWT userId when no manager-only ?userId= override is sent (backend/src/routes/attendance.ts, verified 2026-09-20) — any authenticated role. This is a self-view module distinct from the partial widget already on the Home screen. A full manager surface (bulk-mark, register grid, CSV import, override) was built separately on 2026-09-26 as the "All Employees" tab of the same Attendance screen (src/components/attendance/admin-attendance.tsx) — the override/pardon 500 this note used to warn about (missing AttendanceEditLog Prisma model) was a real, confirmed production bug, fixed and deployed 2026-09-27 (commit 41b8cba). The register endpoint\'s editedBy enrichment still has a separate, smaller, deliberately-deferred gap — see KNOWN_ISSUE_attendance_edit_log_relation.md in the dashboard repo.',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    dashboardRoute: '/dashboard/my-tasks',
    purpose: 'Daily standing tasks + assigned tasks — admin assign/edit/delete, reply threads.',
    endpoints: ['GET /tasks', 'GET /tasks/:id', 'POST /tasks', 'PATCH /tasks/:id', 'PATCH /tasks/:id/status', 'DELETE /tasks/:id', 'POST /tasks/:id/reply', 'GET /recurring-tasks/my-current', 'PATCH /recurring-tasks/:id/complete'],
    note: 'Rebuilt 2026-09-27 for full dashboard parity — the previous screen was a stripped single-role view with a Start/Ongoing/Complete flow the dashboard\'s current my-tasks page doesn\'t even expose. Now: Daily Tasks + Assigned Tasks sections, admin (OWNER/STORE_MANAGER) assignee filter + assign/edit/delete + create modal, single-tap PENDING<->COMPLETED gated to the assignee, reply threads on tasks sourced from a work-doc note or timesheet entry.',
    route: '/tasks',
  },
  {
    id: 'my-salary',
    title: 'My Salary',
    dashboardRoute: '/dashboard/my-salary',
    purpose: 'Own salary summary, overtime, and late records.',
    endpoints: ['payrollAPI', 'GET /overtime/my', 'GET /attendance/late-records'],
    note: 'Rebuilt 2026-09-27 for full dashboard parity (hero card, current-month breakdown with an explicit fetchFailed banner, overtime/warnings cards, late-arrival penalty severity, and a 6-month Salary History section that did not exist on mobile before at all). Found and fixed a real pre-existing bug while wiring this up: GET /payroll/calculate requires userId explicitly for OWNER/STORE_MANAGER/CASHIER (SALARY_ADMIN_ROLES) — it only auto-substitutes the caller\'s own id for every other role (backend/src/routes/payroll.ts:22-27) — so any manager viewing their own My Salary got a silent 400 before this fetchMyPayroll now always passes it.',
  },
  {
    id: 'my-payslips',
    title: 'My Payslips',
    dashboardRoute: '/dashboard/my-payslips',
    purpose: 'Self-view: list your own issued payslips and download the PDF.',
    endpoints: ['GET /payslips/mine', 'GET /payslips/:id/pdf'],
    note: 'New this pass (2026-09-27) — this menu entry and screen did not exist on mobile at all; only the admin-only generate-a-payslip screen (id \'payslips\' below) was built. Both endpoints are open to any authenticated user, scoped to their own payslips server-side (canAccessPayslip) — no role gate, unlike \'payslips\'.',
    route: '/more/my-payslips',
  },
  {
    id: 'my-finance',
    title: 'My Finance',
    dashboardRoute: '/dashboard/my-finance',
    purpose: 'Request and track your own salary advances, including the repayment schedule.',
    endpoints: ['GET /loans', 'POST /loans', 'GET /loans/:id/repayments'],
    note: 'Self-view only — GET /loans scopes to the requester\'s own userId server-side. Corrected 2026-09-21: a prior note here claimed "Advances was removed from the product entirely" and listed a nonexistent GET/POST /advances endpoint. That was wrong — there is no separate Advance model/route; backend/src/routes/loans.ts IS the Advance feature (the dashboard\'s My Finance page calls this exact /loans API and labels every part of its UI "Advance"; "Loan" is only the Prisma model\'s internal name). The request form was also rebuilt to send repaymentMode/tenureMonths (what the dashboard\'s real form sends) instead of the deprecated monthlyDeductionPercent-only legacy path, and a repayment-schedule view (GET /loans/:id/repayments, previously wrapped in api.ts as fetchLoanRepayments but never called from any screen) was added. Admin approve/reject queue (finance-approvals) remains out of scope.',
  },
  {
    id: 'leave-requests',
    title: 'Leave Requests',
    dashboardRoute: '/dashboard/leave-requests',
    purpose: 'Submit leave; OWNER/STORE_MANAGER/HR additionally see, filter by status, and decide the queue with a typed rejection reason.',
    endpoints: ['GET /attendance/leave-requests?status=', 'POST /attendance/leave-request', 'PUT /attendance/leave-requests/:id'],
    note: 'Approval view gated to LEAVE_APPROVER_ROLES=[OWNER,STORE_MANAGER,HR] (backend/src/lib/leaveRoles.ts, verified 2026-09-21) — identical role set to PUT /leave-requests/:id\'s requireHROrOwner gate, confirmed byte-for-byte equal, so no divergence despite the different middleware name. Distinct from the broader attendance MANAGER_ROLES which can see but not act on the queue. Screen itself is visible to everyone (self-submit); the approval section and status tabs (Pending/Approved/Rejected/All) render only for approver roles. Reject now requires a typed reason (mirrors the dashboard\'s RejectModal and the backend\'s required rejectionReason), replacing a previous hardcoded "Not approved." string.',
  },
  {
    id: 'accounting',
    title: 'Purchase',
    dashboardRoute: '/dashboard/accounting',
    purpose: 'Ledger list with balances, read-only.',
    endpoints: ['GET /accounting/ledgers'],
    note: 'ACC_ROLES=[OWNER,STORE_MANAGER,ACCOUNTING,CASHIER,INVENTORY_MANAGER] (backend/src/routes/accounting.ts, verified 2026-09-19) — a hardcoded per-file array by design, deliberately NOT the getTabAccess permission system per that file\'s own comment (fail-open risk on money-handling routes). Read-only — no voucher posting/cancel/allocate actions.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'ACCOUNTING', 'CASHIER', 'INVENTORY_MANAGER'],
  },
  {
    id: 'personal-info',
    title: 'Personal Info',
    dashboardRoute: '/dashboard/personal-info',
    purpose: 'View your own profile and identity documents; add/remove your own documents if privileged.',
    endpoints: [
      'GET /auth/me',
      'GET /identity-documents/:userId',
      'POST /identity-documents/:userId',
      'DELETE /identity-documents/file/:id',
      'GET /identity-documents/file/:id',
    ],
    note: 'Corrected 2026-09-21: viewing is self OR PRIVILEGED_ROLES=[OWNER,HR,STORE_MANAGER] per canViewIdentityDocsFor, as before — this screen only ever requests the signed-in user\'s own id. But upload/delete are NOT self-accessible on the backend at all (requireHROrOwnerOrDocsOverride has no self exception — "an employee can view their own documents but not add or remove them"); the previous note here was wrong to describe this as a self-gate. Upload/delete controls now render only for PRIVILEGED_ROLES OR a per-employee \'employee_documents\' tab override (usePermissions().hasTab(\'employee_documents\') — a plain boolean tab in TAB_REGISTRY with no admin-bypass special-casing inside getTabAccess, so no resolution-divergence risk), and always operate on the caller\'s OWN documents only via this screen — managing another employee\'s documents remains the separate Employee Documents admin page, not built here. Upload uses the shared src/lib/upload.ts helper (camera or gallery, preview, progress, retry, cancel), matching the backend multer config exactly (field \'file\'; jpeg/png/webp/pdf only — no gif/heic, narrower than work-docs; 10MB). Not covered: GET /identity-documents/directory and GET /identity-documents/file/:id/views (both Employee Documents admin-page concerns, out of scope for a self-view screen).',
  },
  {
    id: 'finance-approvals',
    title: 'Finance Approvals',
    dashboardRoute: '/dashboard/finance-approvals',
    purpose: 'Admin advance/loan queue: approve/reject pending requests, plus a second tab of active advances with running balances and repayment history.',
    endpoints: ['GET /loans', 'PATCH /loans/:id/approve', 'PATCH /loans/:id/reject', 'GET /loans/:id/repayments'],
    note: 'List: ADMIN_ROLES=[OWNER,STORE_MANAGER,CASHIER]; approve/reject: narrower [OWNER,STORE_MANAGER] with a self-approval / peer-STORE_MANAGER block (backend/src/routes/loans.ts, re-verified 2026-09-21). CORRECTED 2026-09-21: the previous note here, "Advances was removed from the product entirely," was wrong — confirmed via the dashboard\'s own finance-approvals page, which has exactly two tabs ("loans" = this queue, "active" = the tab added here) both reading this same /loans data; there is no separate Advance model or route, and every part of the dashboard UI actually calls this feature "Advance." The "Active advances" tab is a client-side filter (APPROVED + remainingAmount > 0) of the same already-fetched list, matching how the dashboard itself splits it — no new endpoint.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'CASHIER'],
  },
  {
    id: 'overtime',
    title: 'Overtime',
    dashboardRoute: '/dashboard/overtime',
    purpose: 'Request overtime, track approval status, and log actual hours worked once approved.',
    endpoints: ['GET /overtime/my', 'POST /overtime', 'PATCH /overtime/:id/actual-hours'],
    note: 'Self-view only — GET /overtime/my is scoped by JWT userId server-side, not a spoofable param. No role gate needed server-side. Re-verified 2026-09-21: added the actual-hours action, which was in api.ts-shaped backend surface but had no UI control before this pass. visibleToRoles added 2026-09-24 (dashboard-sidebar parity check): the dashboard\'s own Overtime nav item omits OWNER from its `roles` array (frontend/src/components/layout/Sidebar.tsx) — an owner approves overtime, they don\'t submit their own — so this entry is hidden from OWNER here too, to match. Not a security boundary (the backend genuinely has no role gate on this data), purely mirroring what the dashboard chooses to show.',
    visibleToRoles: ['STORE_MANAGER', 'SALES', 'TECHNICIAN', 'TECH_TEAM', 'SOCIAL_MEDIA', 'STAFF', 'INVENTORY_MANAGER', 'ACCOUNTING', 'CASHIER', 'HR', 'HOUSEKEEPING'],
  },
  {
    id: 'overtime-approval',
    title: 'Overtime Approval',
    dashboardRoute: '/dashboard/overtime',
    purpose: 'Pending overtime approval queue with approve/reject actions.',
    endpoints: ['GET /overtime/pending', 'PATCH /overtime/:id/approve', 'PATCH /overtime/:id/reject'],
    note: 'requireManagerOrOwner=[OWNER,STORE_MANAGER,HR,ACCOUNTING,CASHIER] (backend/src/routes/overtime.ts, verified 2026-09-19). Distinct from the self-scoped overtime screen.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING', 'CASHIER'],
  },
  {
    id: 'payroll',
    title: 'Payroll',
    dashboardRoute: '/dashboard/payroll',
    purpose: 'Company-wide payroll summary, export, salary overrides, and disbursement with confirm-payment/undo.',
    endpoints: [
      'GET /payroll/all', 'GET /payroll/export', 'POST/DELETE /payroll/override', 'GET /payroll/disbursement/:year/:month',
      'POST /payroll/disbursement', 'DELETE /payroll/salary-payment',
    ],
    note: 'SALARY_ADMIN_ROLES=[OWNER,STORE_MANAGER,CASHIER] (backend/src/routes/payroll.ts, re-verified 2026-09-21) — checked either via requirePayrollAccess middleware or inline in every sensitive handler in that file. Non-admin roles are forced to their own userId by GET /calculate; this screen is the admin-only company view (see My Salary for self-view). Delta found and filled 2026-09-21: the Disbursement section was view-only — no way to actually confirm a payment. Added Confirm Payment (POST /payroll/disbursement, the same endpoint the dashboard\'s own createDisbursement action uses — NOT the simpler POST /payroll/salary-payment, which api.ts already wrapped as recordSalaryPayment but which the dashboard itself never calls) and Undo (DELETE /payroll/salary-payment). Money-specific: the company-summary section now shows a Retry button instead of an indefinite spinner when the fetch fails, rather than a state that looked like "still loading" forever.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'CASHIER'],
  },
  {
    id: 'incentives',
    title: 'Incentives',
    dashboardRoute: '/dashboard/incentives',
    purpose: 'Incentive roster with per-month amounts, plus a per-employee ledger (credits/payouts/balance) for Cashier/Owner.',
    endpoints: [
      'GET /incentives', 'POST /incentives/targets', 'PUT /incentives/:userId', 'GET /incentives/:userId/history',
      'GET /incentives/:userId/ledger', 'POST /incentives/credits', 'PATCH /incentives/credits/:id', 'POST /incentives/payouts',
    ],
    note: 'Reads (roster, ledger, history): requireManagerOrOwner=[OWNER,STORE_MANAGER,HR,ACCOUNTING,CASHIER]. Writes (targets, PUT amount, credits, edit credit, payouts): requireCashierOrOwner=[CASHIER,OWNER] only — verified per-route individually against backend/src/routes/incentives.ts, not assumed as one blanket gate; every write route in this file happens to use the same pair. Full dashboard parity pass 2026-09-27: merged ledger feed (credits +/payouts − sorted newest-first, "edited" badge + per-credit history trail via PATCH /credits/:id\'s audit rows), pre-ledger history section (legacy per-month IncentivePayment data via GET /:userId/history), Add Person search box, and Mark Paid/Record Payout disabled with "Nothing to pay" when balance <= 0 — all previously missing, now closed.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING', 'CASHIER'],
  },
  {
    id: 'payslips',
    title: 'Payslips',
    dashboardRoute: '/dashboard/payslips',
    purpose: 'Generate formal payslip documents.',
    endpoints: ['GET /payslips/prefill', 'POST /payslips', 'GET /payslips/:id', 'GET /payslips/:id/pdf'],
    note: 'Full salary breakdown, editable earnings/deductions rows before saving. Corrected 2026-09-28: there is no router-level gate on backend/src/routes/payslips.ts (router.use(verifyToken) only) — each route self-gates via PAYSLIP_ADMIN_ROLES = SALARY_ADMIN_ROLES + \'HR\' = [OWNER,STORE_MANAGER,CASHIER,HR], a hardcoded array distinct from plain SALARY_ADMIN_ROLES (HR was removed from payroll export/disbursement but re-added here for payslips only). Mobile previously omitted HR from its role list, incorrectly blocking a role the dashboard allows — fixed.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'CASHIER', 'HR'],
  },
  {
    id: 'financial',
    title: 'Financial',
    dashboardRoute: '/dashboard/financial',
    purpose: 'Executive "Current Finances" dashboard — KPIs, outstanding, top customers, revenue breakdown, growth, and Customer Spend Slabs.',
    endpoints: [
      'GET /financial/overview', 'GET /financial/outstanding', 'GET /financial/top-customers',
      'GET /financial/revenue-breakdown', 'GET /financial/growth',
      'GET /financial/customer-slabs', 'GET /financial/customer-slabs/customers',
    ],
    note: 'requireManagerOrOwner=[OWNER,STORE_MANAGER,HR,ACCOUNTING,CASHIER] gates every /financial/* route EXCEPT the two Customer Spend Slabs routes, which use a narrower requireRoles(OWNER,STORE_MANAGER) (backend/src/routes/financial.ts, re-verified 2026-09-28) — gated separately in-screen via SLAB_ROLES, not folded into VIEW_ROLES. Full-parity pass 2026-09-28: added period pills (Today/Week/Month/Year/All, driving Breakdown + Slabs same as dashboard), 4 Breakdown groupBy tabs (service/employee/brand/payment_mode — was service-only), overdue badge coloring on Outstanding, and the entire Customer Spend Slabs section (4 slab cards, per-slab customer modal with search + CSV export) which was completely missing before. Also fixed a real bug: TopCustomerEntry read a nonexistent `jobCount` field — the actual API field is `invoiceCount`. Revenue Trend chart and the pie/bar chart visuals stay a scrollable-list equivalent (no charting library installed) — a legitimate substitute for chart-shaped data, not a missing feature.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING', 'CASHIER'],
  },
  {
    id: 'legal',
    title: 'Legal Documents',
    dashboardRoute: '/dashboard/legal',
    purpose: 'Legal case list and per-case document metadata.',
    endpoints: ['GET /legal/cases', 'GET /legal/cases/:id/documents'],
    note: 'requireLegalAccess=hasLegalAccess(user) (backend/src/middleware/auth.ts + legal_route.ts, verified 2026-09-19) is a dynamic per-user check against a LegalAccessConfig row (an owner userId + one optional granted-seat userId), deny-by-default if no row exists — NOT role-based, same category as CRM/Invoices. Left visible with no visibleToRoles restriction; screen handles a 403 via getErrorMessage. Read-only — no case create/edit, no document upload, and does not call the file-streaming endpoint (GET /legal/documents/:documentId/file), the most sensitive data in the app.',
  },
  {
    id: 'meta-ads',
    title: 'Meta Ads',
    dashboardRoute: '/dashboard/ads',
    purpose: 'Meta ad spend, lead flow, ad performance, lead list with filters, daily report and team follow-through.',
    endpoints: [
      'GET /ads/daily', 'GET /ads/running', 'GET /ads/lead-list', 'GET /ads/follow-through', 'POST /ads/refresh',
    ],
    note: 'requireAdsAccess (backend/src/middleware/auth.ts hasAdsAccess): OWNER, or an explicit `ads` grant in Configure — NOT a role list, so there is no visibleToRoles; the menu entry uses requiresAccess:\'ads\' and the screen both read hasAdsAccess from GET /auth/me (PermissionsProvider), fail-closed. Mirrors the dashboard page exactly: five tabs (Overview, Ads & campaigns, All leads, Daily report, Team activity), a Today / 7 / 30 / All-time range (days, default 90, server cap 90) — not a from/to picker — and Refresh (POST /ads/refresh, 60s server cooldown). The dashboard does not use GET /ads/summary, /by-campaign, /leads, /today or POST /ads/sync (owner-only), so neither does this screen. Totals are server aggregates; no ROAS/revenue is shown because none is reconciled.',
    requiresAccess: 'ads',
    route: '/more/meta-ads',
  },
  {
    id: 'pipeline',
    title: 'Job Tracker',
    dashboardRoute: '/dashboard/pipeline',
    purpose: 'Job Tracker: one column per job status, search and staff / priority filters, move a job between stages.',
    endpoints: ['GET /jobs/pipeline', 'GET /employees/assignable', 'PUT /jobs/:id/status'],
    note: 'Mirrors the dashboard page: the "still under test" banner, search + staff + priority filters, the seven columns in the dashboard order and colours (New Enquiry, Quoted, Confirmed, In Progress, Completed, Follow-up Needed, Cancelled) with count and total value, and the same job card. Access is the dashboard rule (OWNER or the job_tracker permission); GET /jobs/pipeline additionally needs requireManagerOrOwner, so a 403 shows the same no-access message. The dashboard drags cards between columns; on a phone each card has a Move to… sheet that calls the same PUT /jobs/:id/status, shown only to OWNER / STORE_MANAGER (the roles that pass both this screen and requireJobAccess). Tapping a card opens /customers/job/<id>. Wide screens show the columns side by side; a phone shows a status selector and one column.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'CASHIER'],
  },
  {
    id: 'agents',
    title: 'AI Agents',
    dashboardRoute: '/dashboard/agents',
    purpose: 'AI Agents: shows the same "Coming soon" screen as the dashboard.',
    endpoints: [],
    note: 'The dashboard AgentsPage currently returns <ComingSoon /> (the agent cards, toggles and activity feed in that file are unreachable and no Run now button is drawn), so this screen shows the same Coming soon screen, behind the same rule: OWNER, STORE_MANAGER, or the ai_agents permission. It calls no /agents route. GET /agents, GET /agents/activity, POST /agents/trigger/* and PATCH|PUT /agents/:agentName/toggle all exist (requireManagerOrOwner) but the trigger and toggle routes fire live webhooks with customer-facing effects, so they stay unreachable from the app until the dashboard turns the page on.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER'],
  },
  {
    id: 'calls',
    title: 'Calls',
    dashboardRoute: '/dashboard/calls',
    purpose: 'Call log and own recording summary, metadata only.',
    endpoints: ['GET /calls', 'GET /call-recordings/my-summary'],
    note: 'CALL_ROLES=[OWNER,STORE_MANAGER,SALES] gates both GET /calls and /call-recordings/my-summary (backend/src/routes/calls.ts + callRecordings.ts, verified 2026-09-19). Full recording listen/download (requireFullRecordingAccess) is narrower — OWNER/STORE_MANAGER only; SALES never gets a usable recording id from the /calls list per that file\'s own comment. No in-app audio player — expo-av/equivalent is not installed (checked package.json), and adding one needs a native rebuild; screen shows metadata only, no playback or download.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'SALES'],
  },
  {
    id: 'call-tracker',
    title: 'Call Tracker',
    dashboardRoute: '',
    purpose: 'Owner-only call report: masked numbers, recording, transcript and summary status per call.',
    endpoints: [],
    note: 'App-only screen with no dashboard page. Runs on sample data (src/lib/call-tracker.ts) until a backend API exists. OWNER only, since call recordings are for the founder.',
    visibleToRoles: ['OWNER'],
    route: '/more/call-tracker',
  },
  {
    id: 'inventory',
    title: 'Inventory',
    dashboardRoute: '/dashboard/inventory',
    purpose: 'Searchable inventory item list with stock and pricing.',
    endpoints: ['GET /inventory-items'],
    note: 'GET /inventory-items only requires router.use(verifyToken) — any authenticated role, not a static list (backend/src/routes/inventory_items_route.ts, verified 2026-09-19); writes are gated by INVENTORY_WRITE_ROLES=[OWNER,STORE_MANAGER,INVENTORY_MANAGER] or the dynamic per-user "inventory" tab permission. A DIFFERENT, older resource — backend/src/routes/inventory.ts — is statically gated to the same three roles for both read and write; this screen targets /inventory-items since that\'s the one the live permission-mode system governs. visibleToRoles below is a product choice to hide stock/cost data from non-manager phones, not the real backend boundary. Barcode scanning (named in the original plan) is out of scope this pass — no camera/scanner package installed (only expo-image-picker); adding one needs a native rebuild.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'INVENTORY_MANAGER'],
  },
  {
    id: 'accounts',
    title: 'Accounts',
    dashboardRoute: '/dashboard/accounts',
    purpose: 'Bank account list — masked account numbers and balances only.',
    endpoints: ['GET /accounts/bank'],
    note: 'canAccess=requireRoles(OWNER,ACCOUNTING) (backend/src/routes/accounts_route.ts, verified 2026-09-19); /email-check/all is OWNER-only, not used here. Genuinely new — no prior accounts.tsx existed. Server pre-masks accountNumber in every response; this screen never calls GET /accounts/bank/:id/reveal (the only endpoint returning the unmasked number) — deliberately out of scope. No account field is ever logged.',
    visibleToRoles: ['OWNER', 'ACCOUNTING'],
  },
  {
    id: 'erp-finance',
    title: 'ERP Finance',
    dashboardRoute: '/dashboard/finance',
    purpose: 'Executive KPI summary (revenue/profit/orders) plus a paginated order list. Read-only.',
    endpoints: ['GET /erp/finance/overview', 'GET /erp/finance/orders'],
    note: "canAccess=requireRoles('OWNER','STORE_MANAGER','ACCOUNTING') — a static role gate applied via a shared `canAccess` const near the top of backend/src/routes/erp-finance.ts (verified 2026-09-20), unlike CRM/Invoices/Legal's dynamic per-user gates. The file's heavy `(prisma as any)` casts are untyped access to models that DO exist in schema.prisma (HistoricalDailySummary, HistoricalSalesRecord, FinanceEntry) — not a missing-model blocker like attendance's attendanceEditLog. Covers /overview and /orders only; /sales-performance, /services, and /customers report endpoints are deferred to keep this a summary+list screen, not a report/export builder.",
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'ACCOUNTING'],
  },
  {
    id: 'expenses',
    title: 'Expenses',
    dashboardRoute: '/dashboard/expenses',
    purpose: 'Submit, review, and track expenses.',
    endpoints: ['POST /expenses', 'POST /expenses/extract', 'GET /expenses', 'PATCH /expenses/:id/approve'],
  },
  {
    id: 'team-chat',
    title: 'Team Chat',
    dashboardRoute: '/dashboard/tasks',
    purpose: 'Internal 1:1/group chat — channel list, thread view, send message.',
    endpoints: ['GET/POST /team-chat', 'GET /team-chat/:id/messages', 'POST /team-chat/:id/messages', 'POST /team-chat/:id/read', 'GET /team-chat/employees'],
    note: 'Self-membership-scoped — GET/POST /team-chat/:id/messages 403s a non-member server-side (backend/src/routes/team_chat_route.ts, verified 2026-09-19); no elevated role gate, any authenticated user.',
  },
  {
    id: 'password-manager',
    title: 'Password Manager',
    dashboardRoute: '/dashboard/password-manager',
    purpose: 'Securely store passwords and payment cards — masked in lists, revealed on demand, copy, edit, delete.',
    endpoints: [
      'GET/POST /passwords', 'GET /passwords/:id/reveal', 'PUT/DELETE /passwords/:id',
      'GET/POST /cards', 'GET /cards/:id/reveal-number', 'GET /cards/:id/reveal-cvv', 'PUT/DELETE /cards/:id',
    ],
    note: 'Both routers are requireRoles(OWNER, STORE_MANAGER, INVENTORY_MANAGER) (backend/src/routes/passwords.ts, cards.ts) — a static role check, so visibleToRoles mirrors it exactly. Rows are also scoped server-side: OWNER sees all, STORE_MANAGER everything not added by an OWNER, INVENTORY_MANAGER only their own; the same rule (canManage) decides who sees Edit/Delete/Reveal. Lists are masked; real passwords/card numbers/CVVs are fetched only on a Reveal tap, held in memory for 30s, and cleared on background/close — never logged or stored.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'INVENTORY_MANAGER'],
    route: '/more/password-manager',
  },
  {
    id: 'quotations',
    title: 'Quotations',
    dashboardRoute: '/dashboard/quotations',
    purpose: 'Quotation list with detail (line items, GST breakdown, status) and cancel, read-only otherwise.',
    endpoints: ['GET /quotations', 'GET /quotations/:id', 'PATCH /quotations/:id/cancel'],
    note: 'Built 2026-09-23 — was one of the 4 originally MISSING modules in MOBILE_PARITY_AUDIT_2026-09-21.md. Access via canAccessQuotations (backend/src/routes/quotationRoutes.ts): ADMIN_ROLES=[OWNER,STORE_MANAGER,ACCOUNTING] see every quotation; any other role needs an explicit per-employee \'quotations\' permission override (getTabAccess, same dynamic pattern as invoices/CRM), in which case they see only their own created quotations. Not predictable from role alone, so left visible with no visibleToRoles restriction, matching the invoices/customers precedent — a denied fetch surfaces as a normal error. Read-only + cancel only, matching the invoices.tsx precedent exactly: quotationRoutes.ts is a full line-item-wizard document-CRUD surface (GST calc, discount modes, per-line rates) and replicating that wizard is out of scope for this pass, the same call already made for invoices/purchasing/ERP sales. Cancel (PATCH /:id/cancel → sets status REJECTED) is ADMIN_ROLES-only and is the one write action included, since it\'s a single-field admin action outside the wizard.',
  },
  {
    id: 'invoices',
    title: 'Sales Invoices',
    dashboardRoute: '/dashboard/invoices',
    purpose: 'Invoice list with detail (totals, tax, payment status), read-only.',
    endpoints: ['GET /invoices', 'GET /invoices/:id'],
    note: 'GET /invoices is gated by getInvoiceMode (backend/src/routes/invoiceRoutes.ts), NOT a static role list: ADMIN_ROLES=[OWNER,STORE_MANAGER,ACCOUNTING] always get full_access; any other role can also see it (their own created invoices only) if an admin granted the dynamic "invoices" tab permission — same dynamic-permission pattern as CRM\'s customers_jobs (verified 2026-09-19). Already server-side paginated (skip/take, capped 200) — reused as-is, no new endpoint needed. Left visible with no visibleToRoles restriction (like the existing `customers` entry) since access isn\'t predictable from role alone; screen handles a 403 via getErrorMessage. Read-only — no mark-paid/waybill/whatsapp actions (invoice_actions_route.ts, ADMIN_ROLES=[OWNER,STORE_MANAGER], out of scope).',
  },
  {
    id: 'devices',
    title: 'Devices',
    dashboardRoute: '/dashboard/devices',
    purpose: 'MDM device list, alerts, location/app-usage history, and per-role app policy viewer.',
    endpoints: ['GET /devices', 'GET /devices/alerts', 'GET /devices/:id/location-logs', 'GET /devices/:id/app-usage', 'GET /devices/policies/:role'],
    note: 'MDM_ADMIN_ROLES=[OWNER,STORE_MANAGER,HR] (backend/src/routes/devices.ts, verified 2026-09-19) gates every route this screen calls. Policy create/delete (POST/DELETE /devices/policies) is OWNER-only and out of scope. Deliberately read-only — no enrollment, remote lock/wipe, or policy push/edit (lockDevice/unlockDevice already existed in api.ts from earlier work but are unused by this screen); those need real MDM SDK integration on the mobile side, out of scope for this pass.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR'],
  },
  {
    id: 'sim-tracker',
    title: 'SIM Tracker',
    dashboardRoute: '/dashboard/sim-tracker',
    purpose: 'SIM card inventory stats and list.',
    endpoints: ['GET /sims/stats', 'GET /sims'],
    note: 'GET /sims and GET /sims/stats (backend/src/routes/simRoutes.ts, verified 2026-09-19) are open to any authenticated user; POST/PUT are gated to ADMIN_ROLES=[OWNER,STORE_MANAGER]. Read-only in this pass — no add/edit form.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER'],
  },
  {
    id: 'settings',
    title: 'Company Settings',
    dashboardRoute: '/dashboard/settings',
    purpose: 'Company/supplier letterhead settings (GST, address, contact info).',
    endpoints: ['GET /settings/supplier', 'PUT /settings/supplier'],
    note: 'GET /settings/supplier (backend/src/routes/settings_route.ts, verified 2026-09-19) is open to any authenticated user; PUT is gated to ADMIN_ROLES=[OWNER,STORE_MANAGER]. Only configures the single SupplierSettings row — no other settings exist on this route. Read view for everyone in the More menu; edit form gated client-side to the two admin roles as defense in depth.',
  },
  {
    id: 'timesheets-manager',
    title: 'All Timesheets',
    dashboardRoute: '/dashboard/timesheets',
    purpose: 'Manager register of every employee\'s timesheets, drilling into a single day for approve/reject, replies, follow-up tasks, attachments, and contact linking.',
    endpoints: [
      'GET /timesheets/register', 'GET /timesheets/:id', 'PATCH /timesheets/:id/approve', 'PATCH /timesheets/:id/reject',
      'POST /timesheets/:id/entries/:entryId/reply', 'POST /timesheets/:id/entries/:entryId/assign-task',
      'POST /timesheets/:id/entries/:entryId/attachments', 'GET /timesheets/attachments/:id/file', 'DELETE /timesheets/attachments/:id',
      'POST /timesheets/:id/entries/:entryId/contacts', 'DELETE /timesheets/entry-contacts/:linkId',
    ],
    note: 'requireManagerOrOwner=[OWNER,STORE_MANAGER,HR,ACCOUNTING,CASHIER] (backend/src/middleware/auth.ts:83, re-verified 2026-09-21) gates GET /timesheets/register. Approve/reject and Assign Task are narrower — a local MANAGER_ROLES=[OWNER,STORE_MANAGER] const in timesheets.ts, confirmed by reading each route body, not assumed from the wider register gate. Reply and attachments use canAccessTimesheet (the timesheet\'s own employee OR any MANAGER_ROLES member) — always satisfied here since this whole screen requires a manager role already. BUG FIXED 2026-09-21: rejectTimesheet sent no request body, but PATCH /:id/reject requires a non-empty `notes` rejection reason server-side — every call would have 400\'d; now takes the reason as a required parameter. Attachment upload reuses src/lib/upload.ts unchanged. The 409 "confirm to link an existing contact" revive flow the dashboard has is NOT implemented here — a 409 surfaces as a plain error asking for a different number rather than offering to link the existing contact; flagged as a known gap, not silently dropped. Distinct from the self-scoped my-timesheet screen.',
    visibleToRoles: ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING', 'CASHIER'],
  },
  {
    id: 'remarks',
    title: 'Remarks',
    dashboardRoute: '/dashboard/remarks',
    purpose: 'Owner rates/notes on employees; every employee sees a read-only "my remarks" view with reply.',
    endpoints: ['GET/POST /remarks', 'PATCH/DELETE /remarks/:id', 'GET /remarks/mine', 'POST /remarks/:id/reply'],
    note: 'POST/GET /remarks and PATCH/DELETE /remarks/:id are requireOwner (backend/src/routes/remarks.ts, verified 2026-09-20). GET /remarks/mine is verifyToken only, self-scoped server-side to the caller\'s own VISIBLE_TO_EMPLOYEE rows (employeeId always comes from the JWT). POST /remarks/:id/reply is also verifyToken only — OWNER may reply to any remark, the remark\'s own subject may reply only when it is VISIBLE_TO_EMPLOYEE, both enforced server-side. Role-dependent screen (like customers/invoices/crm/legal in this registry) — no visibleToRoles; the screen itself renders the OWNER management UI or the self read-only view based on useAuth().user.role.',
    route: '/more/remarks',
  },
  {
    id: 'reminders',
    title: 'Reminders',
    dashboardRoute: '/dashboard/reminders',
    purpose: 'Personal reminders — snooze, acknowledge, mark done.',
    endpoints: ['GET/POST /reminders/definitions', 'GET /reminders/mine', 'POST /reminders/occurrences/:id/ack'],
  },
  {
    id: 'my-timesheet',
    title: 'My Timesheet',
    dashboardRoute: '/dashboard/timesheet',
    purpose: 'Own timesheet entries — customer tagging, attachments with camera/gallery upload and delete.',
    endpoints: [
      'GET/POST /timesheets',
      'PATCH /timesheets/:id/submit',
      'GET/POST /work-docs/timesheet/:id',
      'POST /work-docs/:id/files',
      'DELETE /work-docs/:id/files/:fileId',
    ],
    note: 'Attachments/notes section calls /work-docs, whose whole router is blocked server-side for BLOCKED_ROLES=[TECHNICIAN,STAFF] (re-verified 2026-09-21 by reading router.use(verifyToken, (req,res,next)=>{...}) at the top of the file — applies to every route, no per-route exception); the screen hides that section for those roles instead of letting it 403. This gate was not touched in this pass. Re-verified 2026-09-21: upload now goes through the shared src/lib/upload.ts helper (camera or gallery, local preview, visible progress, retry, cancel), matches the backend multer config exactly (field \'file\'; jpeg/png/webp/gif/heic/pdf/doc/docx/xls/xlsx; 20MB), and file deletion (DELETE /work-docs/:id/files/:fileId, previously missing from api.ts entirely despite the dashboard having it) was added with a confirmation dialog. Not covered: /work-docs/search (OWNER/STORE_MANAGER cross-day search — an admin tool, not part of the self-scoped My Timesheet screen), /work-docs/:id/reply (manager-only reply thread), and the CUSTOMER_INTERACTION doc type\'s customer/job-card linking fields (this screen only creates VENDOR-shaped notes, matching its original scope) — none of these were in scope for this pass and were not silently dropped.',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    dashboardRoute: '/dashboard/notifications',
    purpose: 'In-app notification list — unread highlighting, mark one/all read, tap to open the linked screen.',
    endpoints: ['GET /notifications', 'GET /notifications/count', 'PATCH /notifications/mark-all-read', 'PATCH /notifications/:id/read'],
    note: 'verifyToken only (backend/src/routes/notifications.ts) — every row is scoped server-side to the caller (OWNER also sees broadcast rows), so no visibleToRoles and no tab gate. Page-based pagination (?page&limit, limit capped at 50). Tap navigates only when metadata.link maps to a registry screen the role can open; otherwise it just marks read. The dashboard\'s module tabs, urgent/date/search filters and day grouping are not mirrored yet; /notifications/summary is unused.',
  },

];

// ── Wallet — deliberately NOT in SCREEN_REGISTRY above, and no screen file
// exists at src/app/more/wallet.tsx. backend/src/routes/wallet_route.ts is
// imported in backend/src/index.ts but its mount is commented out:
// `// app.use('/api/v1/wallet', walletRouter); — unmounted, see import
// comment above` — every request would 404, and the import comment explains
// why it was never re-mounted: walletRouter calls prisma.storeWallet /
// prisma.walletTransaction / User.walletAccess via `as any` casts to models
// that do not exist in schema.prisma, so even mounting it would 500 on
// every request. Confirmed 2026-09-21 by reading index.ts directly on the
// currently checked-out branch (a 4-line diff from origin/main, unrelated
// to this file). Do not add a Wallet entry here or a screen file until the
// backend route is actually fixed and mounted — an entry in SCREEN_REGISTRY
// with no matching route would show a live-looking menu item over a route
// that doesn't resolve, which is worse than not listing it at all. Top-up
// would be [OWNER,STORE_MANAGER,ACCOUNTING] and spend would be a manager
// role OR a per-user walletAccess flag once the model exists — noted here
// for whoever picks this back up, not verified against working code.
