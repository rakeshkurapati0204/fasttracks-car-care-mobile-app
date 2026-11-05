import * as axios from 'axios';
import * as FileSystem from 'expo-file-system/legacy';

import { tokenStorage } from '@/lib/token-storage';
import type { VoipPrepared, VoipStarted, VoipToken } from '@/lib/voip/types';
import type {
  ApiEnvelope,
  AppNotification,
  AttendanceRecord,
  Conversation,
  ConversationMessage,
  CustomerListResponse,
  CustomerProfile,
  CustomerRemark,
  NotificationListPage,
  JobCard,
  JobCardDetail,
  JobCardEdit,
  JobCardInspectionMedia,
  JobCardListItem,
  JobCardStatus,
  UpdateJobCardInput,
  JobLookupCustomer,
  LoginResponse,
  NewJobEntryInput,
  NewJobEntryResult,
  ReminderOccurrence,
  ReminderDefinition,
  CreateReminderDefinitionInput,
  RecurrenceType,
  RecurringTaskCompletion,
  RecurringTaskDefinition,
  DailyTaskCompletion,
  PurchaseLedgerDetail,
  EditPurchaseVoucherInput,
  EditPaymentVoucherInput,
  EditDebitNoteInput,
  SalaryPaymentWithBreakdown,
  ConversationListParams,
  ConversationStats,
  StaffPhoneNumberRow,
  ConversationCallRecording,
  ConversationCallSummary,
  CreateConversationInput,
  WabaNumber,
  Task,
  TaskStatus,
  CallCapabilities,
  CallInitiateResult,
  DialResult,
  AgentStatus,
  AgentActivity,
  AllTimesheetRow,
  IncentiveCredit,
  IncentiveLedger,
  IncentivePayout,
  TimesheetDetail,
  TimesheetEntryAttachment,
  TimesheetEntryContactLink,
  TimesheetEntryReply,
  TimesheetFollowUpTask,
  CompanyPayrollSummary,
  DeviceAlert,
  DeviceRow,
  DeviceDetail,
  DeviceLocationLog,
  DeviceAppUsage,
  RoleAppPolicy,
  SimStats,
  SimStatus,
  EmployeeDetail,
  EmployeeListItem,
  EmployeePermissions,
  AllTimesheetsResponse,
  CompanySettings,
  Expense,
  ExpenseAttachment,
  ExpenseCategory,
  ExpenseListResponse,
  ExpenseReply,
  ExpenseStatus,
  ExpenseSummary,
  MentionableUser,
  ExtractedReceiptFields,
  ExtractedStatementResult,
  ResolvedPermissions,
  FullProfile,
  IdentityDocument,
  IdentityDocType,
  IncentiveHistoryEntry,
  IncentiveRosterEntry,
  InventoryItemRow,
  LateRecord,
  LeaveRequest,
  LoanOrAdvance,
  LoanRepayment,
  PayrollDisbursementRow,
  Payslip,
  PayslipLineItem,
  PayslipListItem,
  PayslipPrefill,
  PayrollResult,
  PendingOvertimeRequest,
  POStatus,
  PurchaseOrder,
  SalaryPaymentRecord,
  SalesOrder,
  SOStatus,
  CreateSimInput,
  SimCard,
  Timesheet,
  TimesheetEntry,
  InvoiceDetail,
  InvoiceListItem,
  JobStatus,
  OvertimeRequest,
  WorkDocReply,
  WorkDocumentation,
  WorkDocumentationFile,
  PaginatedResponse,
  TeamChat,
  TeamChatEmployee,
  TeamChatMessage,
  TeamChatUpload,
  TeamChatForwardResult,
  TeamChatLeaveResult,
  TrackerJob,
  FinancialOverview,
  FinancialKpis,
  RevenueBreakdownItem,
  OutstandingResponse,
  PaymentsTodayResponse,
  TopCustomerEntry,
  MonthlyGrowthEntry,
  SlabCustomer,
  LegalCase,
  LegalDocument,
  CreateLegalCaseInput,
  UpdateLegalCaseInput,
  AccountDocument,
  BankAccount,
  EMI,
  PaymentReminder,
  ErpFinanceOverview,
  ErpFinanceOrdersResponse,
  ErpFinanceEmployeePerformance,
  ErpFinanceServices,
  ErpFinanceCustomers,
  ErpFinanceMonthlyBreakdown,
  ErpFinanceDailyPoint,
  StaffRemark,
  MyRemark,
  CreateRemarkInput,
  RemarkReply,
  DashboardOverview,
  DashboardRecentActivityItem,
  OnLeaveEntry,
  DashboardTodaySnapshot,
  DashboardRevenueByEmployee,
  AgreementListItem,
  AgreementDetail,
  TimesheetRegister,
  Loan,
  ShiftConfig,
  ShiftTimingConfig,
  SalaryHistoryEntry,
  Contact,
  ContactDetail,
  ContactType,
  ERPSupplier,
  CrmCustomersResponse,
  PipelineResponse,
  PipelineJob,
  PipelineStatus,
  CallLogEntry,
  CallRecordingDetail,
  CallRecordingSummary,
  AccountingLedger,
  WarningRecord,
  QuotationListItem,
  QuotationDetail,
  TabDef,
  CreateInvoiceInput,
  CreateQuotationInput,
  UpdateQuotationInput,
  InventoryItemInput,
  InventoryReceiptInput,
  InventoryItemDetail,
  StockReceipt,
  UpdateReceiptInput,
  ReconcileReason,
  ReconciliationRecord,
  DraftReceipt,
  PaymentReminderFull,
  InventoryListItem,
  InventoryListParams,
  SellerMatch,
  BarcodeLookup,
  ConfirmArrivalInput,
  ItemOutInput,
  ItemOutLog,
  LedgerDetail,
  CreateLedgerInput,
  UpdateLedgerInput,
  CreatePaymentVoucherInput,
  PaymentVoucher,
  CreatePurchaseVoucherInput,
  PurchaseVoucher,
  DebitNote,
  PostDebitNoteInput,
  PostPaidTransporterVoucherInput,
  CreateBankAccountInput,
  UpdateBankAccountInput,
  CreateEMIInput,
  CreatePaymentReminderInput,
  BankAccountRevealLog,
  BankBalanceHistoryEntry,
  EmailCheckState,
  EmailCheckLogEntry,
  OnboardingChecklist,
  OnboardingOverviewItem,
  Application,
  ApplicationStatus,
  ApplicationInvite,
  ApplicationInviteResult,
  InterviewScheduleInput,
  InterviewScheduleResult,
  CompareCandidate,
  RoleCoverage,
  PracticalQuestion,
  PracticalQuestionsData,
  SendAssessmentResult,
  InterviewInviteResult,
  HiringAnalytics,
  RetentionAnalytics,
  CompetencyTemplate,
  CompetencyTemplateListItem,
  DocumentAccessEntry,
  DocumentAccessParams,
  ActionLogEntry,
  ActionLogParams,
  OnboardingTemplate,
  OnboardingTaskInput,
  SuggestedOnboardingTask,
  AdsDayRow,
  AdsRunningResponse,
  AdLeadListResponse,
  AdLeadFilters,
  AdsFollowThrough,
  AdsRefreshResult,
  PasswordEntry,
  PasswordEntryInput,
  CardEntry,
  CardEntryInput,
  HrReportFormat,
  HrReportKind,
  CompetencyCategory,
  CompetencyInput,
  CreateCompetencyTemplateInput,
  SuggestCompetencyTemplateInput,
  RegenerateCompetencyTemplateInput,
  CustomerStatsReport,
  DailyReport,
  BoardStage,
  CjJobCard,
  CrmCustomerDetail,
  CrmCustomerPage,
  CrmSearchBy,
  HandledByEmployee,
  ApplicationFormInput,
  CompareCandidateFull,
  HrChatMessage,
  PracticalQuestionsFull,
  ApplicationRowData,
  ApplicationStatusEmailResult,
  EmployeeAnalyticsRaw,
  EmployeeCardItem,
  EmployeePerformancePoint,
  EmployeePunch,
  Candidate,
  CandidateOverviewCounts,
  CandidateOverviewListItem,
  CandidateOverviewMetric,
  HRLetter,
  HRLetterType,
  IssuedLetterSummary,
  OnboardingEmployee,
  OnboardingInviteResult,
  OnboardingInviteStatusInfo,
  PreJoiningTermsLite,
  ProbationCheckIn,
  CandidateVerificationQueueItem,
  DisciplineRecord,
  DisciplineRecordType,
  EmploymentDetails,
  EmploymentUpdate,
  IdentityDocumentStatus,
  OnboardingDocument,
  PreJoiningTerms,
  PreJoiningTermsInput,
  ProbationCheckInDetail,
  ProbationMilestone,
  DeviceFull,
  InvoiceFull,
  InvoiceRow,
  InvoiceStats,
  InvoiceReport,
  InvoicePaymentHistoryRow,
  OpenInvoiceRow,
  DeviceAlertFull,
  QuotationFull,
  QuotationStaffOption,
  QuotationItemSearchResult,
  QuotationGstData,
  QuotationVehicleData,
} from '@/types/api';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_API_URL is not set — configure it in .env or .env.local before starting the app.'
  );
}

export const api = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

/** Converts an axios upload-progress event into a 0-100 integer, or null when
 *  the total size isn't known (some RN multipart uploads never report one). */
export function progressToPercent(evt: axios.AxiosProgressEvent): number | null {
  if (!evt.total) return null;
  return Math.round((evt.loaded / evt.total) * 100);
}

api.interceptors.request.use(async (config) => {
  const token = await tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await tokenStorage.clear();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

export async function login(username: string, password: string) {
  const { data } = await api.post<ApiEnvelope<LoginResponse>>('/auth/login', { username, password });
  return data.data;
}

export async function fetchProfile() {
  const { data } = await api.get<ApiEnvelope<LoginResponse['user']>>('/auth/me');
  return data.data;
}

// GET /auth/me already computes { permissions, permissionModes, hasLegalAccess }
// server-side on every call (backend/src/routes/auth.ts) — the same
// mergePermissions/getTabAccess resolution the backend's own route gates use,
// not a re-derivation. This is the sole source for PermissionsProvider
// (src/lib/permissions-context.tsx); see MOBILE_PERMISSIONS_PATTERN.md.
export async function fetchMyPermissions(): Promise<ResolvedPermissions> {
  const { data } = await api.get<ApiEnvelope<{
    permissions?: Record<string, boolean> | null;
    permissionModes?: Record<string, string> | null;
    hasLegalAccess?: boolean;
    hasAdsAccess?: boolean;
  }>>('/auth/me');
  return {
    tabs: data.data.permissions ?? {},
    tabModes: data.data.permissionModes ?? {},
    hasLegalAccess: data.data.hasLegalAccess === true,
    hasAdsAccess: data.data.hasAdsAccess === true,
  };
}

export async function fetchTodayAttendance() {
  const { data } = await api.get<ApiEnvelope<AttendanceRecord[]>>('/attendance/today');
  return data.data;
}

export async function clockIn() {
  const { data } = await api.post<ApiEnvelope<AttendanceRecord>>('/attendance/clock-in');
  return data.data;
}

export async function clockOut() {
  const { data } = await api.post<ApiEnvelope<AttendanceRecord>>('/attendance/clock-out');
  return data.data;
}

// ── My Attendance History — GET /attendance/monthly with no userId param
// only returns the caller's own calendar for non-manager roles (server
// substitutes req.user.userId). For OWNER/STORE_MANAGER/ACCOUNTING/CASHIER
// it returns EVERY active employee's calendar instead (it's also the
// manager "view anyone" endpoint), so blindly taking calendar[0] — which
// this used to do — could silently show a manager some other employee's
// attendance on their own Home screen. Always pass our own userId
// explicitly (backend honors ?userId= for those roles too) so this is
// correct regardless of the caller's role, and match calendar[0] against it
// as a belt-and-braces check rather than trusting position.
export async function fetchMyMonthlyAttendance(month: number, year: number, ownUserId?: string) {
  const { data } = await api.get<
    ApiEnvelope<{ month: number; year: number; calendar: { user: { id: string }; records: Record<string, AttendanceRecord> }[] }>
  >('/attendance/monthly', { params: { month, year, userId: ownUserId } });
  const own = ownUserId ? data.data.calendar.find((c) => c.user.id === ownUserId) : data.data.calendar[0];
  if (!own) return [];
  return Object.values(own.records).sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ── Manager attendance surface — GET/POST/PATCH endpoints gated server-side
// to OWNER/STORE_MANAGER (and HR for downloads), matching the dashboard's
// AdminAttendance component (frontend/src/app/(dashboard)/dashboard/attendance/page.tsx)
// exactly. Mobile does not re-derive these role checks; callers gate the UI
// with the same hardcoded arrays the dashboard uses for these same actions.
export interface AttendanceRegisterEmployee {
  id: string;
  name: string;
  role: string;
  attendance: Record<string, { status: string; clockIn: string | null; clockOut: string | null; isOverridden?: boolean }>;
}
export interface AttendanceRegisterResponse {
  dates: string[];
  employees: AttendanceRegisterEmployee[];
  totalEmployees?: number;
}
export async function fetchAttendanceRegister(from: string, to: string) {
  const { data } = await api.get<ApiEnvelope<AttendanceRegisterResponse>>('/attendance/register', { params: { from, to } });
  return data.data;
}

export interface AttendanceDailyLogPerson {
  id: string;
  name: string;
  role: string;
  status: string;
  clockIn: string | null;
  clockOut: string | null;
}
export interface AttendanceDailyLogResponse {
  counts: { present: number; late: number; absent: number; total: number; totalEmployees?: number };
  presentees: AttendanceDailyLogPerson[];
  absentees: AttendanceDailyLogPerson[];
}
export async function fetchAttendanceDailyLog(date: string) {
  const { data } = await api.get<ApiEnvelope<AttendanceDailyLogResponse>>('/attendance/daily-log', { params: { date } });
  return data.data;
}

export async function fetchAttendancePunches(userId: string, date: string) {
  const { data } = await api.get<ApiEnvelope<{ direction: 'IN' | 'OUT'; time: string }[]>>('/attendance/punches', {
    params: { userId, date },
  });
  return data.data;
}

export async function bulkMarkAttendance(input: { userIds: string[]; date: string; status: string; clockIn?: string }) {
  const { data } = await api.post<ApiEnvelope<{ processed: number; total: number; errors: string[] }>>('/attendance/bulk-mark', input);
  return data.data;
}

export async function overrideAttendance(userId: string, date: string, input: { status: string; reason: string }) {
  const { data } = await api.patch<ApiEnvelope<unknown>>(`/attendance/${userId}/${date}/override`, input);
  return data.data;
}

export interface DeviceImportRow {
  deviceUserId: string;
  name: string;
  punchTime: string;
}
export interface DeviceImportResult {
  summary: { updated: number; skipped: number; notFound: number };
  results: Array<{ employeeName: string; deviceUserId: string; punchTime: string; status: string; result: string }>;
}
export async function importDeviceAttendance(rows: DeviceImportRow[]) {
  const { data } = await api.post<DeviceImportResult>('/attendance/import-device', { rows });
  return data;
}

// Report downloads need the Bearer token attached to a native file download
// (axios blob responses don't save to disk on their own) -- FileSystem's
// downloadAsync takes a headers option for exactly this.
export async function downloadAttendanceReport(
  kind: 'daily' | 'monthly',
  params: { date?: string; month?: number; year?: number; format: 'pdf' | 'excel' },
): Promise<{ uri: string; filename: string }> {
  const token = await tokenStorage.get();
  const ext = params.format === 'pdf' ? 'pdf' : 'xlsx';
  const query =
    kind === 'daily'
      ? `date=${params.date}&format=${params.format}`
      : `month=${params.month}&year=${params.year}&format=${params.format}`;
  const filename = kind === 'daily' ? `daily-attendance-${params.date}.${ext}` : `monthly-attendance-${params.year}-${String(params.month).padStart(2, '0')}.${ext}`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}/attendance/report/${kind}?${query}`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return { uri: result.uri, filename };
}

export async function fetchConversations() {
  const { data } = await api.get<ApiEnvelope<Conversation[]>>('/conversations');
  return data.data;
}

export async function fetchConversation(id: string) {
  const { data } = await api.get<ApiEnvelope<Conversation>>(`/conversations/${id}`);
  return data.data;
}

export async function sendConversationMessage(id: string, content: string) {
  const { data } = await api.post<ApiEnvelope<ConversationMessage>>(`/conversations/${id}/messages`, {
    content,
  });
  return data.data;
}

export async function fetchMyTasks() {
  const { data } = await api.get<ApiEnvelope<Task[]>>('/tasks');
  return data.data;
}

/** Mirrors dashboard's tasksAPI.list — assignedToId lets an admin view
 *  someone else's list; a filterless admin request means "everyone" on the
 *  backend, so this page always passes assignedToId explicitly. */
export async function fetchTasks(params?: { status?: TaskStatus; assignedToId?: string; date?: string; from?: string; to?: string }) {
  const { data } = await api.get<ApiEnvelope<Task[]>>('/tasks', { params });
  return data.data;
}

export async function fetchTask(id: string) {
  const { data } = await api.get<ApiEnvelope<Task>>(`/tasks/${id}`);
  return data.data;
}

/** Admin only. `date` is required by the API. */
export async function createTask(input: { title: string; description?: string; assignedToId: string; dueDate?: string; date: string }) {
  const { data } = await api.post<ApiEnvelope<Task>>('/tasks', input);
  return data.data;
}

/** Assignee only — even Owner/Store Manager cannot complete someone else's task. */
export async function updateTaskStatus(id: string, status: TaskStatus) {
  const { data } = await api.patch<ApiEnvelope<Task>>(`/tasks/${id}/status`, { status });
  return data.data;
}

/** Admin only. */
export async function updateTask(id: string, input: { title?: string; description?: string | null; assignedToId?: string; dueDate?: string | null; date?: string }) {
  const { data } = await api.patch<ApiEnvelope<Task>>(`/tasks/${id}`, input);
  return data.data;
}

/** Admin only. */
export async function deleteTask(id: string) {
  const { data } = await api.delete<ApiEnvelope<{ message: string }>>(`/tasks/${id}`);
  return data.data;
}

/** Reply on a reply-originated task's thread. Only valid when the task has a sourceWorkDocId or sourceTimesheetId. */
export async function replyToTaskThread(id: string, message: string) {
  const { data } = await api.post<ApiEnvelope<WorkDocReply>>(`/tasks/${id}/reply`, { message });
  return data.data;
}

export const TASK_NOTIFICATION_TYPES = ['WORK_DOC_REPLY', 'TIMESHEET_MENTION', 'EXPENSE_MENTION'];

/** Optional `types` scopes the clear to just those types, leaving other unread notifications alone. */
export async function markNotificationsRead(types?: string[]) {
  await api.patch('/notifications/mark-all-read', {}, { params: { types: types?.join(',') } });
}

/** Newest first. Page-based (`page`/`limit`, limit capped at 50 server-side), not cursor-based. */
export async function fetchNotifications(params: { page?: number; limit?: number; isRead?: boolean; types?: string[] } = {}) {
  const { data } = await api.get<ApiEnvelope<NotificationListPage>>('/notifications', {
    params: { page: params.page, limit: params.limit, isRead: params.isRead, types: params.types?.join(',') },
  });
  return data.data;
}

export async function fetchNotificationCount(types?: string[]) {
  const { data } = await api.get<ApiEnvelope<{ unreadCount: number }>>('/notifications/count', {
    params: { types: types?.join(',') },
  });
  return data.data.unreadCount;
}

export async function markNotificationRead(id: string) {
  const { data } = await api.patch<ApiEnvelope<AppNotification>>(`/notifications/${id}/read`);
  return data.data;
}

// Standing (recurring) tasks — distinct from the one-off Task above.
// backend/src/routes/recurring-tasks.ts, verified 2026-09-24. Create/list/
// edit/delete are OWNER/STORE_MANAGER only; my-current/complete are self
// (or admin-on-behalf-of for complete). Compliance-grid/history/rates are
// manager-only reporting views — not built on mobile, same scope-cut as
// Financial's chart tabs (dashboard-shaped grid report, no charting lib).
export async function fetchRecurringTasks(params?: { scope?: 'ROLE' | 'INDIVIDUAL'; targetRole?: string; assignedToId?: string; includeInactive?: boolean }) {
  const { data } = await api.get<ApiEnvelope<RecurringTaskDefinition[]>>('/recurring-tasks', { params });
  return data.data;
}

export async function createRecurringTask(input: {
  title: string;
  description?: string;
  recurrence: RecurrenceType;
  scope: 'ROLE' | 'INDIVIDUAL';
  targetRole?: string;
  assignedToId?: string;
}) {
  const { data } = await api.post<ApiEnvelope<RecurringTaskDefinition>>('/recurring-tasks', input);
  return data.data;
}

export async function updateRecurringTask(id: string, input: { title?: string; description?: string; recurrence?: RecurrenceType }) {
  const { data } = await api.patch<ApiEnvelope<RecurringTaskDefinition>>(`/recurring-tasks/${id}`, input);
  return data.data;
}

export async function deleteRecurringTask(id: string) {
  const { data } = await api.delete<ApiEnvelope<{ message: string }>>(`/recurring-tasks/${id}`);
  return data.data;
}

export async function fetchMyCurrentRecurringTasks() {
  const { data } = await api.get<ApiEnvelope<RecurringTaskCompletion[]>>('/recurring-tasks/my-current');
  return data.data;
}

export async function completeRecurringTask(completionId: string) {
  const { data } = await api.patch<ApiEnvelope<RecurringTaskCompletion>>(`/recurring-tasks/completions/${completionId}/complete`, {});
  return data.data;
}

// Not envelope-wrapped like the routes above — /crm and /job-cards return raw
// JSON, and their errors come back as { error } rather than { message }.
export function getErrorMessage(err: any, fallback: string) {
  return err?.response?.data?.message ?? err?.response?.data?.error ?? fallback;
}

export async function fetchCustomers(search?: string, filters?: { fromDate?: string; toDate?: string; source?: string; searchBy?: 'phone' }) {
  const { data } = await api.get<CustomerListResponse>('/crm/customers', {
    params: { search: search || undefined, ...filters },
  });
  return data;
}

// OWNER-only (requireOwner, backend/src/routes/crm.ts) — soft-deletes a
// customer (sets isActive:false + deletedAt, verified via a real staging
// write), the same isActive/deletedAt flags GET /crm/customers already
// filters on, so a deleted customer simply stops appearing in the list.
export async function deleteCustomer(id: string) {
  await api.delete(`/crm/customers/${id}`);
}

export async function fetchCustomerProfile(id: string) {
  const { data } = await api.get<ApiEnvelope<CustomerProfile>>(`/crm/customers/${id}/profile`);
  return data.data;
}

export async function fetchCustomerJobs(customerId: string) {
  const { data } = await api.get<JobCard[]>(`/job-cards/customer/${customerId}`);
  return data;
}

// Job-card workflow actions — added 2026-09-24 (full-parity pass). Gated
// by getCJMode('customers_jobs') server-side (view_only/sales_mode/
// full_access, same permission-mode system as invoices) — mirrored
// client-side via usePermissions().tabMode('customers_jobs'), not
// re-derived. RELEASED requires an already-fully-paid invoice and READY
// requires a job-card list already printed — both enforced server-side,
// surfaced via getErrorMessage on failure rather than replicated here.
export async function updateJobCardStatus(id: string, status: JobCardStatus) {
  const { data } = await api.patch<JobCard>(`/job-cards/${id}/status`, { status });
  return data;
}

export async function markJobCardWalkout(id: string, walkoutReason: string, walkoutNote?: string) {
  const { data } = await api.patch<JobCard>(`/job-cards/${id}/walkout`, { walkoutReason, walkoutNote });
  return data;
}

// OWNER/STORE_MANAGER only, enforced server-side.
export async function reassignJobCard(id: string, handledById: string) {
  const { data } = await api.patch<JobCard>(`/job-cards/${id}/reassign`, { handledById });
  return data;
}

// Job card detail/edit/list-items/inspection-media — added 2026-09-24,
// closing the gap flagged when job-card status actions were built earlier
// this pass. backend/src/routes/job_cards.ts returns raw JSON (no
// ApiEnvelope) on every route below, matching the status/walkout/reassign
// functions above.
export async function fetchJobCard(id: string) {
  const { data } = await api.get<JobCardDetail>(`/job-cards/${id}`);
  return data;
}

export async function updateJobCard(id: string, input: UpdateJobCardInput) {
  const { data } = await api.patch<JobCardDetail & { editsWritten?: number; message?: string }>(`/job-cards/${id}`, input);
  return data;
}

export async function fetchJobCardEdits(id: string) {
  const { data } = await api.get<JobCardEdit[]>(`/job-cards/${id}/edits`);
  return data;
}

export async function fetchJobCardListItems(jobId: string) {
  const { data } = await api.get<JobCardListItem[]>(`/job-cards/${jobId}/list-items`);
  return data;
}

export async function createJobCardListItem(jobId: string, input: { text: string; price?: number | null }) {
  const { data } = await api.post<JobCardListItem>(`/job-cards/${jobId}/list-items`, input);
  return data;
}

// Text is locked once the list has been printed and the item is one of the
// originally-printed lines (isOriginal) — the server 422s that case; price
// stays editable regardless, since it's set after printing by design.
export async function updateJobCardListItem(jobId: string, itemId: string, input: { text?: string; price?: number | null }) {
  const { data } = await api.patch<JobCardListItem>(`/job-cards/${jobId}/list-items/${itemId}`, input);
  return data;
}

export async function deleteJobCardListItem(jobId: string, itemId: string) {
  const { data } = await api.delete<{ success: true }>(`/job-cards/${jobId}/list-items/${itemId}`);
  return data;
}

export async function printJobCardList(jobId: string) {
  const { data } = await api.post(`/job-cards/${jobId}/list-print`);
  return data;
}

export async function fetchInspectionMedia(jobId: string) {
  const { data } = await api.get<JobCardInspectionMedia[]>(`/job-cards/${jobId}/inspection-media`);
  return data;
}

// Field name 'files' (up to 20 per call); jpeg/png/webp/heic/gif + mp4/mov/
// avi video, 100MB per file — matches inspectionUpload's multer config
// exactly. Only image capture is wired into the UI: pickFromCamera/
// pickFromGallery are deliberately image-only in this app (src/lib/
// upload.ts), so video inspection media is flagged, not built.
export async function uploadInspectionMedia(
  jobId: string,
  file: { uri: string; name: string; mimeType: string },
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('files', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<{ uploaded: JobCardInspectionMedia[]; count: number }>(`/job-cards/${jobId}/inspection-media`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data;
}

// OWNER/STORE_MANAGER only, enforced server-side.
export async function deleteInspectionMedia(jobId: string, mediaId: string) {
  const { data } = await api.delete<{ success: true }>(`/job-cards/${jobId}/inspection-media/${mediaId}`);
  return data;
}

// Verification remarks — requireCustomerRemarksAccess (OWNER/STORE_MANAGER,
// or an explicit per-employee grant), deliberately separate from staff
// Remarks and never gated by getCJMode. Append-only: no edit/delete routes
// exist server-side at all.
export async function fetchJobCardRemarks(jobCardId: string) {
  const { data } = await api.get<ApiEnvelope<CustomerRemark[]>>(`/customer-remarks/job/${jobCardId}`);
  return data.data;
}

export async function createJobCardRemark(jobCardId: string, note: string) {
  const { data } = await api.post<ApiEnvelope<CustomerRemark>>(`/customer-remarks/job/${jobCardId}`, { note });
  return data.data;
}

export async function fetchMyReminders() {
  const { data } = await api.get<ApiEnvelope<ReminderOccurrence[]>>('/reminders/mine');
  return data.data;
}

// Definitions — OWNER-only (requireOwner). Added 2026-09-24.
export async function fetchReminderDefinitions() {
  const { data } = await api.get<ApiEnvelope<ReminderDefinition[]>>('/reminders/definitions');
  return data.data;
}

export async function createReminderDefinition(input: CreateReminderDefinitionInput) {
  const { data } = await api.post<ApiEnvelope<ReminderDefinition>>('/reminders/definitions', input);
  return data.data;
}

export async function updateReminderDefinition(id: string, input: Partial<CreateReminderDefinitionInput>) {
  const { data } = await api.patch<ApiEnvelope<ReminderDefinition>>(`/reminders/definitions/${id}`, input);
  return data.data;
}

export async function deleteReminderDefinition(id: string) {
  const { data } = await api.delete<ApiEnvelope<{ message: string }>>(`/reminders/definitions/${id}`);
  return data.data;
}

export async function ackReminder(id: string) {
  const { data } = await api.post<ApiEnvelope<ReminderOccurrence>>(`/reminders/occurrences/${id}/ack`);
  return data.data;
}

export async function snoozeReminder(id: string) {
  const { data } = await api.post<ApiEnvelope<ReminderOccurrence>>(`/reminders/occurrences/${id}/snooze`);
  return data.data;
}

export async function doneReminder(id: string) {
  const { data } = await api.post<ApiEnvelope<ReminderOccurrence>>(`/reminders/occurrences/${id}/done`);
  return data.data;
}

export async function lookupCustomerByPhone(phone: string) {
  const { data } = await api.get<JobLookupCustomer | null>('/job-cards/lookup', { params: { phone } });
  return data;
}

export async function createJobEntry(input: NewJobEntryInput) {
  const { data } = await api.post<NewJobEntryResult>('/job-cards', input);
  return data;
}

export async function fetchTeamChats() {
  const { data } = await api.get<TeamChat[]>('/team-chat');
  return data;
}

export async function fetchTeamChatMessages(chatId: string) {
  const { data } = await api.get<TeamChatMessage[]>(`/team-chat/${chatId}/messages`);
  return data;
}

export async function sendTeamChatMessage(
  chatId: string,
  content: string | null,
  media?: { mediaUrl: string; mediaType: string },
  replyToId?: string,
) {
  const { data } = await api.post<TeamChatMessage>(`/team-chat/${chatId}/messages`, { content, replyToId, ...media });
  return data;
}

// Newest `limit` messages (oldest-first); pass `before` (id of the oldest message
// you hold) for the next older page. X-Has-More says whether anything older exists.
export async function fetchTeamChatMessagesPage(chatId: string, opts?: { before?: string; limit?: number }) {
  const { data, headers } = await api.get<TeamChatMessage[]>(`/team-chat/${chatId}/messages`, {
    params: { limit: opts?.limit ?? 60, before: opts?.before },
  });
  const raw = (headers as Record<string, unknown> | undefined)?.['x-has-more'];
  return { messages: Array.isArray(data) ? data : [], hasMore: raw === 'true' };
}

export async function markTeamChatRead(chatId: string) {
  await api.post(`/team-chat/${chatId}/read`);
}

// Sender-only (403 for anyone else, group admin included), text-only, and
// server-enforced within EDIT_WINDOW_MS = 1 hour of sending — the mobile
// UI only mirrors that window to decide whether to show an Edit action,
// the real enforcement is server-side; a late attempt just 403s with the
// server's own message.
export async function editTeamChatMessage(chatId: string, messageId: string, content: string) {
  const { data } = await api.patch<TeamChatMessage>(`/team-chat/${chatId}/messages/${messageId}`, { content });
  return data;
}

// Sender-only. Soft delete — the row stays, server scrubs content/media to
// null on this and every future read, so the returned message (and every
// later fetch of the same chat) already has deleted:true with blank
// content; render "This message was deleted" rather than removing the
// bubble.
export async function deleteTeamChatMessage(chatId: string, messageId: string) {
  const { data } = await api.delete<TeamChatMessage>(`/team-chat/${chatId}/messages/${messageId}`);
  return data;
}

// Any chat member may pin/unpin (not sender-only, not admin-only). Server
// caps at 3 pinned messages per chat and 409s over the cap — don't
// pre-check the count client-side, just attempt and surface the server's
// error text on failure. Response is the chat's full current pins list,
// not just the one message.
export async function pinTeamChatMessage(chatId: string, messageId: string) {
  const { data } = await api.post<TeamChatMessage[]>(`/team-chat/${chatId}/messages/${messageId}/pin`);
  return data;
}

export async function unpinTeamChatMessage(chatId: string, messageId: string) {
  const { data } = await api.delete<TeamChatMessage[]>(`/team-chat/${chatId}/messages/${messageId}/pin`);
  return data;
}

export async function fetchTeamChatPins(chatId: string) {
  const { data } = await api.get<TeamChatMessage[]>(`/team-chat/${chatId}/pins`);
  return data;
}

// Per-user — writes only the caller's own membership row, uncapped, no
// role gate beyond membership. Response carries the new pinnedAt so the
// caller can sort/merge locally without a full list refetch.
export async function pinTeamChat(chatId: string) {
  const { data } = await api.post<{ chatId: string; pinnedAt: string | null }>(`/team-chat/${chatId}/pin`);
  return data;
}

export async function unpinTeamChat(chatId: string) {
  const { data } = await api.delete<{ chatId: string; pinnedAt: string | null }>(`/team-chat/${chatId}/pin`);
  return data;
}

// "Delete chat" on the dashboard — 1:1 only (400 for a group; use Leave
// group there instead). Hides it from just the caller's own list; the
// other party sees no change, and the next message in the chat un-hides it
// automatically server-side. Not a real delete of any data.
export async function hideTeamChat(chatId: string) {
  await api.post(`/team-chat/${chatId}/hide`);
}

export async function fetchTeamChatEmployees() {
  const { data } = await api.get<TeamChatEmployee[]>('/team-chat/employees');
  return data;
}

// >2 total members (self + memberIds, deduped) makes it a group server-side
// — 'name' only matters in that case (backend/src/routes/team_chat_route.ts,
// re-verified 2026-09-24); a 2-person request reuses any existing 1:1 chat
// rather than creating a duplicate.
export async function startTeamChat(memberIds: string[], name?: string) {
  const { data } = await api.post<TeamChat>('/team-chat', { memberIds, name });
  return data;
}

// Images and audio only — no generic file/doc upload on this route
// server-side (chatUpload's mimetype allow-list). Audio is voice-message
// recording, which needs expo-av/expo-audio — not installed in this
// project, so only image upload is wired into the UI; flagged, not built.
// Field name 'file'; 25MB; jpeg/png/gif/webp (+ audio mimes, unused here).
export async function uploadTeamChatMedia(
  file: { uri: string; name: string; mimeType: string },
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<{ url: string; type: 'image' | 'audio'; mimeType: string }>('/team-chat/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data;
}

// Team Chat phase 2 — same upload route as above, but typed for documents too
// (images, voice notes and PDF/Word/Excel/PPT/TXT/CSV/ZIP; the server picks by MIME or extension).
export async function uploadTeamChatAttachment(
  file: { uri: string; name: string; mimeType: string },
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<TeamChatUpload>('/team-chat/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data;
}

// { messageId, chatIds[] } — the forwarder must be in the source chat and every destination
// (checked server-side, all-or-nothing); each destination gets a copy marked forwarded.
export async function forwardTeamChatMessage(messageId: string, chatIds: string[]) {
  const { data } = await api.post<TeamChatForwardResult[]>('/team-chat/forward', { messageId, chatIds });
  return data;
}

// Group admin only (server re-checks on every one of these and answers 403 otherwise).
export async function renameTeamChatGroup(chatId: string, name: string) {
  const { data } = await api.patch<TeamChat>(`/team-chat/${chatId}`, { name });
  return data;
}

export async function addTeamChatMembers(chatId: string, memberIds: string[]) {
  const { data } = await api.post<TeamChat>(`/team-chat/${chatId}/members`, { memberIds });
  return data;
}

export async function removeTeamChatMember(chatId: string, userId: string) {
  const { data } = await api.delete<TeamChat>(`/team-chat/${chatId}/members/${userId}`);
  return data;
}

// Any member can leave; the server decides whether admin passes on or the group is archived.
export async function leaveTeamChat(chatId: string) {
  const { data } = await api.post<TeamChatLeaveResult>(`/team-chat/${chatId}/leave`);
  return data;
}

// A shared document lives at a public storage URL (the dashboard opens it with a plain link),
// so it downloads to the cache without auth and then goes to the share sheet.
export async function downloadTeamChatDocument(url: string, filename: string): Promise<{ uri: string }> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'document';
  const dest = `${FileSystem.cacheDirectory}chat-${Date.now()}-${safe}`;
  const result = await FileSystem.downloadAsync(url.split('#')[0], dest);
  if (result.status !== 200) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    throw new Error('Failed to open document');
  }
  return { uri: result.uri };
}

// Per-owner, upserted (empty nickname deletes it) — the GET /employees list
// above already returns the caller's own nickname per contact.
export async function updateTeamChatNickname(contactId: string, nickname: string) {
  const { data } = await api.put<{ nickname: string | null }>(`/team-chat/contacts/${contactId}/nickname`, { nickname });
  return data;
}

export async function fetchMyOvertime(month?: number, year?: number) {
  const { data } = await api.get<ApiEnvelope<OvertimeRequest[]>>('/overtime/my', { params: { month, year } });
  return data.data;
}

export async function submitOvertime(input: { date: string; requestedHours: number; reason: string; isUrgent?: boolean }) {
  const { data } = await api.post<ApiEnvelope<OvertimeRequest>>('/overtime', input);
  return data.data;
}

// Self OR MANAGER_ROLES may call this (backend/src/routes/overtime.ts), but
// only ever on the caller's own request unless they're a manager — this
// screen only ever passes the caller's own request id.
export async function setOvertimeActualHours(id: string, actualHours: number) {
  const { data } = await api.patch<ApiEnvelope<OvertimeRequest>>(`/overtime/${id}/actual-hours`, { actualHours });
  return data.data;
}

export async function fetchTrackerJobs() {
  const { data } = await api.get<ApiEnvelope<PaginatedResponse<TrackerJob>>>('/jobs');
  return data.data.data;
}

export async function updateTrackerJobStatus(id: string, status: JobStatus) {
  const { data } = await api.put<ApiEnvelope<TrackerJob>>(`/jobs/${id}/status`, { status });
  return data.data;
}

export async function fetchInvoices(search?: string) {
  const { data } = await api.get<ApiEnvelope<PaginatedResponse<InvoiceListItem>>>('/invoices', {
    params: search ? { search } : undefined,
  });
  return data.data.data;
}

export async function fetchInvoice(id: string) {
  const { data } = await api.get<ApiEnvelope<InvoiceDetail>>(`/invoices/${id}`);
  return data.data;
}

// PATCH /invoices/:id/payment is a retired route (410 Gone) — confirmed
// dead in an earlier investigation this session. The dashboard's live
// payment-recording action (frontend/.../invoices/page.tsx, verified
// against origin/main 2026-09-24) posts to /payments/record instead, with
// a transactional payment-row + invoice-status update. Fixed to match.
export async function recordInvoicePayment(invoiceId: string, amount: number, paymentMode: string, notes?: string) {
  // Returns a payment summary, NOT the invoice (backend payments_route.ts) —
  // callers must re-fetch the invoice with fetchInvoice() afterwards.
  const { data } = await api.post<ApiEnvelope<{ status: string; paidAmount: number; balanceDue: number; isFullyPaid: boolean }>>('/payments/record', { invoiceId, amount, paymentMode, notes });
  return data.data;
}

export async function createInvoice(input: CreateInvoiceInput) {
  const { data } = await api.post<ApiEnvelope<InvoiceDetail>>('/invoices', input);
  return data.data;
}

export async function markInvoicePaid(id: string, paymentMethod: string) {
  const { data } = await api.post<ApiEnvelope<InvoiceDetail>>(`/invoices/${id}/mark-paid`, { paymentMethod });
  return data.data;
}

// Only called when the caller explicitly opted in via a checkbox — the
// dashboard's own send-to-customer action was fixed 2026-09-22 (fix/invoice-
// send-checkbox-gating) to respect an opt-in toggle rather than firing
// unconditionally; this client function is deliberately never called from a
// default/automatic path on mobile either.
// Endpoint corrected 2026-09-24: /invoices/:id/send-whatsapp is a different,
// older n8n-webhook route. The dashboard's live invoices list page (verified
// against origin/main) calls /whatsapp-invoice instead — the real path,
// direct Meta Cloud API, generates a PDF server-side and sends it, distinct
// from the plain-text n8n route. Matched to what's actually live.
export async function sendInvoiceWhatsapp(id: string) {
  const { data } = await api.post<ApiEnvelope<{ phone: string }>>(`/invoices/${id}/whatsapp-invoice`);
  return data.data;
}

// POST /invoices/:id/generate-waybill — no PDF involved (a prior comment on
// this screen conflated it with print/PDF and skipped it for that reason;
// it's just a Shiprocket order attempt, falling back to a placeholder
// waybill number string, persisted on the invoice). Gated the same as
// mark-paid/send-whatsapp — canWrite client-side — though the real backend
// gate (canAccessInvoices) is actually looser (any enabled tab access, not
// write-specific); matching this screen's other write actions is the safer
// choice, not a re-derivation of the exact backend rule.
export async function generateInvoiceWaybill(id: string) {
  const { data } = await api.post<ApiEnvelope<{ waybillNo: string; shiprocketOrderId: string | null; invoice: InvoiceDetail }>>(`/invoices/${id}/generate-waybill`);
  return data.data;
}

export async function sendInvoiceEmail(id: string) {
  const { data } = await api.post<ApiEnvelope<{ sent: true; to: string }>>(`/invoices/${id}/send-email`);
  return data.data;
}

export async function fetchQuotations(search?: string) {
  const { data } = await api.get<ApiEnvelope<PaginatedResponse<QuotationListItem>>>('/quotations', {
    params: search ? { search } : undefined,
  });
  return data.data.data;
}

export async function fetchQuotation(id: string) {
  const { data } = await api.get<ApiEnvelope<QuotationDetail>>(`/quotations/${id}`);
  return data.data;
}

export async function cancelQuotation(id: string) {
  const { data } = await api.patch<ApiEnvelope<QuotationDetail>>(`/quotations/${id}/cancel`);
  return data.data;
}

// Hard delete, ADMIN_ROLES=[OWNER,STORE_MANAGER,ACCOUNTING]-only
// (backend/src/routes/quotationRoutes.ts, re-verified 2026-09-24) — added
// closing the gap flagged alongside print. There is no PDF-generation
// endpoint for "print" — the dashboard's print view is pure client-side
// HTML + window.print(), so mobile's equivalent (a formatted text share
// via React Native's built-in Share API) needs no new backend call either.
export async function deleteQuotation(id: string) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/quotations/${id}`);
  return data.data;
}

export async function createQuotation(input: CreateQuotationInput) {
  const { data } = await api.post<ApiEnvelope<QuotationDetail>>('/quotations', input);
  return data.data;
}

export async function updateQuotation(id: string, input: UpdateQuotationInput) {
  const { data } = await api.put<ApiEnvelope<QuotationDetail>>(`/quotations/${id}`, input);
  return data.data;
}

export async function fetchMyExpenses() {
  const { data } = await api.get<ApiEnvelope<{ expenses: Expense[] }>>('/expenses');
  return data.data.expenses;
}

// GET /expenses is dual-purpose server-side (backend/src/routes/expenses.ts):
// a verifier gets everyone's rows back with no userId filter applied, a
// non-verifier gets a 403-free but silently self-scoped result. This calls
// the same endpoint with an explicit status filter for the verifier queue.
export async function fetchExpensesForReview(status: ExpenseStatus = 'PENDING') {
  const { data } = await api.get<ApiEnvelope<{ expenses: Expense[] }>>('/expenses', { params: { status } });
  return data.data.expenses;
}

// Verifier-only "All" view — same endpoint, full filter/pagination params,
// matching the dashboard's AdminExpensesView "All" tab exactly.
export async function fetchExpensesAdmin(params: {
  status?: ExpenseStatus; category?: ExpenseCategory; userId?: string; from?: string; to?: string; page?: number; limit?: number;
}) {
  const { data } = await api.get<ApiEnvelope<ExpenseListResponse>>('/expenses', { params });
  return data.data;
}

export async function fetchExpenseSummary(params: { from?: string; to?: string; status?: ExpenseStatus }) {
  const { data } = await api.get<ApiEnvelope<ExpenseSummary>>('/expenses/summary', { params });
  return data.data;
}

export async function approveExpense(id: string, note?: string) {
  const { data } = await api.patch<ApiEnvelope<Expense>>(`/expenses/${id}/approve`, note ? { note } : undefined);
  return data.data;
}

export async function rejectExpense(id: string, note?: string) {
  const { data } = await api.patch<ApiEnvelope<Expense>>(`/expenses/${id}/reject`, note ? { note } : undefined);
  return data.data;
}

export async function submitExpense(
  input: { amount: number; category: ExpenseCategory; description: string; date?: string },
  file?: { uri: string; name: string; mimeType: string },
) {
  const form = new FormData();
  form.append('amount', String(input.amount));
  form.append('category', input.category);
  form.append('description', input.description);
  if (input.date) form.append('date', input.date);
  if (file) form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<ApiEnvelope<Expense>>('/expenses', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

// OCR extract — POST /expenses/extract (backend/src/routes/expenses.ts,
// re-verified 2026-09-24), field 'file', image/PDF ≤15MB, canAdd role gate.
// Never persists — the result just prefills the submit form; the caller
// still decides what to actually submit.
export async function extractReceiptFields(file: { uri: string; name: string; mimeType: string }) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<ApiEnvelope<ExtractedReceiptFields>>('/expenses/extract', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return data.data;
}

// Bulk statement import — POST /expenses/extract-statement then POST
// /expenses/bulk, same field/limits as extract above. Spreadsheet (.xlsx/
// .xls/.csv) upload needs a document picker, not installed in this app
// (pickFromCamera/pickFromGallery are image-only by design) — only the
// photo-of-a-statement path (image → Claude) is reachable from mobile;
// flagged, not silently worked around.
export async function extractStatementTransactions(file: { uri: string; name: string; mimeType: string }) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<ApiEnvelope<ExtractedStatementResult>>('/expenses/extract-statement', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 90000,
  });
  return data.data;
}

// Max 500 rows, all-or-nothing, every row shares the one uploaded attachment.
export async function bulkCreateExpenses(
  file: { uri: string; name: string; mimeType: string },
  transactions: { date?: string; amount: number; category: ExpenseCategory; description: string }[],
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  form.append('transactions', JSON.stringify(transactions));
  const { data } = await api.post<ApiEnvelope<{ expenses: Expense[]; count: number }>>('/expenses/bulk', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data.data;
}

// Add another bill to an already-submitted expense — owner or verifier
// (canAccessExpense). Deleting is blocked server-side if it'd leave an
// over-₹200 expense with zero bills.
export async function addExpenseAttachment(
  expenseId: string,
  file: { uri: string; name: string; mimeType: string },
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<ApiEnvelope<ExpenseAttachment>>(`/expenses/${expenseId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data.data;
}

export async function deleteExpenseAttachment(attachmentId: string) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/expenses/attachments/${attachmentId}`);
  return data.data;
}

// Private storage, proxied through an authenticated route — same
// fetch-as-data-uri pattern as identity documents/timesheet attachments.
export async function fetchExpenseAttachmentDataUri(attachmentId: string, mimeType: string) {
  const { data } = await api.get<ArrayBuffer>(`/expenses/attachments/${attachmentId}/file`, { responseType: 'arraybuffer' });
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mimeType};base64,${base64Encode(binary)}`;
}

// Two-way thread — whoever filed the expense and a verifier can both post.
// Mentions aren't wired to a picker here, same convention as this app's
// other reply threads (work-doc replies, timesheet entry replies) — plain
// text only, mentions always sent empty.
export async function replyToExpense(expenseId: string, message: string) {
  const { data } = await api.post<ApiEnvelope<ExpenseReply>>(`/expenses/${expenseId}/replies`, { message, mentions: [] });
  return data.data;
}

// ── Expenses page parity: @-mentions, tagged replies, bill download ─────────
export async function fetchMentionableUsers() {
  const { data } = await api.get<ApiEnvelope<MentionableUser[]>>('/employees/mentionable');
  return Array.isArray(data.data) ? data.data : [];
}

// Same as submitExpense plus the dashboard's `mentions` field (ids picked in the @ dropdown).
export async function submitExpenseTagged(
  input: { amount: number; category: ExpenseCategory; description: string; date: string; mentions: string[] },
  file?: { uri: string; name: string; mimeType: string },
) {
  const form = new FormData();
  form.append('amount', String(input.amount));
  form.append('category', input.category);
  form.append('description', input.description);
  form.append('date', input.date);
  form.append('mentions', JSON.stringify(input.mentions));
  if (file) form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<ApiEnvelope<Expense>>('/expenses', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data.data;
}

export async function replyToExpenseTagged(expenseId: string, message: string, mentions: string[]) {
  const { data } = await api.post<ApiEnvelope<ExpenseReply>>(`/expenses/${expenseId}/replies`, { message, mentions });
  return data.data;
}

// Streams a private bill to the cache so it can be opened in the share sheet.
export async function downloadExpenseAttachment(attachmentId: string, filename: string): Promise<{ uri: string }> {
  const token = await tokenStorage.get();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = `${FileSystem.cacheDirectory}expense-${attachmentId}-${safe}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}/expenses/attachments/${attachmentId}/file`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status !== 200) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    throw new Error('Failed to open bill');
  }
  return { uri: result.uri };
}

export async function fetchMyMonthTimesheets(month: number, year: number) {
  const { data } = await api.get<ApiEnvelope<Timesheet[]>>('/timesheets/my-month', { params: { month, year } });
  return data.data;
}

export async function saveTimesheet(date: string, entries: TimesheetEntry[], notes?: string) {
  const { data } = await api.post<ApiEnvelope<Timesheet>>('/timesheets', { date, entries, notes });
  return data.data;
}

export async function submitTimesheet(id: string) {
  const { data } = await api.patch<ApiEnvelope<Timesheet>>(`/timesheets/${id}/submit`);
  return data.data;
}

export async function fetchCallCapabilities() {
  const { data } = await api.get<ApiEnvelope<CallCapabilities>>('/calls/capabilities');
  return data.data;
}

// The dial pad: a typed number, never a customer id. The backend rings the signed-in user's own phone first, then connects this number.
// `target` is a typed number, or `{ fromCallId }` for "call back" from the history: the list only has masked numbers, so the server looks the real one up.
export async function dialNumber(target: string | { phone: string } | { fromCallId: string }, idempotencyKey: string) {
  const who = typeof target === 'string' ? { phone: target } : target;
  const { data } = await api.post<ApiEnvelope<DialResult>>('/calls/dial', { ...who, idempotencyKey, confirm: true });
  return data.data;
}

// In-app VoIP (app-originated). `prepare` validates the customer's number and returns the callRef the SDK dials with; `token` is the Exotel subscriber
// token for THIS user (a mock in local testing). Neither places a call: the SDK does, through Exotel.
export async function voipPrepare(phoneE164: string, idempotencyKey: string) {
  const { data } = await api.post<ApiEnvelope<VoipPrepared>>('/calls/voip/prepare', { phone: phoneE164, idempotencyKey });
  return data.data;
}

export async function voipToken() {
  const { data } = await api.post<ApiEnvelope<VoipToken>>('/calls/voip/token', {});
  return data.data;
}

// CCM flow: place the call at Exotel (idempotent per callRef) and tell the backend when the app gives up.
export async function voipStart(callRef: string) {
  const { data } = await api.post<ApiEnvelope<VoipStarted>>('/calls/voip/start', { callRef });
  return data.data;
}

export async function voipCancel(callRef: string, reason: string) {
  await api.post('/calls/voip/cancel', { callRef, reason });
}

export async function initiateCall(customerId: string) {
  const { data } = await api.post<ApiEnvelope<CallInitiateResult>>('/calls/initiate', {
    customerId,
    idempotencyKey: `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  });
  return data.data;
}

// ── My Salary — GET /payroll/calculate requires userId explicitly for
// OWNER/STORE_MANAGER/CASHIER (SALARY_ADMIN_ROLES); the server only
// auto-substitutes the caller's own id for every other role. Always passing
// it ourselves works correctly either way (backend/src/routes/payroll.ts:22-27
// overrides it with the caller's own id for non-admin roles regardless).
export async function fetchMyPayroll(userId: string, month: number, year: number) {
  const { data } = await api.get<ApiEnvelope<PayrollResult>>('/payroll/calculate', { params: { userId, month, year } });
  return data.data;
}

export async function fetchMyLateRecords(month: number, year: number) {
  const { data } = await api.get<ApiEnvelope<LateRecord[]>>('/attendance/late-records', { params: { month, year } });
  return data.data;
}

// ── My Finance — GET /loans and /advances are hard-scoped server-side to the
// caller's own rows for any non-admin role; POST always creates under the
// caller's own id from the token, never a client-supplied one.
export async function fetchMyLoans() {
  const { data } = await api.get<ApiEnvelope<LoanOrAdvance[]>>('/loans');
  return data.data;
}

// The dashboard's real "Request Advance" form (frontend/src/app/(dashboard)/
// dashboard/my-finance/page.tsx) always sends repaymentMode + (for
// MONTHLY_N/CUSTOM) tenureMonths — monthlyDeductionPercent is a legacy,
// back-compat-only path the backend still accepts (backend/src/routes/
// loans.ts POST /) but the current product UI never uses. This mirrors the
// real form, not the legacy fallback.
export async function requestLoan(input: { amount: number; repaymentMode: string; tenureMonths?: number; notes?: string }) {
  const { data } = await api.post<ApiEnvelope<LoanOrAdvance>>('/loans', input);
  return data.data;
}

// Self only — subject resolves from the JWT, not a param. Backend returns a
// fresh token in the response (old sessions elsewhere are not invalidated).
export async function changeMyPassword(currentPassword: string, newPassword: string) {
  const { data } = await api.post<ApiEnvelope<{ token: string }>>('/auth/change-password', { currentPassword, newPassword });
  return data.data.token;
}

// ── Personal Info — /auth/me resolves the subject from the JWT alone, and
// /identity-documents/:userId enforces self-or-privileged-role server-side,
// but we still only ever pass our own id here, never anyone else's.
export async function fetchMyProfile() {
  const { data } = await api.get<ApiEnvelope<FullProfile>>('/auth/me');
  return data.data;
}

// Despite the name (kept for the Personal Info call site), this is a plain
// self-or-privileged fetch by userId — the Employee Documents admin screen
// reuses it for any employee, not just the caller.
export async function fetchMyIdentityDocuments(userId: string) {
  const { data } = await api.get<ApiEnvelope<IdentityDocument[]>>(`/identity-documents/${userId}`);
  return data.data;
}

// Name+id only, active employees — PRIVILEGED_ROLES or the employee_documents
// override, same gate as upload/delete (backend/src/routes/identity-documents.ts
// GET /directory). Never salary/phone/personal-email.
export async function fetchIdentityDocumentsDirectory() {
  const { data } = await api.get<ApiEnvelope<{ id: string; name: string }[]>>('/identity-documents/directory');
  return data.data;
}

// Upload/delete are NOT self-accessible on the backend — requireHROrOwnerOrDocsOverride
// (backend/src/routes/identity-documents.ts) has no "self" exception at all,
// unlike the GET routes above. These are for PRIVILEGED_ROLES=[OWNER,HR,STORE_MANAGER]
// or a per-employee 'employee_documents' tab override managing THEIR OWN
// documents from the self-view screen — never someone else's; managing other
// employees' documents is the separate Employee Documents admin page, not
// built here. Field name 'file', mime/size limits match backend exactly
// (image/jpeg, image/png, image/webp, application/pdf; 10MB) — enforced
// client-side too via src/lib/upload.ts's validatePickedFile before this is
// ever called.
export async function uploadIdentityDocument(
  userId: string,
  file: { uri: string; name: string; mimeType: string },
  type: IdentityDocType,
  label: string | undefined,
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  form.append('type', type);
  if (label) form.append('label', label);
  const { data } = await api.post<ApiEnvelope<IdentityDocument>>(`/identity-documents/${userId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data.data;
}

// Self, or Owner/HR/Store Manager/Accounting for anyone — same gate as
// viewBlob/list. Backend logs this call (action: REVEAL_VALUE) before
// responding — only call from an explicit user-initiated "reveal", never
// automatically.
export async function revealIdentityDocumentValue(documentId: string) {
  const { data } = await api.get<ApiEnvelope<{ value: string }>>(`/identity-documents/file/${documentId}/reveal-value`);
  return data.data.value;
}

export async function deleteIdentityDocument(documentId: string) {
  const { data } = await api.delete<ApiEnvelope<{ message: string }>>(`/identity-documents/file/${documentId}`);
  return data.data;
}

// Private storage (uploadPrivateFileToAzure), proxied through an authenticated
// route — no public `url` field on IdentityDocument, unlike WorkDocumentationFile.
// Fetched as bytes and handed back as a data: URI, same pattern already used
// for payroll export and agreement PDFs elsewhere in this file.
export async function fetchIdentityDocumentDataUri(documentId: string, mimeType: string) {
  const { data } = await api.get<ArrayBuffer>(`/identity-documents/file/${documentId}`, { responseType: 'arraybuffer' });
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mimeType};base64,${base64Encode(binary)}`;
}

// ── Leave Requests — self submit/view; PENDING queue only surfaces for
// LEAVE_APPROVER_ROLES (OWNER/STORE_MANAGER/HR, see backend/src/lib/leaveRoles.ts
// — distinct from the broader attendance MANAGER_ROLES). Approve/reject is
// gated server-side by requireHROrOwner, matching that same list.
export async function fetchLeaveRequests(status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL') {
  const { data } = await api.get<ApiEnvelope<LeaveRequest[]>>('/attendance/leave-requests', {
    params: status ? { status } : undefined,
  });
  return data.data;
}

export async function submitLeaveRequest(input: {
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  isHalfDay?: boolean;
}) {
  const { data } = await api.post<ApiEnvelope<LeaveRequest>>('/attendance/leave-request', input);
  return data.data;
}

export async function decideLeaveRequest(id: string, decision: 'APPROVED' | 'REJECTED', rejectionReason?: string) {
  const { data } = await api.put<ApiEnvelope<LeaveRequest>>(`/attendance/leave-requests/${id}`, {
    decision,
    rejectionReason,
  });
  return data.data;
}

// ── HR Onboarding checklists — the whole /hr router is gated server-side by
// requireHROrOwner (OWNER/STORE_MANAGER/HR/ACCOUNTING).
export async function fetchOnboardingOverview() {
  const { data } = await api.get<ApiEnvelope<OnboardingOverviewItem[]>>('/hr/onboarding');
  return data.data;
}

export async function fetchOnboardingChecklist(userId: string) {
  const { data } = await api.get<ApiEnvelope<OnboardingChecklist>>(`/hr/onboarding/${userId}`);
  return data.data;
}

export async function setOnboardingTaskDone(taskId: string, isDone: boolean) {
  const { data } = await api.patch<ApiEnvelope<OnboardingChecklist>>(`/hr/onboarding/task/${taskId}`, { isDone });
  return data.data;
}

// ── HR Applications (ATS) — /applications is gated server-side by
// requireHROrOwner (OWNER/STORE_MANAGER/HR/ACCOUNTING). Responses are masked
// (Aadhaar/PAN/bank only as last-4). Setting SELECTED creates a candidate
// record server-side and returns a success message.
export async function fetchApplications(status?: ApplicationStatus) {
  const { data } = await api.get<ApiEnvelope<Application[]>>('/applications', {
    params: status ? { status } : undefined,
  });
  return data.data;
}

export async function fetchApplication(id: string) {
  const { data } = await api.get<ApiEnvelope<Application>>(`/applications/${id}`);
  return data.data;
}

export async function setApplicationStatus(id: string, status: ApplicationStatus) {
  const { data } = await api.patch<ApiEnvelope<Application>>(`/applications/${id}/status`, { status });
  return { application: data.data, message: data.message };
}

// Candidate invites — both POSTs email the candidate (via n8n; emailSent is
// false when delivery fails). Resend is only valid for APPLIED/AI_SCREENING,
// non-converted applications with an email on file (server 400 otherwise).
export async function inviteApplicant(input: { name: string; email: string }) {
  const { data } = await api.post<ApiEnvelope<ApplicationInviteResult & { application: Application }>>(
    '/applications/invite',
    input,
  );
  return { ...data.data, message: data.message };
}

export async function resendApplicationInvite(id: string) {
  const { data } = await api.post<ApiEnvelope<ApplicationInviteResult>>(`/applications/${id}/invite/resend`);
  return { ...data.data, message: data.message };
}

export async function fetchApplicationInvite(id: string) {
  const { data } = await api.get<ApiEnvelope<ApplicationInvite | null>>(`/applications/${id}/invite`);
  return data.data;
}

// AI screening reads the résumé and calls an LLM — slow, so it gets the same
// 120s ceiling as the other AI endpoints in this file (default is 15s). Needs a
// résumé + roleApplied and a non-converted application (server 400 otherwise);
// writes aiScreeningResult/aiScreenedAt only, never `status`.
export async function runAiScreening(id: string) {
  const { data } = await api.post<ApiEnvelope<Application>>(`/applications/${id}/ai-screen`, undefined, { timeout: 120000 });
  return data.data;
}

export async function fetchRoleCoverage() {
  const { data } = await api.get<ApiEnvelope<RoleCoverage[]>>('/applications/role-coverage');
  return data.data;
}

// Read-only; no AI call. Excludes REJECTED and converted applications.
export async function fetchCandidateComparison(role: string) {
  const { data } = await api.get<ApiEnvelope<CompareCandidate[]>>('/applications/compare', { params: { role } });
  return data.data;
}

// AI interview invite (AI_INTERVIEW stage) — EMAILS the candidate a personal
// link. Needs status AI_INTERVIEW, roleApplied, not converted, and an approved
// competency template for the role; the server answers 400 with
// `noLiveTemplate: true` (read it off err.response.data) when there's none.
// Resending revokes the previous pending invite. Question generation can be an
// LLM call, hence the 120s ceiling.
export async function sendInterviewInvite(id: string, expiresInHours: number) {
  const { data } = await api.post<ApiEnvelope<InterviewInviteResult>>(
    `/applications/${id}/interview-invite`,
    { expiresInHours },
    { timeout: 120000 },
  );
  return { ...data.data, message: data.message };
}

export async function fetchInterviewInvite(id: string) {
  const { data } = await api.get<ApiEnvelope<ApplicationInvite | null>>(`/applications/${id}/interview-invite`);
  return data.data;
}

// Practical Assessment questions (Assessment stage). Generate is an LLM call
// (120s ceiling like runAiScreening), needs status ASSESSMENT + roleApplied +
// not converted, and replaces every unsent draft. Edit/delete/approve are
// refused once a question was sent (assessmentInviteId set); editing the text
// clears its approval. sendAssessment (approve-all) approves any still-pending
// question, creates the invite, EMAILS the candidate and locks the questions.
export async function fetchPracticalQuestions(id: string) {
  const { data } = await api.get<ApiEnvelope<PracticalQuestionsData>>(`/applications/${id}/practical-questions`);
  return data.data;
}

export async function generatePracticalQuestions(id: string) {
  const { data } = await api.post<ApiEnvelope<PracticalQuestion[]>>(
    `/applications/${id}/practical-questions/generate`,
    undefined,
    { timeout: 120000 },
  );
  return { questions: data.data, message: data.message };
}

export async function updatePracticalQuestion(id: string, questionId: string, body: { questionText?: string; sortOrder?: number }) {
  const { data } = await api.patch<ApiEnvelope<PracticalQuestion>>(`/applications/${id}/practical-questions/${questionId}`, body);
  return data.data;
}

export async function deletePracticalQuestion(id: string, questionId: string) {
  const { data } = await api.delete<ApiEnvelope<{ deleted: boolean }>>(`/applications/${id}/practical-questions/${questionId}`);
  return data.data;
}

export async function approvePracticalQuestion(id: string, questionId: string) {
  const { data } = await api.post<ApiEnvelope<PracticalQuestion>>(`/applications/${id}/practical-questions/${questionId}/approve`);
  return data.data;
}

export async function sendAssessment(id: string, expiresInHours: number) {
  const { data } = await api.post<ApiEnvelope<SendAssessmentResult>>(
    `/applications/${id}/practical-questions/approve-all`,
    { expiresInHours },
  );
  return { ...data.data, message: data.message };
}

// Manager Interview scheduling — each of these emails the candidate and
// interviewer (calendar invite); the response carries per-recipient flags.
// Schedule requires status MANAGER_INTERVIEW, not converted, and no existing
// SCHEDULED row (server 400 otherwise).
export async function fetchInterviewDefaults() {
  const { data } = await api.get<ApiEnvelope<{ companyLocation: string | null }>>('/applications/interview-defaults');
  return data.data;
}

export async function scheduleInterview(id: string, body: InterviewScheduleInput) {
  const { data } = await api.post<ApiEnvelope<InterviewScheduleResult>>(`/applications/${id}/interview-schedule`, body);
  return { ...data.data, message: data.message };
}

export async function rescheduleInterview(id: string, scheduleId: string, body: InterviewScheduleInput) {
  const { data } = await api.patch<ApiEnvelope<InterviewScheduleResult>>(`/applications/${id}/interview-schedule/${scheduleId}`, body);
  return { ...data.data, message: data.message };
}

export async function cancelInterview(id: string, scheduleId: string) {
  const { data } = await api.post<ApiEnvelope<InterviewScheduleResult>>(`/applications/${id}/interview-schedule/${scheduleId}/cancel`);
  return { ...data.data, message: data.message };
}

// ── Work-docs attachments on a Timesheet — BLOCKED_ROLES=[TECHNICIAN,STAFF]
// are denied this entire router server-side; MANAGER_ROLES=[OWNER,STORE_MANAGER]
// or the doc's own creator may otherwise view/edit/upload.
export async function fetchWorkDocsForTimesheet(timesheetId: string) {
  const { data } = await api.get<ApiEnvelope<WorkDocumentation[]>>(`/work-docs/timesheet/${timesheetId}`);
  return data.data;
}

export async function fetchWorkDoc(id: string) {
  const { data } = await api.get<ApiEnvelope<WorkDocumentation>>(`/work-docs/${id}`);
  return data.data;
}

export async function createWorkDoc(
  timesheetId: string,
  input: { description: string; type?: 'VENDOR' | 'CUSTOMER_INTERACTION'; vendorName?: string; contactPhone?: string },
) {
  const { data } = await api.post<ApiEnvelope<WorkDocumentation>>(`/work-docs/timesheet/${timesheetId}`, input);
  return data.data;
}

// Field name 'file', mime/size limits match backend exactly (jpeg/png/webp/
// gif/heic/pdf/doc/docx/xls/xlsx, 20MB) — enforced client-side too via
// src/lib/upload.ts's validatePickedFile before this is ever called.
export async function uploadWorkDocFile(
  workDocId: string,
  file: { uri: string; name: string; mimeType: string },
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<ApiEnvelope<WorkDocumentationFile>>(`/work-docs/${workDocId}/files`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data.data;
}

export async function deleteWorkDocFile(workDocId: string, fileId: string) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/work-docs/${workDocId}/files/${fileId}`);
  return data.data;
}

// PUT /work-docs/:id — owner (createdById) or manager; type itself is never
// editable once created (backend/src/routes/work-docs.ts, re-verified
// 2026-09-24) — only the fields below.
export async function updateWorkDoc(
  workDocId: string,
  input: {
    description?: string; vendorName?: string; contactPhone?: string;
    quotedPrice?: number | null; finalPrice?: number | null;
    customerId?: string | null; jobCardId?: string | null; quotes?: number[];
  },
) {
  const { data } = await api.put<ApiEnvelope<WorkDocumentation>>(`/work-docs/${workDocId}`, input);
  return data.data;
}

// POST /work-docs/:id/reply — MANAGER_ROLES only server-side; self can still
// read replies (included on every fetch), just can't post one.
export async function replyToWorkDoc(workDocId: string, message: string) {
  const { data } = await api.post<ApiEnvelope<{ reply: WorkDocReply; task: TimesheetFollowUpTask }>>(`/work-docs/${workDocId}/reply`, { message });
  return data.data;
}

export async function fetchInventoryItems() {
  const { data } = await api.get<ApiEnvelope<InventoryItemRow[]>>('/inventory-items');
  return data.data;
}

export async function createInventoryItem(input: InventoryItemInput) {
  const { data } = await api.post<ApiEnvelope<InventoryItemRow>>('/inventory-items', input);
  return data.data;
}

export async function updateInventoryItem(id: string, input: Partial<InventoryItemInput>) {
  const { data } = await api.patch<ApiEnvelope<InventoryItemRow>>(`/inventory-items/${id}`, input);
  return data.data;
}

export async function addInventoryReceipt(itemId: string, input: InventoryReceiptInput) {
  const { data } = await api.post<ApiEnvelope<unknown>>(`/inventory-items/${itemId}/receipts`, input);
  return data.data;
}

export async function fetchInventoryItemDetail(id: string) {
  const { data } = await api.get<ApiEnvelope<InventoryItemDetail>>(`/inventory-items/${id}`);
  return data.data;
}

// GET /inventory-items/incoming — requireInventoryRead. 100% new plumbing;
// nothing pre-existing to reuse for drafts/incoming receipts.
export async function fetchIncomingReceipts() {
  const { data } = await api.get<ApiEnvelope<DraftReceipt[]>>('/inventory-items/incoming');
  return data.data;
}

// POST /inventory-items/receipts/:receiptId/confirm-arrival —
// requireInventoryWrite. NOTE: the dashboard's form also sends a
// storeLocation field on confirm, but the backend handler silently drops
// it (verified by reading the route body — it destructures
// quantityReceived/receiptDate/notes only) — do not send it here either,
// it would have no effect; set the receipt's location afterward via
// updateInventoryReceipt() instead if needed.
export async function confirmReceiptArrival(receiptId: string, input: ConfirmArrivalInput) {
  const { data } = await api.post<ApiEnvelope<{ barcode: string; receipt: StockReceipt }>>(`/inventory-items/receipts/${receiptId}/confirm-arrival`, input);
  return data.data;
}

// DELETE /inventory-items/receipts/:receiptId — requireInventoryWrite, only
// succeeds while the receipt is still a draft (receiptDate null); the
// backend 409s otherwise ("Cannot delete a confirmed receipt").
export async function deleteDraftReceipt(receiptId: string) {
  await api.delete(`/inventory-items/receipts/${receiptId}`);
}

// PATCH /inventory-items/receipts/:receiptId (requireInventoryWrite) — the
// same route both the dashboard's EditBatchModal (full field set) and its
// lightweight inline store-location edit use.
export async function updateInventoryReceipt(receiptId: string, input: UpdateReceiptInput) {
  const { data } = await api.patch<ApiEnvelope<StockReceipt>>(`/inventory-items/receipts/${receiptId}`, input);
  return data.data;
}

export async function logItemOut(input: ItemOutInput) {
  const { data } = await api.post<ApiEnvelope<ItemOutLog>>('/inventory-items/items-out', input);
  return data.data;
}

// GET /inventory-items/items-out — requireInventoryRead. Previously no list
// function existed at all; only the create (above) was wired up.
export async function fetchItemsOut(params?: { date?: string; item?: string; reason?: string; status?: string }) {
  const { data } = await api.get<ApiEnvelope<ItemOutLog[]>>('/inventory-items/items-out', { params });
  return data.data;
}

// Delete/images/reconcile/barcode/bill-upload — added 2026-09-24, closing
// the gap flagged when inventory write actions were built earlier this
// pass. Same requireInventoryWrite gate as every other write route in
// inventory_items_route.ts. Bulk XLSX import (POST /inventory-items/import)
// is NOT built here — the dashboard parses .xlsx/.xls client-side via the
// `xlsx` npm package before sending pre-parsed rows, and mobile has no
// document-picker installed to even pick a spreadsheet file in the first
// place; flagged per the hard-stop rule.
export async function deleteInventoryItem(id: string) {
  const { data } = await api.delete<ApiEnvelope<{ deleted: true }>>(`/inventory-items/${id}`);
  return data.data;
}

// {count} is the physically-counted total; the server distributes the diff
// across receipts (most recent first) and stamps lastVerifiedAt/By/Count —
// no separate reason/notes field on this item-level route (the dashboard's
// richer per-receipt ReconcileModal with a reason enum is a different,
// receipt-scoped endpoint not used here).
export async function reconcileInventoryItem(id: string, count: number) {
  const { data } = await api.post<ApiEnvelope<InventoryItemRow>>(`/inventory-items/${id}/reconcile`, { count });
  return data.data;
}

// POST /api/v1/inventory/stock-receipts/:id/reconcile — requireRoles(OWNER,
// STORE_MANAGER, TECH_TEAM, INVENTORY_MANAGER), a wider gate than this
// screen's other write actions (adds TECH_TEAM). Receipt-level, with a
// reason enum — distinct from reconcileInventoryItem() above.
export async function reconcileStockReceipt(receiptId: string, physicalCount: number, reason: ReconcileReason, notes?: string) {
  const { data } = await api.post<ApiEnvelope<{ receipt: StockReceipt; reconciliation: ReconciliationRecord }>>(
    `/inventory/stock-receipts/${receiptId}/reconcile`,
    { physicalCount, reason, notes },
  );
  return data.data;
}

export async function fetchReconciliationHistory(receiptId: string) {
  const { data } = await api.get<ApiEnvelope<ReconciliationRecord[]>>(`/inventory/stock-receipts/${receiptId}/reconciliation-history`);
  return data.data;
}

// Field name 'files' (up to 10); jpeg/png/webp/heic, requireInventoryWrite.
// Public URLs (uploadFileToAzure, not the private-storage pattern used
// elsewhere) — matches WorkDocumentationFile's pattern, not identity docs'.
export async function uploadInventoryImages(
  id: string,
  file: { uri: string; name: string; mimeType: string },
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('files', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<ApiEnvelope<InventoryItemRow>>(`/inventory-items/${id}/images`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data.data;
}

export async function deleteInventoryImage(id: string, url: string) {
  const { data } = await api.delete<ApiEnvelope<InventoryItemRow>>(`/inventory-items/${id}/images`, { data: { url } });
  return data.data;
}

// FT###### sequential — scans every existing barcode (both the legacy
// Inventory model and StockReceipt) to find the next free number.
export async function fetchNextBarcode() {
  const { data } = await api.get<ApiEnvelope<{ barcode: string }>>('/inventory-items/next-barcode');
  return data.data;
}

// backend/src/routes/inventory.ts (the legacy router, mounted separately —
// a plain upload utility, not tied to either inventory model) POST
// /inventory/upload-bill, field 'bill', requireRoles(OWNER,STORE_MANAGER,
// INVENTORY_MANAGER). No real OCR/extraction happens here despite the
// "Bill OCR" name in the parity plan — it just stores the file and returns
// a public URL, which the caller then passes as billUrl on POST /:id/
// receipts. Mirrors the dashboard's BillUpload exactly.
export async function uploadInventoryBill(
  file: { uri: string; name: string; mimeType: string },
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('bill', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<ApiEnvelope<{ billUrl: string }>>('/inventory/upload-bill', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data.data;
}

// ── Inventory page (dashboard parity) ───────────────────────────────────────
// GET /inventory-items with the dashboard's own server-side filters. Rows carry
// effectiveStatus, receipts and incentive/compatibility/warranty/notes.
export async function fetchInventoryList(params?: InventoryListParams) {
  const { data } = await api.get<ApiEnvelope<InventoryListItem[]>>('/inventory-items', { params });
  return data.data;
}

// PATCH /inventory-items/:id with the Edit Product payload (status may be
// EXPIRED, which the narrower ItemStatus type does not list).
export async function saveInventoryItemEdits(id: string, input: Record<string, unknown>) {
  const { data } = await api.patch<ApiEnvelope<InventoryListItem>>(`/inventory-items/${id}`, input);
  return data.data;
}

// The wizard's receipt body (barcode, seller, dealer price, GST, logistics…).
// POST /inventory-items/:id/receipts, requireInventoryWrite.
export async function createInventoryReceiptFull(itemId: string, input: Record<string, unknown>) {
  const { data } = await api.post<ApiEnvelope<unknown>>(`/inventory-items/${itemId}/receipts`, input);
  return data.data;
}

// The dashboard's LogisticsForm asks the legacy router for the next barcode
// (GET /inventory/next-barcode): the /inventory-items copy sits behind /:id.
export async function fetchNextBatchBarcode() {
  const { data } = await api.get<ApiEnvelope<{ barcode: string }>>('/inventory/next-barcode');
  return data.data;
}

// GET /inventory-items/check-seller-match — null when no batch matches.
export async function checkSellerMatch(itemId: string, sellerName: string) {
  const { data } = await api.get<ApiEnvelope<SellerMatch | null>>('/inventory-items/check-seller-match', { params: { itemId, sellerName } });
  return data.data;
}

// POST /inventory-items/receipts/:receiptId/assign-barcode → { barcode }
export async function assignReceiptBarcode(receiptId: string) {
  const { data } = await api.post<ApiEnvelope<{ barcode: string }>>(`/inventory-items/receipts/${receiptId}/assign-barcode`);
  return data.data.barcode;
}

// GET /inventory-items/lookup-barcode?barcode= (Items Out form).
export async function lookupInventoryBarcode(barcode: string) {
  const { data } = await api.get<ApiEnvelope<BarcodeLookup | null>>('/inventory-items/lookup-barcode', { params: { barcode } });
  return data.data;
}

// GET /inventory-items/receipts/:receiptId — the fresh batch Edit Batch loads.
export async function fetchInventoryReceipt(receiptId: string) {
  const { data } = await api.get<ApiEnvelope<StockReceipt & { eta?: string | null }>>(`/inventory-items/receipts/${receiptId}`);
  return data.data;
}

// PATCH /inventory-items/receipts/:receiptId with Edit Batch's full body
// (nullable dealerPrice / eta, which UpdateReceiptInput can't express).
export async function saveInventoryReceiptEdits(receiptId: string, input: Record<string, unknown>) {
  const { data } = await api.patch<ApiEnvelope<StockReceipt>>(`/inventory-items/receipts/${receiptId}`, input);
  return data.data;
}

// POST /inventory-items/import — pre-parsed spreadsheet rows (requireInventoryWrite).
export async function importInventoryRows(rows: Record<string, unknown>[]) {
  const { data } = await api.post<ApiEnvelope<{ created: number; skipped: number; errors: number }>>('/inventory-items/import', { rows });
  return data.data;
}

export async function fetchSalesOrders() {
  const { data } = await api.get<ApiEnvelope<SalesOrder[]>>('/erp/sales');
  return data.data;
}

export async function updateSalesOrderStatus(id: string, status: SOStatus) {
  const { data } = await api.patch<ApiEnvelope<SalesOrder>>(`/erp/sales/${id}/status`, { status });
  return data.data;
}

export async function fetchPurchaseOrders() {
  const { data } = await api.get<ApiEnvelope<PurchaseOrder[]>>('/erp/purchases');
  return data.data;
}

export async function updatePurchaseOrderStatus(id: string, status: POStatus) {
  const { data } = await api.patch<ApiEnvelope<PurchaseOrder>>(`/erp/purchases/${id}/status`, { status });
  return data.data;
}

export async function fetchSims(params?: { search?: string; status?: SimStatus; operator?: string }) {
  const { data } = await api.get<ApiEnvelope<SimCard[]>>('/sims', { params });
  return data.data;
}

// POST/PUT/DELETE /sims are ADMIN_ROLES=[OWNER,STORE_MANAGER]-only server-side
// (backend/src/routes/simRoutes.ts, re-verified 2026-09-24); GET is open to
// any authenticated user, unchanged.
export async function createSim(input: CreateSimInput) {
  const { data } = await api.post<ApiEnvelope<SimCard>>('/sims', input);
  return data.data;
}

export async function updateSim(id: number, input: Partial<CreateSimInput>) {
  const { data } = await api.put<ApiEnvelope<SimCard>>(`/sims/${id}`, input);
  return data.data;
}

export async function deleteSim(id: number) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/sims/${id}`);
  return data.data;
}

export async function fetchCompanySettings() {
  const { data } = await api.get<ApiEnvelope<CompanySettings>>('/settings/supplier');
  return data.data;
}

export async function updateCompanySettings(input: Partial<CompanySettings>) {
  const { data } = await api.put<ApiEnvelope<CompanySettings>>('/settings/supplier', input);
  return data.data;
}

export async function fetchAllTimesheets(page = 1) {
  const { data } = await api.get<ApiEnvelope<AllTimesheetsResponse>>('/timesheets', { params: { page } });
  return data.data;
}

export async function approveTimesheet(id: string) {
  const { data } = await api.patch<ApiEnvelope<AllTimesheetRow>>(`/timesheets/${id}/approve`);
  return data.data;
}

// BUG FIX (2026-09-21): sent no body. PATCH /:id/reject requires a non-empty
// `notes` rejection reason server-side (`if (!notes?.trim()) return 400`) —
// every call would have 400'd. Now takes the reason as a required param.
export async function rejectTimesheet(id: string, notes: string) {
  const { data } = await api.patch<ApiEnvelope<AllTimesheetRow>>(`/timesheets/${id}/reject`, { notes });
  return data.data;
}

export async function fetchTimesheetDetail(id: string) {
  const { data } = await api.get<ApiEnvelope<TimesheetDetail>>(`/timesheets/${id}`);
  return data.data;
}

export async function replyToTimesheetEntry(timesheetId: string, entryId: string, message: string) {
  const { data } = await api.post<ApiEnvelope<TimesheetEntryReply>>(`/timesheets/${timesheetId}/entries/${entryId}/reply`, { message });
  return data.data;
}

// MANAGER_ROLES=[OWNER,STORE_MANAGER] only — narrower than the rest of this
// router (verifyToken-only + BLOCKED_ROLES at the router level).
export async function assignTimesheetEntryTask(timesheetId: string, entryId: string, message: string) {
  const { data } = await api.post<ApiEnvelope<TimesheetFollowUpTask>>(`/timesheets/${timesheetId}/entries/${entryId}/assign-task`, { message });
  return data.data;
}

// Field name 'file'; jpeg/png/webp/heic/pdf; 15MB — matches
// backend/src/routes/timesheets.ts's attachmentUpload multer config exactly.
export async function uploadTimesheetEntryAttachment(
  timesheetId: string,
  entryId: string,
  file: { uri: string; name: string; mimeType: string },
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  const { data } = await api.post<ApiEnvelope<TimesheetEntryAttachment>>(
    `/timesheets/${timesheetId}/entries/${entryId}/attachments`, form,
    { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000, signal: ctrl.signal, onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)) },
  );
  return data.data;
}

export async function deleteTimesheetEntryAttachment(attachmentId: string) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/timesheets/attachments/${attachmentId}`);
  return data.data;
}

// The private attachment container needs an authenticated fetch, same
// pattern as identity documents and agreement PDFs elsewhere in this file.
export async function fetchTimesheetAttachmentDataUri(attachmentId: string, mimeType: string) {
  const { data } = await api.get<ArrayBuffer>(`/timesheets/attachments/${attachmentId}/file`, { responseType: 'arraybuffer' });
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mimeType};base64,${base64Encode(binary)}`;
}

// Deliberately does NOT implement the 409 "confirm to link an existing
// contact" revive flow the dashboard has — that conflict response's shape
// depends on the caller's own contacts-directory access
// (contactConflictBody in timesheets.ts) and is a genuinely separate piece
// of UX. A 409 here surfaces via getErrorMessage as a plain error asking the
// user to use a different number, not silently failing.
export async function linkTimesheetEntryContact(
  timesheetId: string,
  entryId: string,
  input: { phone: string; contactType: ContactType; name?: string; contactTypeOther?: string; reason?: string },
) {
  const { data } = await api.post<ApiEnvelope<TimesheetEntryContactLink>>(`/timesheets/${timesheetId}/entries/${entryId}/contacts`, input);
  return data.data;
}

// Allowed for whoever created the link, or a manager — surfaced via
// getErrorMessage on a 403, not predicted client-side.
export async function unlinkTimesheetEntryContact(linkId: string) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/timesheets/entry-contacts/${linkId}`);
  return data.data;
}

export async function fetchPendingOvertime() {
  const { data } = await api.get<ApiEnvelope<PendingOvertimeRequest[]>>('/overtime/pending');
  return data.data;
}

// GET /overtime — manager sees everyone (optionally filtered by status/
// userId); a non-manager caller is self-scoped server-side regardless of
// what's passed. Added 2026-09-24 (full-parity pass) to cover the
// Approved/Rejected tabs and employee filter the dashboard has that the
// pending-only fetch above can't — that one stays for the existing
// pending-queue view, unchanged.
export async function fetchOvertimeRequests(params?: { status?: string; userId?: string }) {
  const { data } = await api.get<ApiEnvelope<PendingOvertimeRequest[]>>('/overtime', { params });
  return data.data;
}

export async function approveOvertime(id: string) {
  const { data } = await api.patch<ApiEnvelope<PendingOvertimeRequest>>(`/overtime/${id}/approve`);
  return data.data;
}

// rejectionReason added 2026-09-24 — the backend route always accepted it
// (backend/src/routes/overtime.ts PATCH /:id/reject), this client function
// just never sent it.
export async function rejectOvertime(id: string, rejectionReason?: string) {
  const { data } = await api.patch<ApiEnvelope<PendingOvertimeRequest>>(`/overtime/${id}/reject`, { rejectionReason });
  return data.data;
}

export async function fetchAgentStatuses() {
  const { data } = await api.get<ApiEnvelope<AgentStatus[]>>('/agents');
  return data.data;
}

export async function toggleAgent(agentName: string) {
  const { data } = await api.patch<ApiEnvelope<AgentStatus>>(`/agents/${encodeURIComponent(agentName)}/toggle`);
  return data.data;
}

// ── Employees — directory only, never fetches/renders monthlySalary ────────
export async function fetchEmployees() {
  const { data } = await api.get<ApiEnvelope<EmployeeListItem[]>>('/employees');
  return data.data;
}

export async function fetchEmployee(id: string) {
  const { data } = await api.get<ApiEnvelope<EmployeeDetail>>(`/employees/${id}`);
  return data.data;
}

export async function deactivateEmployee(id: string) {
  const { data } = await api.patch<ApiEnvelope<EmployeeDetail>>(`/employees/${id}/deactivate`);
  return data.data;
}

// OWNER only — hard delete with cascade reassignment of the employee's
// records to the caller (backend/src/routes/employees.ts DELETE /:id/permanent).
// Not the same action as deactivateEmployee above (soft, requireManagerOrOwner).
export async function permanentlyDeleteEmployee(id: string) {
  const { data } = await api.delete<ApiEnvelope<Record<string, never>>>(`/employees/${id}/permanent`);
  return data.data;
}

// requireManagerOrOwner — same list as create/update below.
export async function resetEmployeePassword(id: string) {
  const { data } = await api.post<ApiEnvelope<{ temporaryPassword: string }>>(`/employees/${id}/reset-password`);
  return data.data;
}

// requireManagerOrOwner=[OWNER,STORE_MANAGER,HR,ACCOUNTING,CASHIER]. role
// defaults to STAFF server-side if omitted; ASSIGNABLE_ROLES excludes OWNER
// (you cannot create another Owner through this route).
export async function createEmployee(input: {
  name: string;
  username: string;
  phone?: string;
  role?: string;
  designation?: string;
  monthlySalary?: number;
  salaryType?: string;
  joiningDate?: string;
  deviceUserId?: string;
  email?: string;
  branch?: string;
  personalEmail?: string;
}) {
  const { data } = await api.post<ApiEnvelope<{ user: EmployeeDetail; temporaryPassword: string }>>('/employees', input);
  return data.data;
}

// ── Configure — permission modes ────────────────────────────────────────────
export async function fetchTabRegistry() {
  const { data } = await api.get<ApiEnvelope<TabDef[]>>('/permissions/tabs/registry');
  return data.data;
}

export async function fetchEmployeePermissions(employeeId: string) {
  const { data } = await api.get<ApiEnvelope<EmployeePermissions>>(`/permissions/${employeeId}`);
  return data.data;
}

export async function updateEmployeePermissions(
  employeeId: string,
  tabs: Record<string, boolean | { enabled: boolean; mode: string }>
) {
  const { data } = await api.put<ApiEnvelope<unknown>>(`/permissions/${employeeId}`, { tabs });
  return data.data;
}

// ── MDM / Devices ────────────────────────────────────────────────────────────
export async function fetchDevices() {
  const { data } = await api.get<ApiEnvelope<{ devices: DeviceRow[] }>>('/devices');
  return data.data.devices;
}

export async function lockDevice(id: string) {
  const { data } = await api.patch<ApiEnvelope<DeviceRow>>(`/devices/${id}/lock`);
  return data.data;
}

export async function unlockDevice(id: string) {
  const { data } = await api.patch<ApiEnvelope<DeviceRow>>(`/devices/${id}/unlock`);
  return data.data;
}

export async function fetchDeviceAlerts() {
  const { data } = await api.get<ApiEnvelope<DeviceAlert[]>>('/devices/alerts');
  return data.data;
}

export async function markDeviceAlertRead(id: string) {
  const { data } = await api.patch<ApiEnvelope<DeviceAlert>>(`/devices/alerts/${id}/read`);
  return data.data;
}

export async function fetchDevice(id: string) {
  const { data } = await api.get<ApiEnvelope<DeviceDetail>>(`/devices/${id}`);
  return data.data;
}

export async function fetchDeviceLocationLogs(id: string) {
  const { data } = await api.get<ApiEnvelope<DeviceLocationLog[]>>(`/devices/${id}/location-logs`);
  return data.data;
}

export async function fetchDeviceAppUsage(id: string) {
  const { data } = await api.get<ApiEnvelope<DeviceAppUsage[]>>(`/devices/${id}/app-usage`);
  return data.data;
}

export async function fetchRolePolicies(role: string) {
  const { data } = await api.get<ApiEnvelope<RoleAppPolicy[]>>(`/devices/policies/${role}`);
  return data.data;
}

// Policy write + enrollment-code — added 2026-09-24 (full-parity pass).
// POST/DELETE /devices/policies are OWNER-only (requireRoles('OWNER'));
// generate-code is MDM_ADMIN_ROLES=[OWNER,STORE_MANAGER,HR], same as the
// read routes this screen already used (verified by reading devices.ts).
// The actual device *enrollment* action (POST /devices/enroll) is
// deliberately not built — that's called BY the device being enrolled
// (an MDM agent app), not initiated by an admin from this employee app;
// generating the code to hand off is the admin-side action that belongs
// here.
export async function savePolicy(input: { role: string; appName: string; packageName?: string; deviceType: string; isAllowed: boolean }) {
  const { data } = await api.post<ApiEnvelope<RoleAppPolicy>>('/devices/policies', input);
  return data.data;
}

export async function deletePolicy(id: string) {
  const { data } = await api.delete<ApiEnvelope<{ deleted: boolean }>>(`/devices/policies/${id}`);
  return data.data;
}

export async function generateEnrollmentCode() {
  const { data } = await api.post<ApiEnvelope<{ enrollmentCode: string; expiresIn: string }>>('/devices/generate-code');
  return data.data;
}

export async function fetchAgentActivity() {
  const { data } = await api.get<ApiEnvelope<AgentActivity[]>>('/agents/activity');
  return data.data;
}

export async function fetchSimStats() {
  const { data } = await api.get<ApiEnvelope<SimStats>>('/sims/stats');
  return data.data;
}

// ── Payroll — server-gated to OWNER/STORE_MANAGER/CASHIER; the mobile UI
// also never shows the Payroll entry point to any other role (more/index.tsx).
export async function fetchCompanyPayroll(month: number, year: number) {
  const { data } = await api.get<ApiEnvelope<CompanyPayrollSummary>>('/payroll/all', { params: { month, year } });
  return data.data;
}

export async function fetchEmployeePayroll(userId: string, month: number, year: number) {
  const { data } = await api.get<ApiEnvelope<PayrollResult>>('/payroll/calculate', { params: { userId, month, year } });
  return data.data;
}

// GET /payroll/salary-payments-all — SALARY_ADMIN_ROLES only (inline check,
// backend/src/routes/payroll.ts), feeds the per-employee "Salary Paid —
// {amount} · via {mode} · by {name} · {date}" confirmation banner on the
// Payroll list, same as the dashboard merges it client-side by userId.
export async function fetchSalaryPaymentsAllForMonth(month: number, year: number) {
  const { data } = await api.get<ApiEnvelope<{
    id: string; userId: string; amount: number; mode: string | null; paidAt: string;
    paidBy: { name: string } | null;
  }[]>>('/payroll/salary-payments-all', { params: { month, year } });
  return data.data;
}

// GET /payroll/export — requirePayrollAccess (SALARY_ADMIN_ROLES). Returns an
// xlsx blob (Content-Disposition attachment), not JSON, behind verifyToken
// (bearer header only, no query-param token support server-side) — same
// shape as fetchAgreementPdfDataUri below: fetch through the authenticated
// `api` instance and hand back a data: URI, since this app has no
// expo-file-system/expo-sharing dependency yet for a real save-to-disk flow.
export async function fetchPayrollExportDataUri(month: number, year: number) {
  const { data } = await api.get<ArrayBuffer>('/payroll/export', {
    params: { month, year },
    responseType: 'arraybuffer',
  });
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Encode(binary)}`;
}

// POST/DELETE /payroll/override — requirePayrollAccess (SALARY_ADMIN_ROLES).
export async function setPayrollOverride(input: { userId: string; month: number; year: number; finalSalary: number; note?: string }) {
  const { data } = await api.post<ApiEnvelope<PayrollResult>>('/payroll/override', input);
  return data.data;
}

export async function clearPayrollOverride(input: { userId: string; month: number; year: number }) {
  const { data } = await api.delete<ApiEnvelope<PayrollResult>>('/payroll/override', { data: input });
  return data.data;
}

// GET /payroll/disbursement/:year/:month — requirePayrollAccess (SALARY_ADMIN_ROLES).
export async function fetchPayrollDisbursement(year: number, month: number) {
  const { data } = await api.get<ApiEnvelope<PayrollDisbursementRow[]>>(`/payroll/disbursement/${year}/${month}`);
  return data.data;
}

export async function fetchSalaryPayments(userId: string, year: number) {
  const { data } = await api.get<ApiEnvelope<SalaryPaymentRecord[]>>('/payroll/salary-payments', { params: { userId, year } });
  return data.data;
}

export async function recordSalaryPayment(input: { userId: string; month: number; year: number; amount: number }) {
  const { data } = await api.post<ApiEnvelope<SalaryPaymentRecord>>('/payroll/salary-payment', input);
  return data.data;
}

export async function fetchLoanRepayments(loanId: string) {
  const { data } = await api.get<ApiEnvelope<LoanRepayment[]>>(`/loans/${loanId}/repayments`);
  return data.data;
}

// POST /payroll/disbursement — the dashboard's real "Confirm Payment" action
// on the Disbursement tab (payrollAPI.createDisbursement, frontend/src/lib/
// api.ts). NOT the same endpoint as recordSalaryPayment/POST /payroll/
// salary-payment below — that simpler endpoint exists server-side but the
// dashboard itself never calls it; this one additionally applies loan
// deductions transactionally and is idempotent (409s if already paid this
// month). Pass the exact PayrollDisbursementRow fields back — the backend
// trusts the breakdown the caller was shown, same contract the dashboard
// relies on.
export async function createPayrollDisbursement(input: {
  userId: string; month: number; year: number;
  grossSalary: number; loanDeduction: number; attendanceDeduction: number; netPayable: number;
  amountPaid?: number; mode?: string; note?: string;
  // advanceDeduction/skipAdvanceDeduction added 2026-09-24 (full-parity
  // pass) — the backend route always accepted these (backend/src/routes/
  // payroll.ts POST /disbursement), this client function just never sent
  // them, so the cashier had no way to adjust or skip the legacy-loan
  // deduction before confirming. Same endpoint, richer params only — no
  // payout-logic change (per the explicit go-ahead: "Same endpoint,
  // richer params only, no backend payout-logic change").
  advanceDeduction?: number; skipAdvanceDeduction?: boolean;
  // totalDeductions — stored verbatim into salaryPayment.note (JSON) and
  // read back by GET /disbursement's already-paid view; not sending it just
  // means that view later shows 0 for this payment's total deductions.
  totalDeductions?: number;
}) {
  const { data } = await api.post<ApiEnvelope<SalaryPaymentRecord>>('/payroll/disbursement', input);
  return data.data;
}

// DELETE /payroll/salary-payment — undo. Also reverses any loan repayments
// applied by the matching disbursement, server-side (backend/src/routes/
// payroll.ts) — refuses with a 409 if a later month already deducted
// against the same loan; surfaced via getErrorMessage, not predicted here.
export async function undoSalaryPayment(input: { userId: string; month: number; year: number }) {
  const { data } = await api.delete<ApiEnvelope<null>>('/payroll/salary-payment', { data: input });
  return data.data;
}

// ── Incentives — reads: OWNER/STORE_MANAGER/HR/ACCOUNTING/CASHIER; writes
// (targets, PUT amount): CASHIER/OWNER only (requireCashierOrOwner) — mobile
// hides write controls for other roles and handles a 403 as a backstop.
export async function fetchIncentives(month: number, year: number) {
  const { data } = await api.get<ApiEnvelope<IncentiveRosterEntry[]>>('/incentives', { params: { month, year } });
  return data.data;
}

export async function addIncentiveTarget(userId: string) {
  const { data } = await api.post<ApiEnvelope<unknown>>('/incentives/targets', { userId });
  return data.data;
}

export async function setIncentiveAmount(
  userId: string,
  month: number,
  year: number,
  input: { amount: number; note?: string }
) {
  const { data } = await api.put<ApiEnvelope<unknown>>(`/incentives/${userId}`, input, { params: { month, year } });
  return data.data;
}

export async function fetchIncentiveHistory(userId: string) {
  const { data } = await api.get<ApiEnvelope<IncentiveHistoryEntry[]>>(`/incentives/${userId}/history`);
  return data.data;
}

// ── Incentive Ledger — credits stack, payouts draw down. Read:
// requireManagerOrOwner (same as the roster above). Write (credits/payouts):
// requireCashierOrOwner — CASHIER/OWNER only, narrower than the roster read
// set, same WRITE_ROLES the per-month amount editor already uses.
export async function fetchIncentiveLedger(userId: string) {
  const { data } = await api.get<ApiEnvelope<IncentiveLedger>>(`/incentives/${userId}/ledger`);
  return data.data;
}

export async function addIncentiveCredit(input: { userId: string; amount: number; note?: string }) {
  const { data } = await api.post<ApiEnvelope<IncentiveCredit>>('/incentives/credits', input);
  return data.data;
}

export async function editIncentiveCredit(id: string, input: { amount: number; note?: string }) {
  const { data } = await api.patch<ApiEnvelope<IncentiveCredit>>(`/incentives/credits/${id}`, input);
  return data.data;
}

export async function recordIncentivePayout(input: { userId: string; amount: number; note?: string }) {
  const { data } = await api.post<ApiEnvelope<IncentivePayout>>('/incentives/payouts', input);
  return data.data;
}

// ── Payslips — router-level gate to OWNER/STORE_MANAGER/CASHIER.
export async function fetchPayslipPrefill(userId: string, month: number, year: number) {
  const { data } = await api.get<ApiEnvelope<PayslipPrefill>>('/payslips/prefill', { params: { userId, month, year } });
  return data.data;
}

export async function fetchPayslip(id: string) {
  const { data } = await api.get<ApiEnvelope<Payslip>>(`/payslips/${id}`);
  return data.data;
}

export async function createPayslip(input: {
  userId: string;
  month: number;
  year: number;
  employeeName: string;
  employeeRole?: string;
  earnings: PayslipLineItem[];
  deductions: PayslipLineItem[];
  notes?: string;
  overwrite?: boolean;
}) {
  const { data } = await api.post<ApiEnvelope<Payslip>>('/payslips', input);
  return data.data;
}

// GET /payslips/mine and GET /payslips/:id/pdf are open to any authenticated
// user, scoped to their own payslips server-side (canAccessPayslip) — no
// role gate here, unlike the admin-only prefill/create above.
export async function fetchMyPayslips() {
  const { data } = await api.get<ApiEnvelope<PayslipListItem[]>>('/payslips/mine');
  return data.data;
}

export async function downloadPayslipPdf(id: string, month: number, year: number): Promise<{ uri: string; filename: string }> {
  const token = await tokenStorage.get();
  const filename = `payslip-${year}-${String(month).padStart(2, '0')}.pdf`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}/payslips/${id}/pdf`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return { uri: result.uri, filename };
}

// Applicant documents (résumé / Aadhaar image / salary slip) — each endpoint
// streams raw bytes behind the Bearer token (requireHROrOwner) and 404s when
// that document wasn't uploaded. Same download-to-cache approach as
// downloadPayslipPdf, plus a status check: downloadAsync resolves even on a
// 404/500, which would otherwise save the JSON error body as the "file".
export type ApplicationFileKind = 'resume' | 'aadhaar-image' | 'salary-slip';

export async function downloadApplicationFile(
  id: string,
  kind: ApplicationFileKind,
  serverFilename?: string | null,
): Promise<{ uri: string; filename: string }> {
  const token = await tokenStorage.get();
  // Keep the server's name (it carries the real extension) but strip anything
  // that isn't safe in a path, and prefix kind+id so two applicants' files
  // never collide in the cache.
  const safe = (serverFilename ?? kind).replace(/[^\w.\-]+/g, '_');
  const filename = `application-${kind}-${id}-${safe}`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}/applications/${id}/${kind}`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    throw new Error(
      result.status === 404 ? 'This document is no longer available.' : `Could not download the file (error ${result.status}).`,
    );
  }
  return { uri: result.uri, filename: serverFilename || filename };
}

// HR report exports — GET /hr-reports/:kind?from=&to=&format= streams a PDF or
// Excel file behind the Bearer token (requireHROrOwner). `from`/`to` must be
// YYYY-MM-DD (not ISO timestamps) with from <= to, or the server answers 400.
// Same download-to-cache approach as downloadApplicationFile; on a non-2xx the
// body is a JSON error, so read its message before discarding the file.
export async function downloadHrReport(
  kind: HrReportKind,
  from: string,
  to: string,
  format: HrReportFormat,
): Promise<{ uri: string; filename: string; mimeType: string }> {
  const token = await tokenStorage.get();
  const isExcel = format === 'excel';
  const filename = `${kind}-report-${from}-to-${to}.${isExcel ? 'xlsx' : 'pdf'}`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const url = `${API_BASE_URL}/hr-reports/${kind}?from=${from}&to=${to}&format=${format}`;
  const result = await FileSystem.downloadAsync(url, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status < 200 || result.status >= 300) {
    let serverMessage: string | undefined;
    try {
      const body = JSON.parse(await FileSystem.readAsStringAsync(result.uri));
      serverMessage = body?.error ?? body?.message;
    } catch {
      // Not JSON — fall back to the status code below.
    }
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    throw new Error(serverMessage ?? `Could not generate the report (error ${result.status}).`);
  }
  return {
    uri: result.uri,
    filename,
    mimeType: isExcel ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
  };
}

export async function setEmployeeSalary(userId: string, newSalary: number) {
  const { data } = await api.put<ApiEnvelope<unknown>>(`/staff-config/${userId}/salary`, { newSalary });
  return data.data;
}

// ── Financial — server-gated to OWNER/STORE_MANAGER/HR/ACCOUNTING/CASHIER ──
export async function fetchFinancialOverview() {
  const { data } = await api.get<ApiEnvelope<FinancialOverview>>('/financial/overview');
  return data.data;
}

export async function fetchFinancialKpis() {
  const { data } = await api.get<ApiEnvelope<FinancialKpis>>('/financial/kpis');
  return data.data;
}

export async function fetchFinancialRevenueBreakdown(period?: string, groupBy?: 'service' | 'employee' | 'brand' | 'payment_mode') {
  const { data } = await api.get<ApiEnvelope<RevenueBreakdownItem[]>>('/financial/revenue-breakdown', { params: { period, groupBy } });
  return data.data;
}

// Customer Spend Slabs — requireRoles('OWNER','STORE_MANAGER') ONLY
// (backend/src/routes/financial.ts, re-verified 2026-09-28), narrower than
// every other /financial/* route (requireManagerOrOwner, which also allows
// HR/ACCOUNTING/CASHIER) — gate this section separately, not with the
// screen's own VIEW_ROLES.
export async function fetchCustomerSpendSlabs(fromDate?: string, toDate?: string) {
  const { data } = await api.get<ApiEnvelope<Record<'BELOW_2L' | '2L_TO_5L' | '5L_TO_10L' | 'ABOVE_10L', number>>>('/financial/customer-slabs', { params: { fromDate, toDate } });
  return data.data;
}

export async function fetchCustomerSpendSlabCustomers(slab: string, fromDate?: string, toDate?: string) {
  const { data } = await api.get<ApiEnvelope<SlabCustomer[]>>('/financial/customer-slabs/customers', { params: { slab, fromDate, toDate } });
  return data.data;
}

export async function fetchFinancialOutstanding() {
  const { data } = await api.get<ApiEnvelope<OutstandingResponse>>('/financial/outstanding');
  return data.data;
}

export async function fetchFinancialPaymentsToday() {
  const { data } = await api.get<ApiEnvelope<PaymentsTodayResponse>>('/financial/payments-today');
  return data.data;
}

export async function fetchFinancialTopCustomers() {
  const { data } = await api.get<ApiEnvelope<TopCustomerEntry[]>>('/financial/top-customers');
  return data.data;
}

export async function fetchFinancialGrowth() {
  const { data } = await api.get<ApiEnvelope<MonthlyGrowthEntry[]>>('/financial/growth');
  return data.data;
}

// ── Legal — gated by a per-user LegalAccessConfig row, not a role; the
// screen must handle a 403 gracefully since we can't predict access client-side.
export async function fetchLegalCases(section?: 'PERSONAL' | 'PROFESSIONAL') {
  const { data } = await api.get<ApiEnvelope<LegalCase[]>>('/legal/cases', { params: { section } });
  return data.data;
}

export async function fetchLegalCaseDocuments(caseId: string) {
  const { data } = await api.get<ApiEnvelope<LegalDocument[]>>(`/legal/cases/${caseId}/documents`);
  return data.data;
}

export async function createLegalCase(input: CreateLegalCaseInput) {
  const { data } = await api.post<ApiEnvelope<LegalCase>>('/legal/cases', input);
  return data.data;
}

export async function updateLegalCase(id: string, input: UpdateLegalCaseInput) {
  const { data } = await api.put<ApiEnvelope<LegalCase>>(`/legal/cases/${id}`, input);
  return data.data;
}

export async function uploadLegalDocument(
  caseId: string,
  file: { uri: string; name: string; mimeType: string },
  label: string,
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  form.append('label', label);
  const { data } = await api.post<ApiEnvelope<LegalDocument>>(`/legal/cases/${caseId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data.data;
}

// ── Accounts — server-gated to OWNER/ACCOUNTING ─────────────────────────────
export async function fetchBankAccounts() {
  const { data } = await api.get<ApiEnvelope<BankAccount[]>>('/accounts/bank');
  return data.data;
}

export async function fetchEmis() {
  const { data } = await api.get<ApiEnvelope<EMI[]>>('/accounts/emis');
  return data.data;
}

export async function fetchPaymentReminders() {
  const { data } = await api.get<ApiEnvelope<PaymentReminder[]>>('/accounts/reminders');
  return data.data;
}

export async function createBankAccount(input: CreateBankAccountInput) {
  const { data } = await api.post<ApiEnvelope<BankAccount>>('/accounts/bank', input);
  return data.data;
}

export async function updateBankAccount(id: string, input: UpdateBankAccountInput) {
  const { data } = await api.put<ApiEnvelope<BankAccount>>(`/accounts/bank/${id}`, input);
  return data.data;
}

export async function deactivateBankAccount(id: string) {
  const { data } = await api.delete<ApiEnvelope<{ id: string }>>(`/accounts/bank/${id}`);
  return data.data;
}

export async function updateBankAccountBalance(id: string, balance: number, note?: string) {
  const { data } = await api.post<ApiEnvelope<BankAccount>>(`/accounts/bank/${id}/balance`, { balance, note });
  return data.data;
}

// Every reveal is server-logged (BankAccountReveal row, who + when) — same
// audited-reveal pattern the dashboard uses, not a client-side bypass.
export async function revealBankAccountNumber(id: string) {
  const { data } = await api.get<ApiEnvelope<{ accountNumber: string }>>(`/accounts/bank/${id}/reveal`);
  return data.data;
}

export async function fetchBankAccountReveals(id: string) {
  const { data } = await api.get<ApiEnvelope<BankAccountRevealLog[]>>(`/accounts/bank/${id}/reveals`);
  return data.data;
}

export async function fetchBankBalanceHistory(id: string) {
  const { data } = await api.get<ApiEnvelope<BankBalanceHistoryEntry[]>>(`/accounts/bank/${id}/balance-history`);
  return data.data;
}

export async function fetchEmailCheckStatus() {
  const { data } = await api.get<ApiEnvelope<EmailCheckState>>('/accounts/email-check');
  return data.data;
}

export async function logEmailCheck() {
  const { data } = await api.post<ApiEnvelope<{ checkedToday: true; log: EmailCheckLogEntry }>>('/accounts/email-check');
  return data.data;
}

// Document upload for bank accounts/EMIs — added 2026-09-24, closing the gap
// flagged when Accounts CRUD was built. Field name 'file'; PDF/jpeg/png/
// webp/heic/Office docs; 15MB — matches backend/src/routes/accounts_route.ts's
// docUpload multer config exactly. Private Azure storage, no public url —
// same authenticated-fetch pattern as identity documents (fetchDataUri below).
export async function fetchBankAccountDocuments(accountId: string) {
  const { data } = await api.get<ApiEnvelope<AccountDocument[]>>(`/accounts/bank/${accountId}/documents`);
  return data.data;
}

export async function uploadBankAccountDocument(
  accountId: string,
  file: { uri: string; name: string; mimeType: string },
  label: string | undefined,
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  if (label) form.append('label', label);
  const { data } = await api.post<ApiEnvelope<AccountDocument>>(`/accounts/bank/${accountId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data.data;
}

export async function deleteBankAccountDocument(documentId: string) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/accounts/bank/documents/${documentId}`);
  return data.data;
}

export async function fetchBankAccountDocumentDataUri(documentId: string, mimeType: string) {
  const { data } = await api.get<ArrayBuffer>(`/accounts/bank/documents/${documentId}/file`, { responseType: 'arraybuffer' });
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mimeType};base64,${base64Encode(binary)}`;
}

export async function fetchEmiDocuments(emiId: string) {
  const { data } = await api.get<ApiEnvelope<AccountDocument[]>>(`/accounts/emis/${emiId}/documents`);
  return data.data;
}

// EMI upload requires a non-empty label — the backend 400s without one,
// unlike the bank-doc upload above where label is optional.
export async function uploadEmiDocument(
  emiId: string,
  file: { uri: string; name: string; mimeType: string },
  label: string,
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  form.append('label', label);
  const { data } = await api.post<ApiEnvelope<AccountDocument>>(`/accounts/emis/${emiId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data.data;
}

export async function deleteEmiDocument(documentId: string) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/accounts/emis/documents/${documentId}`);
  return data.data;
}

export async function fetchEmiDocumentDataUri(documentId: string, mimeType: string) {
  const { data } = await api.get<ArrayBuffer>(`/accounts/emis/documents/${documentId}/file`, { responseType: 'arraybuffer' });
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mimeType};base64,${base64Encode(binary)}`;
}

export async function createEMI(input: CreateEMIInput) {
  const { data } = await api.post<ApiEnvelope<EMI>>('/accounts/emis', input);
  return data.data;
}

export async function updateEMI(id: string, input: Partial<CreateEMIInput> & { status?: string }) {
  const { data } = await api.put<ApiEnvelope<EMI>>(`/accounts/emis/${id}`, input);
  return data.data;
}

export async function deleteEMI(id: string) {
  const { data } = await api.delete<ApiEnvelope<{ id: string }>>(`/accounts/emis/${id}`);
  return data.data;
}

export async function markEMIPaid(id: string) {
  const { data } = await api.post<ApiEnvelope<EMI>>(`/accounts/emis/${id}/mark-paid`);
  return data.data;
}

export async function createPaymentReminder(input: CreatePaymentReminderInput) {
  const { data } = await api.post<ApiEnvelope<PaymentReminder>>('/accounts/reminders', input);
  return data.data;
}

export async function updatePaymentReminder(id: string, input: Partial<CreatePaymentReminderInput>) {
  const { data } = await api.put<ApiEnvelope<PaymentReminder>>(`/accounts/reminders/${id}`, input);
  return data.data;
}

export async function deletePaymentReminder(id: string) {
  const { data } = await api.delete<ApiEnvelope<{ id: string }>>(`/accounts/reminders/${id}`);
  return data.data;
}

export async function markPaymentReminderPaid(id: string) {
  const { data } = await api.post<ApiEnvelope<PaymentReminder>>(`/accounts/reminders/${id}/mark-paid`);
  return data.data;
}

// Accounts page (dashboard parity) — the same routes with the dashboard's own
// bodies (nullable EMI fields, reminder reference/paid-by fields).
export async function fetchPaymentRemindersFull() {
  const { data } = await api.get<ApiEnvelope<PaymentReminderFull[]>>('/accounts/reminders');
  return data.data;
}

export async function saveBankAccountRecord(id: string | null, body: Record<string, unknown>) {
  const { data } = id
    ? await api.put<ApiEnvelope<BankAccount>>(`/accounts/bank/${id}`, body)
    : await api.post<ApiEnvelope<BankAccount>>('/accounts/bank', body);
  return data.data;
}

export async function saveEmiRecord(id: string | null, body: Record<string, unknown>) {
  const { data } = id
    ? await api.put<ApiEnvelope<EMI>>(`/accounts/emis/${id}`, body)
    : await api.post<ApiEnvelope<EMI>>('/accounts/emis', body);
  return data.data;
}

export async function saveReminderRecord(id: string | null, body: Record<string, unknown>) {
  const { data } = id
    ? await api.put<ApiEnvelope<PaymentReminderFull>>(`/accounts/reminders/${id}`, body)
    : await api.post<ApiEnvelope<PaymentReminderFull>>('/accounts/reminders', body);
  return data.data;
}

// Streams a private bank-account / EMI document to the cache for the share sheet.
export async function downloadAccountDocument(kind: 'bank' | 'emi', documentId: string, filename: string): Promise<{ uri: string }> {
  const token = await tokenStorage.get();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = `${FileSystem.cacheDirectory}account-${documentId}-${safe}`;
  const path = kind === 'bank' ? `/accounts/bank/documents/${documentId}/file` : `/accounts/emis/documents/${documentId}/file`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}${path}`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status !== 200) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    throw new Error('Failed to open document');
  }
  return { uri: result.uri };
}

// ── ERP Finance — server-gated to OWNER/STORE_MANAGER/ACCOUNTING ───────────
export async function fetchErpFinanceOverview(from?: string, to?: string) {
  const { data } = await api.get<ApiEnvelope<ErpFinanceOverview>>('/erp/finance/overview', {
    params: { from, to },
  });
  return data.data;
}

export async function fetchErpFinanceOrders(params: {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  search?: string;
  source?: 'live' | 'historical';
}) {
  const { data } = await api.get<ApiEnvelope<ErpFinanceOrdersResponse>>('/erp/finance/orders', { params });
  return data.data;
}

export async function fetchErpFinanceSalesPerformance(from?: string, to?: string) {
  const { data } = await api.get<ApiEnvelope<{ employees: ErpFinanceEmployeePerformance[] }>>(
    '/erp/finance/sales-performance',
    { params: { from, to } }
  );
  return data.data.employees;
}

export async function fetchErpFinanceServices(from?: string, to?: string) {
  const { data } = await api.get<ApiEnvelope<ErpFinanceServices>>('/erp/finance/services', {
    params: { from, to },
  });
  return data.data;
}

export async function fetchErpFinanceCustomers(from?: string, to?: string) {
  const { data } = await api.get<ApiEnvelope<ErpFinanceCustomers>>('/erp/finance/customers', {
    params: { from, to },
  });
  return data.data;
}

export async function fetchErpFinanceMonthlyBreakdown(from?: string, to?: string) {
  const { data } = await api.get<ApiEnvelope<ErpFinanceMonthlyBreakdown>>('/erp/finance/monthly-breakdown', {
    params: { from, to },
  });
  return data.data;
}

export async function fetchErpFinanceDaily(from: string, to: string) {
  const { data } = await api.get<ApiEnvelope<{ days: ErpFinanceDailyPoint[] }>>('/erp/finance/daily', {
    params: { from, to },
  });
  return data.data.days;
}

// ── Staff Remarks — GET/POST/PATCH/DELETE / are OWNER-only; GET /mine is any
// authenticated user, self-scoped server-side to VISIBLE_TO_EMPLOYEE rows.
export async function fetchAllStaffRemarks(filters?: {
  employeeId?: string;
  category?: string;
  rating?: string;
  visibility?: string;
}) {
  const { data } = await api.get<ApiEnvelope<StaffRemark[]>>('/remarks', { params: filters });
  return data.data;
}

export async function fetchMyStaffRemarks() {
  const { data } = await api.get<ApiEnvelope<MyRemark[]>>('/remarks/mine');
  return data.data;
}

export async function createStaffRemark(input: CreateRemarkInput) {
  const { data } = await api.post<ApiEnvelope<StaffRemark>>('/remarks', input);
  return data.data;
}

export async function updateStaffRemark(id: string, input: Partial<CreateRemarkInput>) {
  const { data } = await api.patch<ApiEnvelope<StaffRemark>>(`/remarks/${id}`, input);
  return data.data;
}

export async function deleteStaffRemark(id: string) {
  const { data } = await api.delete<ApiEnvelope<{ message: string }>>(`/remarks/${id}`);
  return data.data;
}

// POST /remarks/:id/reply — verifyToken only (no requireOwner): the OWNER may
// reply to any remark, and the remark's own subject may reply only when it
// is VISIBLE_TO_EMPLOYEE (both enforced server-side, backend/src/routes/
// remarks.ts, verified 2026-09-20).
export async function replyToRemark(remarkId: string, body: string) {
  const { data } = await api.post<ApiEnvelope<RemarkReply>>(`/remarks/${remarkId}/reply`, { body });
  return data.data;
}

// ── Owner Dashboard Overview — requireOwner (backend/src/routes/dashboard.ts,
// verified 2026-09-20) gates every route below.
export async function fetchDashboardOverview() {
  const { data } = await api.get<ApiEnvelope<DashboardOverview>>('/dashboard/overview');
  return data.data;
}

export async function fetchOnLeave() {
  const { data } = await api.get<ApiEnvelope<OnLeaveEntry[]>>('/attendance/on-leave');
  return data.data;
}

export async function fetchDashboardRecentActivity(limit = 10) {
  const { data } = await api.get<ApiEnvelope<DashboardRecentActivityItem[]>>('/dashboard/recent-activity', {
    params: { limit },
  });
  return data.data;
}

export async function fetchDashboardTodaySnapshot() {
  const { data } = await api.get<ApiEnvelope<DashboardTodaySnapshot>>('/dashboard/today-snapshot');
  return data.data;
}

export async function fetchDashboardRevenueByEmployee() {
  const { data } = await api.get<ApiEnvelope<DashboardRevenueByEmployee[]>>('/dashboard/revenue-by-employee');
  return data.data;
}

// ── Employee Agreements — every route below is gated identically to
// OWNER/STORE_MANAGER/HR server-side; there is no self-service employee path.
export async function fetchAgreements(filters?: { userId?: string; status?: string }) {
  const { data } = await api.get<ApiEnvelope<AgreementListItem[]>>('/agreements', { params: filters });
  return data.data;
}

export async function fetchAgreement(id: string) {
  const { data } = await api.get<ApiEnvelope<AgreementDetail>>(`/agreements/${id}`);
  return data.data;
}

export async function createAgreement(input: {
  userId: string;
  effectiveDate?: string;
  placeOfSigning?: string;
  witnessName?: string;
}) {
  const { data } = await api.post<ApiEnvelope<AgreementDetail>>('/agreements', input);
  return data.data;
}

export async function signAgreementOwner(id: string, signature: string, ownerName?: string) {
  const { data } = await api.patch<ApiEnvelope<AgreementDetail>>(`/agreements/${id}/sign-owner`, {
    signature,
    ownerName,
  });
  return data.data;
}

export async function signAgreementEmployee(id: string, signature: string, employeeSignedName: string) {
  const { data } = await api.patch<ApiEnvelope<AgreementDetail>>(`/agreements/${id}/sign-employee`, {
    signature,
    employeeSignedName,
  });
  return data.data;
}

export async function voidAgreement(id: string) {
  const { data } = await api.patch<ApiEnvelope<AgreementDetail>>(`/agreements/${id}/void`);
  return data.data;
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64Encode(binary: string): string {
  let out = '';
  let i = 0;
  for (; i + 2 < binary.length; i += 3) {
    const n = (binary.charCodeAt(i) << 16) | (binary.charCodeAt(i + 1) << 8) | binary.charCodeAt(i + 2);
    out += BASE64_CHARS[(n >> 18) & 63] + BASE64_CHARS[(n >> 12) & 63] + BASE64_CHARS[(n >> 6) & 63] + BASE64_CHARS[n & 63];
  }
  const remaining = binary.length - i;
  if (remaining === 1) {
    const n = binary.charCodeAt(i) << 16;
    out += BASE64_CHARS[(n >> 18) & 63] + BASE64_CHARS[(n >> 12) & 63] + '==';
  } else if (remaining === 2) {
    const n = (binary.charCodeAt(i) << 16) | (binary.charCodeAt(i + 1) << 8);
    out += BASE64_CHARS[(n >> 18) & 63] + BASE64_CHARS[(n >> 12) & 63] + BASE64_CHARS[(n >> 6) & 63] + '=';
  }
  return out;
}

// The route returns raw PDF bytes (application/pdf) behind verifyToken, so a
// plain Linking.openURL(url) can't attach the auth header — fetch it through
// the authenticated `api` instance instead and hand back a data: URI.
// ── Timesheets Register — GET /timesheets/register, requireManagerOrOwner
// (OWNER/STORE_MANAGER/HR/ACCOUNTING/CASHIER) — backend/src/routes/
// timesheets.ts. Distinct from the self-scoped my-timesheet screen.
export async function fetchTimesheetRegister(from: string, to: string) {
  const { data } = await api.get<ApiEnvelope<TimesheetRegister>>('/timesheets/register', { params: { from, to } });
  return data.data;
}

// GET /timesheets/export — requireManagerOrOwner, real .xlsx (XLSX.write on
// the server, not CSV) — added 2026-09-24, closing the gap flagged when
// the manager register screen was built. Same authenticated-fetch-as-
// data-uri pattern as fetchPayrollExportDataUri.
export async function fetchTimesheetExportDataUri(params?: { dateFrom?: string; dateTo?: string; userId?: string; status?: string }) {
  const { data } = await api.get<ArrayBuffer>('/timesheets/export', { params, responseType: 'arraybuffer' });
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64Encode(binary)}`;
}

// GET /work-docs/search — MANAGER_ROLES-only, cross-employee full-text
// search over work-doc description/vendorName/customer.name (backend/src/
// routes/work-docs.ts, re-verified 2026-09-24) — a different endpoint from
// GET /work-docs/timesheet/:timesheetId, which is scoped to one timesheet.
export async function searchWorkDocs(params: { q?: string; userId?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number }) {
  const { data } = await api.get<ApiEnvelope<{ docs: WorkDocumentation[]; total: number; page: number; limit: number; totalPages: number }>>('/work-docs/search', { params });
  return data.data;
}

// ── Overtime Approval — GET /overtime/pending + approve/reject already
// exist above as fetchPendingOvertime/approveOvertime/rejectOvertime.

// ── Loans (Finance Approvals — Loans only, no Advances) ─────────────────
// List/create: ADMIN_ROLES=[OWNER,STORE_MANAGER,CASHIER]; approve/reject:
// narrower [OWNER,STORE_MANAGER] with a self-approval / peer-STORE_MANAGER
// block enforced server-side — a 403 from that is expected and surfaced via
// getErrorMessage, never predicted client-side beyond hiding the buttons for
// non OWNER/STORE_MANAGER roles.
export async function fetchLoans() {
  const { data } = await api.get<ApiEnvelope<Loan[]>>('/loans');
  return data.data;
}

export async function approveLoan(id: string) {
  const { data } = await api.patch<ApiEnvelope<Loan>>(`/loans/${id}/approve`);
  return data.data;
}

export async function rejectLoan(id: string, rejectionReason: string) {
  const { data } = await api.patch<ApiEnvelope<Loan>>(`/loans/${id}/reject`, { rejectionReason });
  return data.data;
}

// POST /loans/admin — same ADMIN_ROLES=[OWNER,STORE_MANAGER,CASHIER] gate
// as the list. Cashier-recorded-and-auto-approved advance, added 2026-09-24
// (full-parity pass — dashboard's "Add New Advance" form).
export async function createLoanAdmin(input: {
  userId: string; amount: number; repaymentMode?: string; tenureMonths?: number; notes?: string; scheduleEntries?: number[];
}) {
  const { data } = await api.post<ApiEnvelope<Loan>>('/loans/admin', input);
  return data.data;
}

// PATCH /loans/:id — record-detail correction, ADMIN_ROLES gate but status
// edits are blocked for CASHIER server-side (enforced there, not re-derived
// here). Added 2026-09-24.
export async function updateLoan(id: string, input: {
  amount?: number; remainingAmount?: number; monthlyDeductionAmount?: number; notes?: string; status?: string;
}) {
  const { data } = await api.patch<ApiEnvelope<Loan>>(`/loans/${id}`, input);
  return data.data;
}

// ── Employees — general edit (name/phone/email/designation always;
// role OWNER-only; salary fields SALARY_EDIT_ROLES=[OWNER,STORE_MANAGER,
// CASHIER]) — backend/src/routes/employees.ts PUT /:id. A STORE_MANAGER
// editing an OWNER or peer STORE_MANAGER gets a 403 server-side; surfaced
// via getErrorMessage, not predicted client-side.
export async function updateEmployee(
  id: string,
  input: Partial<{
    name: string;
    phone: string;
    email: string;
    designation: string;
    role: string;
    isActive: boolean;
    monthlySalary: number;
    salaryType: string;
    joiningDate: string;
    deviceUserId: string;
    branch: string;
    personalEmail: string;
  }>
) {
  const { data } = await api.put<ApiEnvelope<EmployeeDetail>>(`/employees/${id}`, input);
  return data.data;
}

// ── Staff Config — separate Prisma model from Employees. ADMIN_ROLES=
// [OWNER,STORE_MANAGER] for shift config; PUT /:userId/salary additionally
// allows CASHIER — backend/src/routes/staffConfig.ts.
// BUG FIX (2026-09-21): this used to be named updateShiftConfig and sent
// {customClockIn, customClockOut, workingDaysPerMonth} to this exact
// endpoint — but PUT /staff-config/:userId is the ShiftConfig arrival-timing
// row (onTimeBeforeH/M, lateBeforeH/M, halfDayBeforeH/M, minFullDayMins,
// ALL required or the backend 400s "All timing fields are required"). Those
// fields never matched, so every save from staff-config.tsx's "Save shift
// config" button always failed. customClockIn/Out/workingDaysPerMonth
// belong to updateStaffConfigAttendanceDefaults below instead.
export async function fetchShiftTimingConfig(userId: string) {
  const { data } = await api.get<ApiEnvelope<ShiftTimingConfig | null>>(`/staff-config/${userId}`);
  return data.data;
}

export async function updateShiftTimingConfig(userId: string, input: Omit<ShiftTimingConfig, 'userId'>) {
  const { data } = await api.put<ApiEnvelope<ShiftTimingConfig>>(`/staff-config/${userId}`, input);
  return data.data;
}

export async function resetShiftTimingConfig(userId: string) {
  const { data } = await api.delete<ApiEnvelope<{ message: string }>>(`/staff-config/${userId}`);
  return data.data;
}

export async function updateStaffConfigAttendanceDefaults(
  userId: string,
  input: Partial<Pick<ShiftConfig, 'defaultLeaves' | 'workingDaysPerMonth' | 'customClockIn' | 'customClockOut'>>,
) {
  const { data } = await api.put<ApiEnvelope<ShiftConfig>>(`/staff-config/${userId}/attendance-defaults`, input);
  return data.data;
}

// setEmployeeSalary (PUT /staff-config/:userId/salary) already exists above.

export async function fetchSalaryHistory(userId: string) {
  const { data } = await api.get<ApiEnvelope<SalaryHistoryEntry[]>>(`/staff-config/${userId}/salary-history`);
  return data.data;
}

// ── Contacts directory — CONTACTS_DIRECTORY_ROLES=[OWNER,STORE_MANAGER,
// TECH_TEAM] gates list/detail/create (requireContactsDirectoryAccess,
// backend/src/middleware/auth.ts); edit (PATCH) is open to any authenticated
// user server-side (no directory gate on that one route specifically), but
// in practice only reachable by the same 3 roles since they're the only ones
// who can see this screen at all; delete is narrower still —
// CONTACTS_DELETE_ROLES=[OWNER,STORE_MANAGER], no TECH_TEAM.
export async function fetchContacts(params?: { q?: string; contactType?: ContactType; page?: number; limit?: number }) {
  const { data } = await api.get<ApiEnvelope<{ contacts: Contact[]; total: number; page: number; limit: number; totalPages: number }>>('/contacts', { params });
  return data.data;
}

export async function fetchContact(id: string) {
  const { data } = await api.get<ApiEnvelope<ContactDetail>>(`/contacts/${id}`);
  return data.data;
}

export async function createContact(input: { phone: string; contactType: ContactType; name?: string; contactTypeOther?: string; reason?: string }) {
  const { data } = await api.post<ApiEnvelope<Contact>>('/contacts', input);
  return data.data;
}

export async function updateContact(id: string, input: { contactType?: ContactType; name?: string; contactTypeOther?: string; reason?: string }) {
  const { data } = await api.patch<ApiEnvelope<Contact>>(`/contacts/${id}`, input);
  return data.data;
}

export async function deleteContact(id: string) {
  const { data } = await api.delete<ApiEnvelope<Contact>>(`/contacts/${id}`);
  return data.data;
}

// ── Phase 3 ──────────────────────────────────────────────────────────────────
// fetchInventoryItems (/inventory-items), fetchSalesOrders (/erp/sales),
// fetchPurchaseOrders (/erp/purchases), fetchBankAccounts (/accounts/bank),
// fetchFinancialOverview (/financial/overview) and fetchLedgers (below)
// already existed above as unused plumbing from an earlier phase — reused
// as-is rather than redefined. Only genuinely new endpoints are added here.

// GET /erp/suppliers — canAccess=[OWNER,STORE_MANAGER,ACCOUNTING,CASHIER,INVENTORY_MANAGER]
// (backend/src/routes/erp-suppliers.ts, verified 2026-09-19).
export async function fetchSuppliers() {
  const { data } = await api.get<ApiEnvelope<ERPSupplier[]>>('/erp/suppliers');
  return data.data;
}

// GET /crm/customers — dynamic customers_jobs tab permission, NOT a static
// role list (backend/src/routes/crm.ts hasCJAccess, verified 2026-09-19).
// Response is raw JSON, not ApiEnvelope-wrapped.
export async function fetchCrmCustomers(page = 1, limit = 50, search?: string) {
  const { data } = await api.get<CrmCustomersResponse>('/crm/customers', {
    params: { page, limit, ...(search ? { search } : {}) },
  });
  return data;
}

// GET /jobs/pipeline — requireManagerOrOwner (backend/src/routes/jobs.ts,
// verified 2026-09-19). Mobile renders this as a grouped-by-status list
// rather than a literal drag-and-drop Kanban board.
export async function fetchJobsPipeline() {
  const { data } = await api.get<ApiEnvelope<PipelineResponse>>('/jobs/pipeline');
  return data.data;
}

// CORRECTED 2026-09-28 (re-verification sweep): this screen was read-only.
// The dashboard's drag-and-drop actually calls apiClient.patch on this
// path, but the only route the backend registers is
// router.put('/:id/status', ...) (backend/src/routes/jobs.ts) — a real
// dashboard bug (its drag silently reverts on every drop). Mobile uses the
// verb that actually works.
export async function updateJobStatus(jobId: string, status: PipelineStatus) {
  const { data } = await api.put<ApiEnvelope<PipelineJob>>(`/jobs/${jobId}/status`, { status });
  return data.data;
}

// GET /calls — requireRoles(CALL_ROLES=[OWNER,STORE_MANAGER,SALES]).
// GET /calls only accepts customerId/direction as real server-side query
// params (backend/src/routes/calls.ts, re-verified 2026-09-24) — the
// dashboard's status/agent/date-range/search/sort filters are all applied
// client-side over the same fetched rows, mirrored the same way here.
export async function fetchCallLog(params?: { customerId?: string; direction?: 'INBOUND' | 'OUTBOUND' }) {
  const { data } = await api.get<ApiEnvelope<CallLogEntry[]>>('/calls', { params });
  return data.data;
}

export async function fetchMyCallRecordingSummary() {
  const { data } = await api.get<ApiEnvelope<CallRecordingSummary[]>>('/call-recordings/my-summary');
  return data.data;
}

// GET /call-recordings/:id — requireFullRecordingAccess = [OWNER,
// STORE_MANAGER] only (backend/src/routes/callRecordings.ts). No
// audio-player dependency (expo-av) is installed in this project — opens
// audioUrl via the OS's own player/browser through Linking.openURL rather
// than an in-app <audio>-equivalent, same substitute pattern used for other
// externally-hosted files in this app (identity documents, legal case
// files) instead of adding a new native dependency mid-task.
export async function fetchCallRecordingDetail(id: string) {
  const { data } = await api.get<ApiEnvelope<CallRecordingDetail>>(`/call-recordings/${id}`);
  return data.data;
}

// GET /accounting/ledgers — ACC_ROLES=[OWNER,STORE_MANAGER,ACCOUNTING,CASHIER,INVENTORY_MANAGER]
// (backend/src/routes/accounting.ts, verified 2026-09-19). includeInactive=true
// returns every ledger (the dashboard then filters to inactive-only itself
// when its "Show inactive only" checkbox is on — it's a filter, not an
// addition); partyType narrows to SUPPLIER/TRANSPORTER server-side.
export async function fetchLedgers(includeInactive?: boolean, partyType?: 'SUPPLIER' | 'TRANSPORTER') {
  const { data } = await api.get<ApiEnvelope<AccountingLedger[]>>('/accounting/ledgers', {
    params: { includeInactive: includeInactive ? 'true' : undefined, partyType },
  });
  return data.data;
}

export async function updateLedger(id: string, input: UpdateLedgerInput) {
  const { data } = await api.patch<ApiEnvelope<AccountingLedger>>(`/accounting/ledgers/${id}`, input);
  return data.data;
}

export async function fetchLedgerDetail(id: string) {
  const { data } = await api.get<ApiEnvelope<LedgerDetail>>(`/accounting/ledgers/${id}`);
  return data.data;
}

export async function createLedger(input: CreateLedgerInput) {
  const { data } = await api.post<ApiEnvelope<AccountingLedger>>('/accounting/ledgers', input);
  return data.data;
}

export async function createPaymentVoucher(input: CreatePaymentVoucherInput) {
  const { data } = await api.post<ApiEnvelope<PaymentVoucher>>('/accounting/payment-vouchers', input);
  return data.data;
}

export async function createPurchaseVoucher(input: CreatePurchaseVoucherInput) {
  const { data } = await api.post<ApiEnvelope<PurchaseVoucher>>('/accounting/purchase-vouchers', input);
  return data.data;
}

// Ledger deactivate/reactivate/delete + voucher cancel + allocation — added
// 2026-09-24 (full-parity pass), same ACC_ROLES gate as every other route
// in backend/src/routes/accounting.ts. Delete is a hard delete the server
// refuses (in a transaction) if the ledger has ANY entry/voucher row, even
// a cancelled one — surfaced via getErrorMessage, telling the caller to
// deactivate instead rather than predicted client-side.
export async function deactivateLedger(id: string) {
  const { data } = await api.post<ApiEnvelope<AccountingLedger>>(`/accounting/ledgers/${id}/deactivate`);
  return data.data;
}

export async function reactivateLedger(id: string) {
  const { data } = await api.post<ApiEnvelope<AccountingLedger>>(`/accounting/ledgers/${id}/reactivate`);
  return data.data;
}

export async function deleteLedger(id: string) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/accounting/ledgers/${id}`);
  return data.data;
}

// Soft-cancel: posts a reversing entry, doesn't delete the original, voids
// any allocations tied to it. cancelReason is mandatory server-side.
export async function cancelPurchaseVoucher(id: string, cancelReason: string) {
  const { data } = await api.post<ApiEnvelope<PurchaseVoucher>>(`/accounting/purchase-vouchers/${id}/cancel`, { cancelReason });
  return data.data;
}

export async function cancelPaymentVoucher(id: string, cancelReason: string) {
  const { data } = await api.post<ApiEnvelope<PaymentVoucher>>(`/accounting/payment-vouchers/${id}/cancel`, { cancelReason });
  return data.data;
}

// Spends an existing unallocated advance (a PAYMENT voucher's `available`)
// against a specific outstanding purchase voucher. Amount is capped
// server-side at min(purchase voucher's outstanding, payment voucher's
// available) — not re-derived client-side, just surfaced on failure.
export async function createAllocation(input: { paymentVoucherId: string; purchaseVoucherId: string; amount: number }) {
  const { data } = await api.post<ApiEnvelope<unknown>>('/accounting/allocations', input);
  return data.data;
}

// Debit notes (purchase returns) — confirmed live on main 2026-09-27 (PR #46
// merged; an earlier note here claiming these were dev-branch-only and out
// of scope was correct at the time but is now stale).
export async function postDebitNote(input: PostDebitNoteInput) {
  const { data } = await api.post<ApiEnvelope<DebitNote>>('/accounting/debit-notes', input);
  return data.data;
}

export async function cancelDebitNote(id: string, cancelReason: string) {
  const { data } = await api.post<ApiEnvelope<DebitNote>>(`/accounting/debit-notes/${id}/cancel`, { cancelReason });
  return data.data;
}

// "Paid now" for a transporter — books the expense (PurchaseVoucher) AND
// settles it (PaymentVoucher, fully allocated) in one atomic call. A bare
// payment voucher alone never touches PURCHASE_EXPENSE, so it would show as
// a false advance instead of a booked expense.
export async function postPaidTransporterVoucher(input: PostPaidTransporterVoucherInput) {
  const { data } = await api.post<ApiEnvelope<{ purchaseVoucher: PurchaseVoucher; paymentVoucher: PaymentVoucher }>>('/accounting/paid-transporter-vouchers', input);
  return data.data;
}

// CORRECTED 2026-09-28: the comment that used to be here claimed reveal was
// out of scope — false, revealBankAccountNumber() above is real and used.
// fetchBankAccounts and fetchFinancialOverview already exist above and are
// reused as-is.

// ── My Attendance (full module) — GET /attendance/warnings is self-or-manager
// scoped via verifyToken alone (backend/src/routes/attendance.ts, verified
// 2026-09-20); no userId param is ever passed here so it always returns our
// own warnings regardless of role. fetchMyLateRecords and
// fetchMyMonthlyAttendance already exist above and are reused as-is.
export async function fetchMyWarnings() {
  const { data } = await api.get<ApiEnvelope<WarningRecord[]>>('/attendance/warnings');
  return data.data;
}

export async function fetchAgreementPdfDataUri(id: string) {
  const { data } = await api.get<ArrayBuffer>(`/agreements/${id}/pdf`, { responseType: 'arraybuffer' });
  let binary = '';
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return `data:application/pdf;base64,${base64Encode(binary)}`;
}

// ── HR Analytics — GET /analytics/* is gated server-side by
// requireHRModuleAccess: OWNER/STORE_MANAGER/HR/ACCOUNTING, or anyone granted
// the hr_module tab. Read-only.
export async function fetchHiringAnalytics() {
  const { data } = await api.get<ApiEnvelope<HiringAnalytics>>('/analytics/hiring');
  return data.data;
}

export async function fetchRetentionAnalytics() {
  const { data } = await api.get<ApiEnvelope<RetentionAnalytics>>('/analytics/retention');
  return data.data;
}

// ── Competency templates — /competency-templates is gated server-side by
// requireHRModuleAccess (OWNER/STORE_MANAGER/HR/ACCOUNTING, or the hr_module
// tab). NOTE `includeArchived=true` returns ONLY the archived roles, not
// active + archived. Archive/unarchive/delete act on the whole role (every
// version); delete is refused with 409 once any interview/assessment used it.
export async function fetchCompetencyTemplates(includeArchived = false) {
  const { data } = await api.get<ApiEnvelope<CompetencyTemplateListItem[]>>('/competency-templates', {
    params: includeArchived ? { includeArchived: true } : undefined,
  });
  return data.data;
}

export async function fetchCompetencyTemplate(id: string) {
  const { data } = await api.get<ApiEnvelope<CompetencyTemplate>>(`/competency-templates/${id}`);
  return data.data;
}

export async function approveCompetencyTemplate(id: string) {
  const { data } = await api.post<ApiEnvelope<CompetencyTemplate>>(`/competency-templates/${id}/approve`);
  return { template: data.data, message: data.message };
}

export async function archiveCompetencyTemplate(id: string) {
  const { data } = await api.post<ApiEnvelope<null>>(`/competency-templates/${id}/archive`);
  return { message: data.message };
}

export async function unarchiveCompetencyTemplate(id: string) {
  const { data } = await api.post<ApiEnvelope<CompetencyTemplate | null>>(`/competency-templates/${id}/unarchive`);
  return { template: data.data, message: data.message };
}

export async function deleteCompetencyTemplate(id: string) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/competency-templates/${id}`);
  return { message: data.message };
}

// Competency template authoring. POST / and POST /suggest answer 409 (with
// `existingTemplateId` + `archived` on err.response.data) when the role already
// has a template. Editing a DRAFT saves in place; editing an APPROVED template
// saves as a NEW APPROVED version (live immediately) — the returned template
// has a new id. Suggest/regenerate are LLM calls (120s ceiling, 502 if the AI
// fails); regenerating an APPROVED template creates a new DRAFT version while
// the approved one keeps serving.
export async function fetchDesignations() {
  const { data } = await api.get<ApiEnvelope<string[]>>('/competency-templates/designations');
  return data.data;
}

export async function createCompetencyTemplate(body: CreateCompetencyTemplateInput) {
  const { data } = await api.post<ApiEnvelope<CompetencyTemplate>>('/competency-templates', body);
  return { template: data.data, message: data.message };
}

export async function updateCompetencyTemplate(id: string, body: { competencies: CompetencyInput[]; category?: CompetencyCategory }) {
  const { data } = await api.patch<ApiEnvelope<CompetencyTemplate>>(`/competency-templates/${id}`, body);
  return { template: data.data, message: data.message };
}

export async function suggestCompetencyTemplate(body: SuggestCompetencyTemplateInput) {
  const { data } = await api.post<ApiEnvelope<CompetencyTemplate>>('/competency-templates/suggest', body, { timeout: 120000 });
  return { template: data.data, message: data.message };
}

export async function regenerateCompetencyTemplate(id: string, body: RegenerateCompetencyTemplateInput) {
  const { data } = await api.post<ApiEnvelope<CompetencyTemplate>>(`/competency-templates/${id}/regenerate`, body, { timeout: 120000 });
  return { template: data.data, message: data.message };
}

export async function fetchCompetencyTemplateVersions(id: string) {
  const { data } = await api.get<ApiEnvelope<CompetencyTemplate[]>>(`/competency-templates/${id}/versions`);
  return data.data;
}

// ── Password Manager — /passwords and /cards are gated server-side by
// requireRoles(OWNER, STORE_MANAGER, INVENTORY_MANAGER); rows are further
// scoped to what the caller added (OWNER sees all, STORE_MANAGER everything not
// added by an OWNER). Lists are masked; the reveal* endpoints return the one
// real secret as { value } and must only be called on an explicit Reveal tap.
export async function fetchPasswordEntries() {
  const { data } = await api.get<ApiEnvelope<PasswordEntry[]>>('/passwords');
  return data.data;
}

export async function createPasswordEntry(body: PasswordEntryInput) {
  const { data } = await api.post<ApiEnvelope<PasswordEntry>>('/passwords', body);
  return data.data;
}

export async function updatePasswordEntry(id: string, body: Partial<PasswordEntryInput>) {
  const { data } = await api.put<ApiEnvelope<PasswordEntry>>(`/passwords/${id}`, body);
  return data.data;
}

export async function deletePasswordEntry(id: string) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/passwords/${id}`);
  return data.data;
}

export async function revealPasswordEntry(id: string) {
  const { data } = await api.get<ApiEnvelope<{ value: string }>>(`/passwords/${id}/reveal`);
  return data.data.value;
}

export async function fetchCardEntries() {
  const { data } = await api.get<ApiEnvelope<CardEntry[]>>('/cards');
  return data.data;
}

export async function createCardEntry(body: CardEntryInput) {
  const { data } = await api.post<ApiEnvelope<CardEntry>>('/cards', body);
  return data.data;
}

export async function updateCardEntry(id: string, body: Partial<CardEntryInput>) {
  const { data } = await api.put<ApiEnvelope<CardEntry>>(`/cards/${id}`, body);
  return data.data;
}

export async function deleteCardEntry(id: string) {
  const { data } = await api.delete<ApiEnvelope<null>>(`/cards/${id}`);
  return data.data;
}

export async function revealCardNumber(id: string) {
  const { data } = await api.get<ApiEnvelope<{ value: string }>>(`/cards/${id}/reveal-number`);
  return data.data.value;
}

export async function revealCardCvv(id: string) {
  const { data } = await api.get<ApiEnvelope<{ value: string }>>(`/cards/${id}/reveal-cvv`);
  return data.data.value;
}

// ── Meta Ads — every route is gated server-side by requireAdsAccess (OWNER, or
// an explicit `ads` grant). Windows are `days` in IST (server cap 90). Refresh
// pulls spend from Meta, new leads from the desk and ownership — it has a 60s
// server-side cooldown (429) and can take a while.
export async function fetchAdsDaily(days: number) {
  const { data } = await api.get<ApiEnvelope<AdsDayRow[]>>('/ads/daily', { params: { days } });
  return data.data;
}

export async function fetchAdsRunning(days: number) {
  const { data } = await api.get<ApiEnvelope<AdsRunningResponse>>('/ads/running', { params: { days } });
  return data.data;
}

export async function fetchAdLeadList(days: number, limit: number, offset: number, filters: AdLeadFilters = {}) {
  const { data } = await api.get<ApiEnvelope<AdLeadListResponse>>('/ads/lead-list', {
    params: { days, limit, offset, ...filters },
  });
  return data.data;
}

export async function fetchAdsFollowThrough(days: number) {
  const { data } = await api.get<ApiEnvelope<AdsFollowThrough>>('/ads/follow-through', { params: { days } });
  return data.data;
}

export async function refreshAds() {
  const { data } = await api.post<ApiEnvelope<AdsRefreshResult>>('/ads/refresh', undefined, { timeout: 120000 });
  return data.data;
}

// ── Onboarding task templates — /onboarding-task-templates is gated
// server-side by requireHRModuleAccess (OWNER/STORE_MANAGER/HR/ACCOUNTING, or
// the hr_module tab). Create answers 400 if the role already has a template.
// PATCH replaces the template's tasks in place (roleName cannot change).
// Suggest is an LLM call (120s ceiling, 502 if the AI fails) and persists
// nothing — it only returns drafted tasks.
export async function fetchOnboardingTemplates() {
  const { data } = await api.get<ApiEnvelope<OnboardingTemplate[]>>('/onboarding-task-templates');
  return data.data;
}

export async function fetchOnboardingTemplate(id: string) {
  const { data } = await api.get<ApiEnvelope<OnboardingTemplate>>(`/onboarding-task-templates/${id}`);
  return data.data;
}

export async function createOnboardingTemplate(body: { roleName: string; tasks: OnboardingTaskInput[] }) {
  const { data } = await api.post<ApiEnvelope<OnboardingTemplate>>('/onboarding-task-templates', body);
  return { template: data.data, message: data.message };
}

export async function suggestOnboardingTemplate(body: { roleName: string; department?: string }) {
  const { data } = await api.post<ApiEnvelope<{ tasks: SuggestedOnboardingTask[] }>>(
    '/onboarding-task-templates/suggest',
    body,
    { timeout: 120000 },
  );
  return data.data.tasks;
}

export async function updateOnboardingTemplate(id: string, body: { tasks: OnboardingTaskInput[] }) {
  const { data } = await api.patch<ApiEnvelope<OnboardingTemplate>>(`/onboarding-task-templates/${id}`, body);
  return { template: data.data, message: data.message };
}

// ── Audit Trail — read-only, newest first, capped at 200 rows by the server.
// Both are gated by requireHROrOwner (OWNER/STORE_MANAGER/HR/ACCOUNTING).
// from/to are YYYY-MM-DD and are read as IST day boundaries.
export async function fetchDocumentAccessLog(params: DocumentAccessParams = {}) {
  const { data } = await api.get<ApiEnvelope<DocumentAccessEntry[]>>('/identity-documents/views', { params });
  return data.data;
}

export async function fetchActionLog(params: ActionLogParams = {}) {
  const { data } = await api.get<ApiEnvelope<ActionLogEntry[]>>('/action-log', { params });
  return data.data;
}

// ── Dashboard Overview extras (OWNER Overview screen) — verifyToken +
// report access (backend/src/routes/reports.ts).
export async function fetchDailyReport(date: string) {
  const { data } = await api.get<ApiEnvelope<DailyReport>>('/reports/daily', { params: { date } });
  return data.data;
}

export async function fetchCustomerStats(fromDate: string, toDate: string) {
  const { data } = await api.get<ApiEnvelope<CustomerStatsReport>>('/reports/customer-stats', { params: { fromDate, toDate } });
  return data.data;
}

// ── Customers & Jobs (dashboard customers/page.tsx parity) ───────────────────
// All gated server-side by hasCJAccess/getCJMode (view_only blocks writes,
// sales_mode scopes to own jobs); raw JSON, no ApiEnvelope.
export async function fetchActiveJobCards() {
  const { data } = await api.get<CjJobCard[]>('/job-cards/active');
  return Array.isArray(data) ? data : [];
}

export async function fetchBoardJobCards() {
  const { data } = await api.get<CjJobCard[]>('/job-cards/board');
  return Array.isArray(data) ? data : [];
}

// Status board stage change. boardWalkoutReason is required for WALKED_OUT.
export async function setJobBoardStage(id: string, stage: BoardStage, walkout?: { boardWalkoutReason: string; boardWalkoutRemarks?: string }) {
  const { data } = await api.patch<CjJobCard>(`/job-cards/${id}/board-stage`, { stage, ...walkout });
  return data;
}

// Same list New Entry uses for "handled by" — feeds the inline reassign picker.
export async function fetchHandledByEmployees() {
  const { data } = await api.get<HandledByEmployee[]>('/employees/handled-by');
  return Array.isArray(data) ? data : [];
}

export async function fetchCrmCustomerPage(params: { page: number; limit: number; search?: string; searchBy?: CrmSearchBy; fromDate?: string; toDate?: string; source?: string }) {
  const { search, searchBy, ...rest } = params;
  const { data } = await api.get<CrmCustomerPage>('/crm/customers', {
    params: { ...rest, ...(search?.trim() ? { search: search.trim(), searchBy } : {}), fromDate: rest.fromDate || undefined, toDate: rest.toDate || undefined, source: rest.source || undefined },
  });
  return data;
}

// GET /crm/customers/:id — job cards (with invoice summaries) + logged interactions.
export async function fetchCrmCustomerDetail(id: string): Promise<CrmCustomerDetail> {
  const { data } = await api.get<Partial<CrmCustomerDetail>>(`/crm/customers/${id}`);
  return { jobCards: data.jobCards ?? [], interactions: data.interactions ?? [] };
}

// Verification remarks (requireCustomerRemarksAccess), customer-level.
export async function fetchCustomerRemarksFor(customerId: string) {
  const { data } = await api.get<ApiEnvelope<CustomerRemark[]>>(`/customer-remarks/customer/${customerId}`);
  return data.data;
}

export async function addCustomerRemarkFor(customerId: string, note: string) {
  const { data } = await api.post<ApiEnvelope<CustomerRemark>>(`/customer-remarks/customer/${customerId}`, { note });
  return data.data;
}

// ── Team page (dashboard employees/page.tsx) ─────────────────────────────────
// The list endpoint answers a bare array or { data: [...] }; the dashboard
// accepts both, so this does too.
export async function fetchEmployeeCards() {
  const { data } = await api.get<EmployeeCardItem[] | { data?: EmployeeCardItem[] }>('/employees');
  return Array.isArray(data) ? data : (data?.data ?? []);
}

// PUT /employees/:id with exactly the fields the dashboard's edit modal sends
// (clearing a field means sending null, which updateEmployee's types forbid).
export async function saveEmployee(id: string, payload: Record<string, unknown>) {
  const { data } = await api.put<unknown>(`/employees/${id}`, payload);
  return data;
}

// PATCH /employees/:id/deactivate with the optional departure date + reason
// the dashboard captures at deactivation time.
export async function deactivateEmployeeWithDetails(id: string, fields: { departureDate?: string; departureReason?: string }) {
  const { data } = await api.patch<unknown>(`/employees/${id}/deactivate`, fields);
  return data;
}

// ── Employee detail panel, Overview tab ─────────────────────────────────────
// requireManagerOrOwner on both analytics routes.
export async function fetchEmployeeAnalytics(id: string) {
  const { data } = await api.get<ApiEnvelope<EmployeeAnalyticsRaw>>(`/employees/${id}/analytics`);
  return data.data;
}

export async function fetchEmployeePerformanceChart(id: string) {
  const { data } = await api.get<ApiEnvelope<EmployeePerformancePoint[]>>(`/employees/${id}/performance-chart`);
  return Array.isArray(data.data) ? data.data : [];
}

// Same route as fetchAttendancePunches, typed with the "interpretation" field it returns.
export async function fetchEmployeePunches(userId: string, date: string) {
  const { data } = await api.get<ApiEnvelope<EmployeePunch[]>>('/attendance/punches', { params: { userId, date } });
  return Array.isArray(data.data) ? data.data : [];
}

// ── Applications page (dashboard applications/page.tsx) ─────────────────────
// Same GET /applications as fetchApplications, typed with the extra row fields.
export async function fetchApplicationRows(status?: ApplicationStatus) {
  const { data } = await api.get<ApiEnvelope<ApplicationRowData[]>>('/applications', { params: status ? { status } : undefined });
  return data.data ?? [];
}

// POST /applications (multipart: the fields plus an optional résumé).
export async function createApplication(fields: ApplicationFormInput, resume?: { uri: string; name: string; mimeType: string } | null) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
  });
  if (resume) form.append('resume', { uri: resume.uri, name: resume.name, type: resume.mimeType } as any);
  const { data } = await api.post<ApiEnvelope<ApplicationRowData>>('/applications', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
  return data.data;
}

// PATCH /applications/:id
export async function updateApplication(id: string, fields: Partial<ApplicationFormInput>) {
  const { data } = await api.patch<ApiEnvelope<ApplicationRowData>>(`/applications/${id}`, fields);
  return data.data;
}

// PATCH /applications/:id/status, keeping the hasEmail flag the dashboard
// uses to offer the outcome email after Select / Reject.
export async function changeApplicationStatus(id: string, status: ApplicationStatus) {
  const { data } = await api.patch<ApiEnvelope<ApplicationRowData & { hasEmail?: boolean }>>(`/applications/${id}/status`, { status });
  return { application: data.data, message: data.message };
}

// POST /applications/:id/status-email — HR's "Send Email" / "Resend email".
export async function sendApplicationStatusEmail(id: string) {
  const { data } = await api.post<ApiEnvelope<ApplicationStatusEmailResult>>(`/applications/${id}/status-email`);
  return data.data;
}

// ── Applications Phase 2 ─────────────────────────────────────────────────────
export async function fetchPracticalQuestionsFull(id: string) {
  const { data } = await api.get<ApiEnvelope<PracticalQuestionsFull>>(`/applications/${id}/practical-questions`);
  return data.data;
}

// POST /:id/interview-schedule/:scheduleId/resend: re-sends the same invite, no changes.
export async function resendInterviewScheduleInvite(id: string, scheduleId: string) {
  const { data } = await api.post<ApiEnvelope<{ candidateEmailed: boolean; interviewerEmailed: boolean; candidateHasEmail: boolean; interviewerHasEmail: boolean }>>(
    `/applications/${id}/interview-schedule/${scheduleId}/resend`,
  );
  return data.data;
}

// GET /applications/compare?role= with the full scorecards (competency breakdowns).
export async function fetchCandidateComparisonFull(role: string) {
  const { data } = await api.get<ApiEnvelope<CompareCandidateFull[]>>('/applications/compare', { params: { role } });
  return data.data ?? [];
}

// POST /applications/job-description (AI draft; slow, like the other AI routes).
export async function generateJobDescription(fields: { roleName: string; department?: string; context?: string }) {
  const { data } = await api.post<ApiEnvelope<{ description: string }>>('/applications/job-description', fields, { timeout: 120000 });
  return data.data.description;
}

// POST /hr-assistant/chat: read-only lookups, nothing persisted server-side.
export async function hrAssistantChat(messages: HrChatMessage[]) {
  const { data } = await api.post<ApiEnvelope<{ reply: string }>>('/hr-assistant/chat', { messages }, { timeout: 120000 });
  return data.data.reply;
}

// Interview recordings are streamed behind the Bearer token (HR only). Same
// download-to-cache approach as downloadApplicationFile; a non-2xx is deleted
// rather than saved as a "file".
async function downloadRecording(path: string, filename: string): Promise<string> {
  const token = await tokenStorage.get();
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}${path}`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    throw new Error(result.status === 404 ? 'This recording is no longer available.' : `Could not download the recording (error ${result.status}).`);
  }
  return result.uri;
}

export function downloadInterviewRecording(applicationId: string, inviteId: string, kind: 'camera' | 'screen') {
  return downloadRecording(`/applications/${applicationId}/interview-invite/${inviteId}/recording/${kind}`, `interview-${kind}-${inviteId}.mp4`);
}

export function downloadAnswerRecording(applicationId: string, inviteId: string, turnIndex: number) {
  return downloadRecording(`/applications/${applicationId}/interview-invite/${inviteId}/answer-recording/${turnIndex}`, `answer-${inviteId}-${turnIndex}.audio`);
}

// ── Onboarding page: Overview counts, Letters, candidates (dashboard hrAPI) ──


export async function fetchOnboardingEmployees() {
  const { data } = await api.get<ApiEnvelope<OnboardingEmployee[]>>('/employees');
  return (data.data ?? []).filter((e) => e.isActive);
}

export async function fetchCandidateOverviewCounts() {
  const { data } = await api.get<ApiEnvelope<CandidateOverviewCounts>>('/hr/candidates/overview-counts');
  return data.data;
}

export async function fetchCandidateOverviewList(metric: CandidateOverviewMetric) {
  const { data } = await api.get<ApiEnvelope<CandidateOverviewListItem[]>>('/hr/candidates/overview-list', { params: { metric } });
  return data.data;
}

export async function fetchLettersCount() {
  const { data } = await api.get<ApiEnvelope<{ count: number }>>('/hr/letters/count');
  return data.data.count;
}

export async function fetchAllLetters() {
  const { data } = await api.get<ApiEnvelope<IssuedLetterSummary[]>>('/hr/letters');
  return data.data;
}

export async function fetchLetterHistory(userId: string) {
  const { data } = await api.get<ApiEnvelope<HRLetter[]>>(`/hr/letters/${userId}`);
  return data.data;
}

export async function generateLetter(userId: string, type: HRLetterType, fields: Record<string, unknown>) {
  const { data } = await api.post<ApiEnvelope<HRLetter>>(`/hr/letters/${userId}`, { type, ...fields });
  return data.data;
}

export async function emailLetter(letterId: string) {
  const { data } = await api.post<ApiEnvelope<{ sentTo: string }>>(`/hr/letters/file/${letterId}/email`);
  return data.data?.sentTo ?? null;
}

// GET /hr/letters/file/:id streams the PDF behind the Bearer token; saved to
// the cache the same way as downloadApplicationFile so it can be opened/shared.
export async function downloadLetterPdf(letterId: string, label: string): Promise<{ uri: string; filename: string }> {
  const token = await tokenStorage.get();
  const filename = `${label.replace(/[^\w.\-]+/g, '_')}-${letterId}.pdf`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}/hr/letters/file/${letterId}`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    throw new Error(result.status === 404 ? 'This letter is no longer available.' : `Could not download the letter (error ${result.status}).`);
  }
  return { uri: result.uri, filename };
}

export async function fetchCandidates() {
  const { data } = await api.get<ApiEnvelope<Candidate[]>>('/hr/candidates');
  return data.data ?? [];
}

export async function createCandidate(fields: { name: string; personalEmail?: string; personalPhone?: string; department?: string }) {
  const { data } = await api.post<ApiEnvelope<Candidate>>('/hr/candidates', fields);
  return data.data;
}

export async function sendOnboardingInvite(userId: string): Promise<OnboardingInviteResult> {
  const { data } = await api.post<ApiEnvelope<OnboardingInviteResult>>(`/hr/onboarding-invites/${userId}`);
  const d = data.data;
  return { inviteLink: d.inviteLink, expiresAt: d.expiresAt, emailSent: !!d.emailSent, sentTo: d.sentTo ?? null, hasEmail: !!d.hasEmail };
}

export async function fetchOnboardingInviteStatus(userId: string) {
  const { data } = await api.get<ApiEnvelope<OnboardingInviteStatusInfo | null>>(`/hr/onboarding-invites/${userId}`);
  return data.data ?? null;
}

export async function approveCandidateOnboarding(userId: string) {
  const { data } = await api.post<ApiEnvelope<{ user: { username: string }; temporaryPassword: string }>>(`/hr/onboarding-invites/${userId}/approve`);
  return { username: data.data.user.username, temporaryPassword: data.data.temporaryPassword };
}

export async function fetchPreJoiningTermsLite(userId: string) {
  const { data } = await api.get<ApiEnvelope<PreJoiningTermsLite | null>>(`/pre-joining-terms/${userId}`);
  return data.data ?? null;
}

export async function fetchCheckInOverviewCounts() {
  const { data } = await api.get<ApiEnvelope<{ overdue: number; upcoming: number }>>('/probation-checkins/overview-counts');
  return data.data;
}

export async function fetchProbationCheckIns() {
  const { data } = await api.get<ApiEnvelope<ProbationCheckIn[]>>('/probation-checkins');
  return data.data ?? [];
}

// ── Onboarding Phase 2 (dashboard hrAPI / identityDocumentsAPI / preJoiningTermsAPI) ──
export async function fetchEmploymentDetails(userId: string) {
  const { data } = await api.get<ApiEnvelope<EmploymentDetails>>(`/hr/employment/${userId}`);
  return data.data;
}

export async function updateEmploymentDetails(userId: string, fields: EmploymentUpdate) {
  const { data } = await api.patch<ApiEnvelope<EmploymentDetails>>(`/hr/employment/${userId}`, fields);
  return data.data;
}

export async function fetchPreJoiningTerms(userId: string) {
  const { data } = await api.get<ApiEnvelope<PreJoiningTerms | null>>(`/pre-joining-terms/${userId}`);
  return data.data ?? null;
}

export async function savePreJoiningTerms(userId: string, fields: PreJoiningTermsInput) {
  const { data } = await api.put<ApiEnvelope<PreJoiningTerms>>(`/pre-joining-terms/${userId}`, fields);
  return data.data;
}

export async function approvePreJoiningTerms(userId: string) {
  const { data } = await api.post<ApiEnvelope<PreJoiningTerms>>(`/pre-joining-terms/${userId}/approve`);
  return data.data;
}

export async function fetchOnboardingDocuments(userId: string) {
  const { data } = await api.get<ApiEnvelope<OnboardingDocument[]>>(`/identity-documents/${userId}`);
  return data.data ?? [];
}

export async function fetchAllOnboardingDocuments(status?: IdentityDocumentStatus) {
  const { data } = await api.get<ApiEnvelope<OnboardingDocument[]>>('/identity-documents', { params: status ? { status } : undefined });
  return data.data ?? [];
}

export async function setOnboardingDocumentStatus(documentId: string, status: IdentityDocumentStatus, rejectionReason?: string) {
  const { data } = await api.patch<ApiEnvelope<OnboardingDocument>>(`/identity-documents/file/${documentId}/status`, { status, rejectionReason });
  return data.data;
}

// HR upload with the dashboard's full field set: type, label, number (encrypted
// server-side), bank IFSC / branch. The file is optional for types where a
// number alone is enough.
export async function uploadOnboardingDocument(
  userId: string,
  file: { uri: string; name: string; mimeType: string } | null,
  type: IdentityDocType,
  extra: { label?: string; value?: string; ifsc?: string; branch?: string },
  ctrl: { onProgress: (pct: number | null) => void; signal: AbortSignal },
) {
  const form = new FormData();
  form.append('type', type);
  if (file) form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as any);
  if (extra.label) form.append('label', extra.label);
  if (extra.value) form.append('value', extra.value);
  if (extra.ifsc) form.append('ifsc', extra.ifsc);
  if (extra.branch) form.append('branch', extra.branch);
  const { data } = await api.post<ApiEnvelope<OnboardingDocument>>(`/identity-documents/${userId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    signal: ctrl.signal,
    onUploadProgress: (evt) => ctrl.onProgress(progressToPercent(evt)),
  });
  return data.data;
}

// The file route needs the Bearer header, so it is saved to the cache first
// (same approach as downloadLetterPdf) and then opened / shared.
export async function downloadIdentityDocumentFile(documentId: string, serverFilename?: string | null): Promise<{ uri: string; filename: string }> {
  const token = await tokenStorage.get();
  const safe = (serverFilename ?? 'document').replace(/[^\w.\-]+/g, '_');
  const filename = `identity-${documentId}-${safe}`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}/identity-documents/file/${documentId}`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    throw new Error(result.status === 404 ? 'This document is no longer available.' : `Could not download the file (error ${result.status}).`);
  }
  return { uri: result.uri, filename: serverFilename || filename };
}

export async function fetchVerificationQueue() {
  const { data } = await api.get<ApiEnvelope<CandidateVerificationQueueItem[]>>('/hr/candidates/verification-queue');
  return data.data ?? [];
}

export async function fetchDisciplineRecords(userId: string) {
  const { data } = await api.get<ApiEnvelope<DisciplineRecord[]>>(`/hr/discipline/${userId}`);
  return data.data ?? [];
}

export async function addDisciplineRecord(userId: string, fields: { type: DisciplineRecordType; description: string; date: string }) {
  const { data } = await api.post<ApiEnvelope<DisciplineRecord>>(`/hr/discipline/${userId}`, fields);
  return data.data;
}

export async function fetchProbationCheckInDetails() {
  const { data } = await api.get<ApiEnvelope<ProbationCheckInDetail[]>>('/probation-checkins');
  return data.data ?? [];
}

export async function completeProbationCheckIn(userId: string, milestone: ProbationMilestone, fields: { rating?: number; notes?: string }) {
  const { data } = await api.post<ApiEnvelope<ProbationCheckInDetail>>(`/probation-checkins/${userId}/${milestone}/complete`, fields);
  return data.data;
}

export async function downloadOnboardingPdf(userId: string, name: string): Promise<{ uri: string; filename: string }> {
  const token = await tokenStorage.get();
  const filename = `onboarding-${name.replace(/[^\w.\-]+/g, '_')}-${userId}.pdf`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}/hr/onboarding/${userId}/pdf`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    throw new Error(`Could not download the checklist PDF (error ${result.status}).`);
  }
  return { uri: result.uri, filename };
}

// ── Tasks page: Daily Tasks with proof ──
export async function fetchMyDailyTasks() {
  const { data } = await api.get<ApiEnvelope<DailyTaskCompletion[]>>('/recurring-tasks/my-current');
  return data.data;
}

// `proof` is needed when the task's proof is PHOTO (photo) or NOTE_PHOTO
// (note + photo); the photo is a data: URL.
export async function completeDailyTask(completionId: string, proof?: { note?: string; photo?: string; photoMime?: string }) {
  const { data } = await api.patch<ApiEnvelope<DailyTaskCompletion>>(`/recurring-tasks/completions/${completionId}/complete`, proof ?? {});
  return data.data;
}

// My Payslips download: same endpoint as downloadPayslipPdf, saved as
// payslip-<safeName>-<month>-<year>.pdf (the dashboard's filename). downloadAsync
// resolves even on a 4xx/5xx, so the status is checked and the server's own
// message (a JSON body) is surfaced instead of saving it as the "PDF".
export async function downloadMyPayslip(id: string, month: number, year: number, name: string): Promise<{ uri: string; filename: string }> {
  const token = await tokenStorage.get();
  const safeName = (name || 'payslip').replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `payslip-${safeName}-${month}-${year}.pdf`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}/payslips/${id}/pdf`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status < 200 || result.status >= 300) {
    let message: string | undefined;
    try {
      const body = JSON.parse(await FileSystem.readAsStringAsync(result.uri));
      message = body?.error ?? body?.message;
    } catch {
      // not JSON: fall back to the generic message
    }
    await FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
    throw new Error(message ?? 'Failed to download this payslip.');
  }
  return { uri: result.uri, filename };
}

// ── Purchase page: full ledger detail + edit purchase voucher ──
export async function fetchPurchaseLedgerDetail(id: string) {
  const { data } = await api.get<ApiEnvelope<PurchaseLedgerDetail>>(`/accounting/ledgers/${id}`);
  return data.data;
}

// Changing anything besides the narration reverses the voucher and posts a
// corrected one; a narration-only change updates in place.
export async function editPurchaseVoucher(id: string, input: EditPurchaseVoucherInput) {
  const { data } = await api.post<ApiEnvelope<unknown>>(`/accounting/purchase-vouchers/${id}/edit`, input);
  return data.data;
}

// ── Purchase Phase 2: edit payment voucher / edit debit note ──
export async function editPaymentVoucher(id: string, input: EditPaymentVoucherInput) {
  const { data } = await api.post<ApiEnvelope<unknown>>(`/accounting/payment-vouchers/${id}/edit`, input);
  return data.data;
}

export async function editDebitNote(id: string, input: EditDebitNoteInput) {
  const { data } = await api.post<ApiEnvelope<unknown>>(`/accounting/debit-notes/${id}/edit`, input);
  return data.data;
}

// Finance Approvals: the dashboard's approve sheet sends its optional note as
// `notes` (approveLoan above sends none).
export async function approveLoanWithNotes(id: string, notes: string) {
  const { data } = await api.patch<ApiEnvelope<Loan>>(`/loans/${id}/approve`, { notes });
  return data.data;
}

// GET /payroll/salary-payments-all returns the raw rows with the note as an
// unparsed string; it's parsed here with the dashboard's try/catch fallback.
export async function fetchSalaryPaymentsWithBreakdown(month: number, year: number) {
  const { data } = await api.get<ApiEnvelope<(Omit<SalaryPaymentWithBreakdown, 'grossSalary' | 'attendanceDeduction' | 'advanceDeduction' | 'advanceSkipped' | 'loanDeduction' | 'netPayable'> & { note: string | null })[]>>(
    '/payroll/salary-payments-all',
    { params: { month, year } },
  );
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows.map((p): SalaryPaymentWithBreakdown => {
    let note: Record<string, unknown> = {};
    try { note = JSON.parse(p.note || '{}') as Record<string, unknown>; } catch { /* plain-text note */ }
    return {
      id: p.id, userId: p.userId, amount: p.amount, mode: p.mode, paidAt: p.paidAt, paidBy: p.paidBy,
      grossSalary: (note.grossSalary as number | undefined) ?? null,
      attendanceDeduction: (note.attendanceDeduction as number | undefined) ?? 0,
      advanceDeduction: (note.advanceDeduction as number | undefined) ?? null,
      advanceSkipped: (note.advanceSkipped as boolean | undefined) ?? false,
      loanDeduction: (note.loanDeduction as number | undefined) ?? null,
      netPayable: (note.netPayable as number | undefined) ?? null,
    };
  });
}

// Payslips page: the issued payslip's PDF (what the dashboard's print page
// shows), named like the dashboard's download, saved to the cache. Unlike
// downloadPayslipPdf above, a non-200 response is an error and nothing is
// written, so a JSON error body is never mistaken for the PDF.
export async function downloadIssuedPayslipPdf(id: string, employeeName: string, month: number, year: number): Promise<{ uri: string; filename: string }> {
  const token = await tokenStorage.get();
  const safeName = employeeName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `payslip-${safeName}-${month}-${year}.pdf`;
  const dest = `${FileSystem.cacheDirectory}${filename}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}/payslips/${id}/pdf`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status !== 200) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    throw new Error('Failed to download this payslip.');
  }
  return { uri: result.uri, filename };
}

// Financial page: the Revenue Trend line (GET /financial/revenue-trend, same
// requireManagerOrOwner gate as the other /financial routes).
export async function fetchFinancialRevenueTrend(period?: string) {
  const { data } = await api.get<ApiEnvelope<{ date: string; revenue: number }[]>>('/financial/revenue-trend', { params: { period } });
  return Array.isArray(data.data) ? data.data : [];
}

// Legal Documents page: Save Changes sends every field, with null (not
// undefined) for a blank hearing date / notes, so clearing a field really clears it.
export async function saveLegalCase(id: string, input: { title: string; status: string; nextHearingDate: string | null; notes: string | null }) {
  const { data } = await api.put<ApiEnvelope<LegalCase>>(`/legal/cases/${id}`, input);
  return data.data;
}

// Streams a stored case document (behind requireLegalAccess) into the cache so
// it can be opened. A non-200 response is an error and nothing is kept.
export async function downloadLegalDocument(documentId: string, filename: string): Promise<{ uri: string }> {
  const token = await tokenStorage.get();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = `${FileSystem.cacheDirectory}legal-${documentId}-${safe}`;
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}/legal/documents/${documentId}/file`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status !== 200) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    throw new Error('Failed to open document');
  }
  return { uri: result.uri };
}

// Job Tracker: the staff filter's list (GET /employees/assignable, any signed-in user).
export async function fetchAssignableEmployees() {
  const { data } = await api.get<ApiEnvelope<{ id: string; name: string }[]>>('/employees/assignable');
  return Array.isArray(data.data) ? data.data : [];
}

// ── Conversations page: filtered list, stats, status / flag / assign, call ──
export async function fetchConversationList(params: ConversationListParams) {
  const { data } = await api.get<ApiEnvelope<Conversation[]>>('/conversations', { params });
  return Array.isArray(data.data) ? data.data : [];
}

// Manager roles only (the server 403s others; the page treats that as no stats).
export async function fetchConversationStats(params: { category?: string; staffPhoneNumberId?: string }) {
  const { data } = await api.get<ApiEnvelope<ConversationStats>>('/conversations/stats', { params });
  return data.data;
}

export async function updateConversationStatus(id: string, status: string) {
  const { data } = await api.put<ApiEnvelope<Conversation>>(`/conversations/${id}/status`, { status });
  return data.data;
}

export async function flagConversationHighValue(id: string, isHighValue: boolean) {
  const { data } = await api.put<ApiEnvelope<Conversation>>(`/conversations/${id}/flag`, { isHighValue });
  return data.data;
}

export async function assignConversation(id: string, assignedToId: string) {
  const { data } = await api.put<ApiEnvelope<Conversation>>(`/conversations/${id}/assign`, { assignedToId });
  return data.data;
}

// OWNER only: the business numbers shown as filter tabs under Customer.
export async function fetchStaffPhoneNumbers() {
  const { data } = await api.get<ApiEnvelope<StaffPhoneNumberRow[]>>('/staff-phone-numbers');
  return Array.isArray(data.data) ? data.data : [];
}

// Click-to-call: only the conversation id is sent; the server looks the number up.
export async function initiateConversationCall(conversationId: string) {
  const { data } = await api.post<ApiEnvelope<unknown>>('/calls/initiate', {
    conversationId,
    idempotencyKey: `${conversationId}-${Date.now()}`,
  });
  return data;
}

// ── Conversations Phase 2 ──
// OWNER / STORE_MANAGER get full recordings; the server 403s anyone else.
export async function fetchConversationCallRecordings(conversationId: string) {
  const { data } = await api.get<ApiEnvelope<ConversationCallRecording[]>>('/call-recordings', { params: { conversationId } });
  return Array.isArray(data.data) ? data.data : [];
}

// A salesperson's own calls: summary text only, no audio.
export async function fetchConversationCallSummaries() {
  const { data } = await api.get<ApiEnvelope<ConversationCallSummary[]>>('/call-recordings/my-summary');
  return Array.isArray(data.data) ? data.data : [];
}

export async function retranscribeCallRecording(id: string) {
  const { data } = await api.post<ApiEnvelope<{ queued: boolean }>>(`/call-recordings/${id}/retranscribe`);
  return data;
}

export async function createConversation(input: CreateConversationInput) {
  const { data } = await api.post<ApiEnvelope<Conversation>>('/conversations', input);
  return data.data;
}

// OWNER only (Manage Numbers).
export async function fetchWabaNumbers() {
  const { data } = await api.get<ApiEnvelope<WabaNumber[]>>('/staff-phone-numbers/waba-numbers');
  return Array.isArray(data.data) ? data.data : [];
}

export async function saveStaffPhoneNumber(input: { phoneNumberId: string; displayPhone: string; employeeId: string | null }) {
  const { data } = await api.post<ApiEnvelope<StaffPhoneNumberRow>>('/staff-phone-numbers', input);
  return data.data;
}

// ── Quotations, dashboard parity ──
// The list the dashboard page reads: server paging (page/limit/search/status) with the total count.
export async function fetchQuotationsPage(params: { page: number; limit: number; search?: string; status?: string }) {
  const { data } = await api.get<ApiEnvelope<PaginatedResponse<QuotationListItem> | QuotationListItem[]>>('/quotations', {
    params: { page: params.page, limit: params.limit, search: params.search || undefined, status: params.status || undefined },
  });
  const body = data.data;
  if (Array.isArray(body)) return { items: body, total: body.length };
  return { items: body?.data ?? [], total: body?.total ?? 0 };
}

// GET /quotations/:id with the supplier block, per-line GST and salesperson (what the dashboard edit modal and print page read).
export async function fetchQuotationFull(id: string) {
  const { data } = await api.get<ApiEnvelope<QuotationFull>>(`/quotations/${id}`);
  return data.data;
}

// POST /quotations / PUT /quotations/:id with the dashboard's own payload shape (the wizard adds manualAmounts, the edit modal gstRate).
export async function createQuotationRaw(body: Record<string, unknown>) {
  const { data } = await api.post<ApiEnvelope<{ id: string; quotationNumber: string }>>('/quotations', body);
  return data.data;
}

export async function updateQuotationRaw(id: string, body: Record<string, unknown>) {
  const { data } = await api.put<ApiEnvelope<unknown>>(`/quotations/${id}`, body);
  return data.data;
}

// Salesperson picker source (the dashboard reuses the invoices endpoint).
export async function fetchQuotationStaff() {
  const { data } = await api.get<ApiEnvelope<QuotationStaffOption[]>>('/invoices/staff-directory');
  return Array.isArray(data.data) ? data.data : [];
}

// Line-item picker search — local inventory, 2+ characters.
export async function searchQuotationItems(q: string) {
  const { data } = await api.get<ApiEnvelope<QuotationItemSearchResult[]>>('/inventory-items/search', { params: { q } });
  return Array.isArray(data.data) ? data.data : [];
}

export async function verifyQuotationGstin(gstin: string) {
  const { data } = await api.get<ApiEnvelope<QuotationGstData>>(`/gst/verify/${encodeURIComponent(gstin)}`);
  return data.data;
}

export async function lookupQuotationVehicle(regNo: string) {
  const { data } = await api.get<ApiEnvelope<QuotationVehicleData>>(`/vehicle/${encodeURIComponent(regNo)}`);
  return data.data;
}

// ── Devices, dashboard parity ──
// GET /devices with the dashboard's own filters (deviceType, status = online | offline | locked).
export async function fetchDevicesFull(params?: { deviceType?: string; status?: string }) {
  const { data } = await api.get<ApiEnvelope<{ devices: DeviceFull[] }>>('/devices', { params: params && Object.keys(params).length ? params : undefined });
  return data.data?.devices ?? [];
}

export async function unenrollDevice(id: string) {
  const { data } = await api.delete<ApiEnvelope<unknown>>(`/devices/${id}`);
  return data.data;
}

export async function fetchDeviceAlertsFull() {
  const { data } = await api.get<ApiEnvelope<DeviceAlertFull[]>>('/devices/alerts');
  return Array.isArray(data.data) ? data.data : [];
}

// ── Sales Invoices, dashboard parity ──
export async function fetchInvoiceStats() {
  const { data } = await api.get<InvoiceStats>('/invoices/stats');
  return data;
}

// The dashboard list: server paging + status / date filters + sortable columns. Returns rows and the total count.
export async function fetchInvoicesPage(params: { page: number; limit: number; sortBy: string; sortDir: 'asc' | 'desc'; search?: string; status?: string; from?: string; to?: string }) {
  const { data } = await api.get<unknown>('/invoices', {
    params: { page: params.page, limit: params.limit, sortBy: params.sortBy, sortDir: params.sortDir, search: params.search || undefined, status: params.status || undefined, from: params.from || undefined, to: params.to || undefined },
  });
  const root = data as { data?: unknown; invoices?: unknown; total?: number; count?: number } | unknown[];
  const raw = (Array.isArray(root) ? root : ((root as { data?: unknown }).data ?? root)) as { invoices?: InvoiceRow[]; data?: InvoiceRow[]; total?: number; count?: number } | InvoiceRow[];
  if (Array.isArray(raw)) return { items: raw, total: raw.length };
  return { items: raw.invoices ?? raw.data ?? [], total: raw.total ?? raw.count ?? 0 };
}

export async function fetchInvoiceFull(id: string) {
  const { data } = await api.get<ApiEnvelope<InvoiceFull>>(`/invoices/${id}`);
  return data.data;
}

export async function fetchInvoicePaymentHistory(id: string) {
  const { data } = await api.get<ApiEnvelope<InvoicePaymentHistoryRow[]>>(`/payments/history/${id}`);
  return Array.isArray(data.data) ? data.data : [];
}

export async function fetchInvoiceReport(params: Record<string, string>) {
  const { data } = await api.get<{ summary?: { invoiceCount?: number; totalRevenue?: number; totalCollected?: number; totalOutstanding?: number }; totalInvoices?: number; totalBilled?: number; totalCollected?: number; totalOutstanding?: number; invoices?: InvoiceRow[] }>('/invoices/reports', { params });
  const d = data;
  return {
    totalInvoices: d?.summary?.invoiceCount ?? d?.totalInvoices ?? 0,
    totalBilled: d?.summary?.totalRevenue ?? d?.totalBilled ?? 0,
    totalCollected: d?.summary?.totalCollected ?? d?.totalCollected ?? 0,
    totalOutstanding: d?.summary?.totalOutstanding ?? d?.totalOutstanding ?? 0,
    invoices: d?.invoices ?? [],
  } as InvoiceReport;
}

export async function fetchOpenInvoices() {
  const { data } = await api.get<ApiEnvelope<OpenInvoiceRow[]>>('/invoices/open');
  return Array.isArray(data.data) ? data.data : [];
}

export async function cancelInvoice(id: string) {
  const { data } = await api.patch<ApiEnvelope<unknown>>(`/invoices/${id}/cancel`);
  return data.data;
}

export async function deleteInvoice(id: string) {
  const { data } = await api.delete<ApiEnvelope<unknown>>(`/invoices/${id}`);
  return data.data;
}

export async function updateInvoiceRaw(id: string, body: Record<string, unknown>) {
  const { data } = await api.put<ApiEnvelope<unknown>>(`/invoices/${id}`, body);
  return data.data;
}

export async function createInvoiceRaw(body: Record<string, unknown>) {
  const { data } = await api.post<ApiEnvelope<{ id: string; invoiceNumber: string }>>('/invoices', body);
  return data.data;
}

// POST /invoices/:id/pay — the wizard's payment call (CASH | UPI | CARD). Returns the updated invoice figures.
export async function payInvoice(id: string, body: { paymentMethod: string; amount: number; salespersonId?: string }) {
  const { data } = await api.post<ApiEnvelope<{ invoiceNumber?: string; grandTotal?: number; balanceDue?: number; status?: string }>>(`/invoices/${id}/pay`, body);
  return data.data;
}

export async function notifyInvoice(id: string, channels: string[], pdfUrl: string) {
  const { data } = await api.post<ApiEnvelope<unknown>>(`/invoices/${id}/notify`, { channels, pdfUrl });
  return data.data;
}

// ── SIM Tracker, dashboard parity ──
// The dashboard sends explicit nulls for blank fields so an edit really clears them (PUT only touches fields that
// are present in the body); the typed createSim/updateSim above drop blanks to undefined, which would not.
export async function saveSimRaw(id: number | null, body: Record<string, unknown>) {
  const { data } = id == null
    ? await api.post<ApiEnvelope<SimCard>>('/sims', body)
    : await api.put<ApiEnvelope<SimCard>>(`/sims/${id}`, body);
  return data.data;
}
