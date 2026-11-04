export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: string;
  employeeId?: string | null;
  designation?: string | null;
  monthlySalary?: number | null;
  salaryType?: string | null;
  joiningDate?: string | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  mustChangePassword?: boolean;
}

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'LEAVE' | 'WEEKEND';

export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  isLate: boolean;
  status: AttendanceStatus;
  user: { id: string; name: string; username: string; role: string };
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export type ConversationCategory = 'CUSTOMER_WHATSAPP' | 'INSTAGRAM' | 'EMPLOYEE' | 'OWNER' | 'CALL';
export type ConversationStatus = 'ACTIVE' | 'WAITING' | 'CLOSED';

export interface ConversationMessage {
  id: string;
  senderType: 'CUSTOMER' | 'EMPLOYEE' | 'SYSTEM';
  senderName: string | null;
  content: string;
  createdAt: string;
  deliveryStatus?: string | null;
}

export interface Conversation {
  id: string;
  customerName: string;
  customerPhone: string;
  category: ConversationCategory;
  status: ConversationStatus;
  isHighValue: boolean;
  lastMessageAt: string | null;
  assignedTo: { id: string; name: string; username: string } | null;
  messages: ConversationMessage[];
}

export type TaskStatus = 'PENDING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignedToId: string;
  assignedTo: { id: string; name: string; role: string };
  assignedById: string;
  assignedBy: { id: string; name: string };
  status: TaskStatus;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  date: string;
  createdAt: string;
  updatedAt: string;
  /** Set when this task was auto-created from a manager's reply to a work-
   *  documentation note — null for ordinary assigned tasks. The reply thread
   *  itself lives on the WorkDocumentation, fetched via fetchWorkDoc(). */
  sourceWorkDocId?: string | null;
  /** Set when this task was auto-created via Assign Task on one specific
   *  timesheet entry. Mutually exclusive with sourceWorkDocId in practice. */
  sourceTimesheetId?: string | null;
  sourceEntryId?: string | null;
  /** This task's own conversation thread — only present when fetched via
   *  fetchTask(id). */
  entryReplies?: TimesheetEntryReply[];
}

export type RecurrenceType = 'DAILY' | 'TWICE_DAILY' | 'WEEKLY';
export type RecurringTaskScope = 'ROLE' | 'INDIVIDUAL';
export type RecurringTaskCompletionStatus = 'PENDING' | 'COMPLETED' | 'MISSED';

export interface RecurringTaskDefinition {
  id: string;
  title: string;
  description: string | null;
  recurrence: RecurrenceType;
  scope: RecurringTaskScope;
  role: string | null;
  assignedToId: string | null;
  assignedTo: { id: string; name: string; role: string } | null;
  createdBy: { id: string; name: string };
  isActive: boolean;
  createdAt: string;
}

export interface RecurringTaskCompletion {
  id: string;
  definitionId: string;
  userId: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  status: RecurringTaskCompletionStatus;
  completedAt: string | null;
  definition: { id: string; title: string; description: string | null; recurrence: RecurrenceType };
}

export interface CustomerVehicleSummary {
  id: string;
  vehicleNumber: string;
  make: string | null;
  model: string | null;
}

export interface CustomerInvoiceSummary {
  id: string;
  invoiceNumber: string;
  grandTotal: number;
  paidAmount: number;
  status: string;
  createdAt: string;
}

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  isRegular: boolean;
  visitCount: number;
  totalSpent: number;
  invoiceCount: number;
  vehicles: CustomerVehicleSummary[];
  crmInvoices: CustomerInvoiceSummary[];
  source: string | null;
}

export interface CustomerListResponse {
  customers: CustomerListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface CustomerProfileInvoice {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  grandTotal: number;
  balanceDue: number;
  status: string;
  vehicleNumber: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
}

export interface CustomerProfile {
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    createdAt: string;
    isRegular: boolean;
    visitCount: number;
  };
  stats: {
    totalSpent: number;
    avgPerVisit: number;
    visitCount: number;
    outstandingAmount: number;
    customerSince: string | null;
  };
  vehicles: { registration: string; make: string | null; model: string | null; year: number | null }[];
  invoices: CustomerProfileInvoice[];
}

export type JobCardStatus = 'IN_PROGRESS' | 'READY' | 'RELEASED' | 'WALKED_OUT';

export interface JobCard {
  id: string;
  jobNumber: string;
  reasonForVisit: string;
  status: JobCardStatus;
  estimatedTotal: number | null;
  createdAt: string;
  vehicle: { id: string; vehicleNumber: string; make: string | null; model: string | null } | null;
  handledBy: { id: string; name: string };
}

// ── Job card detail — GET /job-cards/:id (backend/src/routes/job_cards.ts,
// verified 2026-09-24). PATCH /:id diffs against this shape field-by-field
// and writes a JobCardEdit row per changed field (never a blind overwrite).
export interface JobCardDetail {
  id: string;
  jobNumber: string;
  reasonForVisit: string;
  status: JobCardStatus;
  estimatedTotal: number | null;
  ownerName: string | null;
  ownerPhone: string | null;
  customerRole: 'OWNER' | 'DRIVER' | null;
  vehicleNumber: string | null;
  createdAt: string;
  customerId: string;
  customer: { id: string; name: string; phone: string; email: string | null };
  vehicleId: string | null;
  vehicle: { id: string; vehicleNumber: string; make: string | null; model: string | null; year: string | null; fuel: string | null; colour: string | null } | null;
  handledBy: { id: string; name: string; role: string; designation: string | null };
  invoice: { id: string; invoiceNumber: string; grandTotal: number; paidAmount: number; balanceDue: number; status: string; createdAt: string } | null;
  advanceReceiptsTotal: number;
  listFirstPrintedAt: string | null;
  listLastPrintedAt: string | null;
  listPrintCount: number;
}

export interface UpdateJobCardInput {
  reasonForVisit?: string;
  ownerName?: string;
  ownerPhone?: string;
  customerRole?: 'OWNER' | 'DRIVER';
  estimatedTotal?: number | null;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  vehicleNumber?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleFuel?: string;
  vehicleColour?: string;
}

export interface JobCardEdit {
  id: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  editedBy: { id: string; name: string };
  editedAt: string;
}

export interface JobCardListItem {
  id: string;
  text: string;
  price: number | null;
  isOriginal: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface JobCardInspectionMedia {
  id: string;
  url: string;
  type: 'image' | 'video';
  filename: string;
  fileSize: number;
  uploadedByName: string;
  createdAt: string;
}

// Verification remarks — a separate, more restricted feature from staff
// Remarks (backend/src/routes/customer_remarks_route.ts). Append-only, no
// edit/delete routes exist at all.
export interface CustomerRemark {
  id: string;
  jobCardId: string | null;
  customerId: string | null;
  note: string;
  author: { id: string; name: string };
  createdAt: string;
}

export type ReminderOccurrenceStatus = 'PENDING' | 'SNOOZED' | 'ACKNOWLEDGED' | 'DONE';

export interface ReminderOccurrence {
  id: string;
  dueDate: string;
  status: ReminderOccurrenceStatus;
  snoozedUntil: string | null;
  acknowledgedAt: string | null;
  doneAt: string | null;
  definition: {
    id: string;
    title: string;
    description: string | null;
    recurrenceType?: string;
    leadDays: number;
  };
}

// Reminder definitions — requireOwner (backend/src/routes/reminders.ts),
// OWNER-only management of WHO gets reminded about WHAT and how often.
// Distinct from the occurrence ack/snooze/done actions above, which any
// authenticated user has for their own reminders. Added 2026-09-24
// (full-parity pass) — this management view didn't exist on mobile at all.
export type ReminderRecurrenceType = 'ONE_OFF' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface ReminderDefinition {
  id: string;
  title: string;
  description: string | null;
  recurrenceType: ReminderRecurrenceType;
  anchorDate: string;
  leadDays: number;
  isActive: boolean;
  targets: { userId: string; user: { id: string; name: string } }[];
}

export interface CreateReminderDefinitionInput {
  title: string;
  recurrenceType: ReminderRecurrenceType;
  anchorDate: string;
  targetUserIds: string[];
  description?: string;
  leadDays?: number;
}

export interface NewJobEntryInput {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerGSTIN?: string;
  customerSource?: string;
  vehicleNumber: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleFuel?: string;
  vehicleColour?: string;
  reasonForVisit: string;
  handledById?: string;
  noVehicle?: boolean;
  customerRole?: 'OWNER' | 'DRIVER';
  ownerName?: string;
  ownerPhone?: string;
  visitDate?: string;
  estimatedTotal?: number;
}

export interface NewJobEntryResult {
  jobCard: { id: string; jobNumber: string; customerId: string };
  invoice: { id: string; invoiceNumber: string };
}

export interface JobLookupCustomer {
  id: string;
  name: string;
  phone: string;
  vehicles: CustomerVehicleSummary[];
}

export interface TeamChatMember {
  id: string;
  userId: string;
  lastReadAt: string | null;
  user: { id: string; name: string; phone: string | null; designation: string | null };
}

// Server soft-deletes (deleted:true, content/mediaUrl/mediaType scrubbed to
// null on every read path — never rely on client-side hiding, the server
// has already blanked it). edited/editedAt set on a successful PATCH.
// replyTo is a server-built quote, populated automatically whenever
// replyToId is set — no separate fetch needed. pinnedAt is shared (message
// pins are chat-wide, max 3, unlike a chat's own per-user pinnedAt below).
export interface TeamChatMessageQuote {
  id: string;
  senderId: string;
  content: string | null;
  mediaType: string | null;
  deleted: boolean;
  sender: { id: string; name: string };
}

export interface TeamChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  sentAt: string;
  sender: { id: string; name: string };
  deleted?: boolean;
  edited?: boolean;
  editedAt?: string | null;
  replyToId?: string | null;
  replyTo?: TeamChatMessageQuote | null;
  pinnedAt?: string | null;
  forwarded?: boolean;
}

export interface TeamChat {
  id: string;
  isGroup: boolean;
  name: string | null;
  lastMsgAt: string | null;
  members: TeamChatMember[];
  messages: TeamChatMessage[];
  unreadCount: number;
  adminId?: string | null;
  // Per-viewer — this caller's own pin of the chat, not shared. Stripped
  // from the raw member rows server-side and merged back in as
  // viewer-specific state on each returned chat.
  pinnedAt?: string | null;
}

export interface TeamChatEmployee {
  id: string;
  name: string;
  phone: string | null;
  designation: string | null;
  role: string;
  nickname: string | null;
}

export type OvertimeStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface OvertimeRequest {
  id: string;
  date: string;
  requestedHours: number;
  actualHours: number | null;
  reason: string;
  isUrgent: boolean;
  status: OvertimeStatus;
  rejectionReason: string | null;
  overtimePay: number | null;
  createdAt: string;
}

export type JobStatus = 'NEW_ENQUIRY' | 'QUOTED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'FOLLOW_UP_NEEDED';

// The legacy "Job Tracker" pipeline (enquiries/quotes) — distinct from the
// JobCard model behind the Customers & Jobs tab.
export interface TrackerJob {
  id: string;
  vehicleBrand: string;
  vehicleModel: string | null;
  vehicleNumber: string;
  serviceTypes: string[];
  quotedAmount: number | null;
  finalAmount: number | null;
  status: JobStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  createdAt: string;
  customer: { id: string; name: string; phone: string };
  assignedTo: { id: string; name: string };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'PARTIAL' | 'CANCELLED' | 'OVERDUE';

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string | null;
  vehicleNumber: string | null;
  grandTotal: number;
  paidAmount: number;
  balanceDue: number;
  status: InvoiceStatus;
  createdAt: string;
}

export interface InvoiceDetail extends InvoiceListItem {
  subtotal: number;
  cgst: number;
  sgst: number;
  paymentMode: string | null;
  paymentRef: string | null;
  notes: string | null;
  whatsappSent?: boolean;
  customerEmail?: string | null;
  emailSent?: boolean;
  waybillNo?: string | null;
}

// POST /invoices, backend/src/routes/invoiceRoutes.ts — the server computes
// GST/totals from these raw line items via calculateAmounts() when
// manualAmounts is omitted, so the client never needs to replicate that
// calc. Built 2026-09-23: job-card linking and the ADVANCE invoice type
// (a separate, line-item-less shape) are deliberately out of scope for
// this pass, same call already made for the quotations create form.
export interface InvoiceLineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  discountMode?: 'PERCENT' | 'FIXED';
}

export interface CreateInvoiceInput {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerGSTIN?: string;
  vehicleNumber?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleColour?: string;
  lineItems?: InvoiceLineItemInput[];
  gstRate?: number;
  overallDiscountAmount?: number;
  overallDiscountMode?: 'PERCENT' | 'FIXED';
  notes?: string;
  // "Create invoice from job" — jobId links the invoice to a job card
  // (backend/src/routes/invoiceRoutes.ts POST /, re-verified 2026-09-24).
  // FULL requires the job card's list to already have at least one line
  // item, server-enforced; ADVANCE needs `amount` instead of lineItems.
  jobId?: string;
  type?: 'FULL' | 'ADVANCE';
  amount?: number;
}

// ── Phase 3 ──────────────────────────────────────────────────────────────────

export interface ERPSupplier {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

// CRM (backend/src/routes/crm.ts) returns raw JSON, not ApiEnvelope-wrapped.
export interface CrmCustomer {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  vehicles?: { id: string; vehicleNumber: string; make: string | null; model: string | null }[];
  _count?: { crmInvoices: number };
}

export interface CrmCustomersResponse {
  customers: CrmCustomer[];
  total: number;
  page: number;
  limit: number;
}

export type PipelineStatus =
  | 'NEW_ENQUIRY' | 'QUOTED' | 'CONFIRMED' | 'IN_PROGRESS'
  | 'COMPLETED' | 'CANCELLED' | 'FOLLOW_UP_NEEDED';

export interface PipelineJob {
  id: string;
  customerName: string;
  customerPhone: string;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleNumber: string | null;
  serviceTypes: string[];
  quotedAmount: number | null;
  finalAmount: number | null;
  paymentStatus: string;
  priority: string;
  assignedTo: { id: string; name: string; username: string } | null;
  followUpDate: string | null;
  updatedAt: string;
}

export type PipelineResponse = Record<PipelineStatus, PipelineJob[]>;

export interface CallLogEntry {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  startedAt: string;
  durationSeconds: number | null;
  agentName: string | null;
  customerName: string | null;
  counterpartyDisplay: string | null;
  hasRecording: boolean;
  linkStatus: string;
  // Non-null only for OWNER/STORE_MANAGER (the only roles with a global
  // calls:recording.listen grant) AND when hasRecording is true — the id
  // needed to fetch the recording detail (GET /call-recordings/:id). SALES
  // never gets one, even for their own calls (backend/src/routes/calls.ts).
  callRecordingId: string | null;
  recordingProcessing: boolean;
}

export interface CallRecordingSummary {
  id: string;
  createdAt: string;
  durationSeconds: number | null;
  transcriptAvailable: boolean;
}

export type TranscriptStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'TOO_SHORT' | 'ECHO_REJECTED';

export interface CallRecordingDetail {
  id: string;
  audioUrl: string;
  durationSecs: number | null;
  callTimestamp: string;
  transcriptText: string | null;
  transcriptStatus: TranscriptStatus;
}

// FinancialOverview and BankAccount are already defined further below
// (pre-existing, unused plumbing from an earlier phase that already matches
// the real backend shapes — reused as-is here rather than redefined).

export interface AccountingLedger {
  id: string;
  name: string;
  type: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  partyType: 'SUPPLIER' | 'TRANSPORTER' | null;
  balance?: string; // server returns balance.toFixed(2) as a string, not a number
}

export interface PurchaseVoucherItem {
  id: string;
  description: string;
  quantity: string;
  rate: string;
  amount: string;
}

export interface DebitNote {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  totalAmount: string;
  status: string;
  narration: string | null;
  purchaseVoucherId: string;
  purchaseVoucher?: { id: string; voucherNumber: string };
  replacementPurchaseVoucherId: string | null;
  replacementPurchaseVoucher: { id: string; voucherNumber: string } | null;
  items: { id: string; purchaseVoucherItemId: string; returnedQuantity: string; amount: string }[];
}

export interface PurchaseVoucher {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  narration: string | null;
  transporterName: string | null;
  totalAmount: number;
  status: string;
  outstanding: string;
  purchaseOrder: { id: string; status: string; totalAmount: number; supplierId: string } | null;
  allocations: { paymentVoucher: { voucherNumber: string } }[];
  items: PurchaseVoucherItem[];
  debitNotesAsSource: DebitNote[];
  debitNotesAsReplacement: DebitNote[];
}

export interface PaymentVoucher {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  voucherType: 'PAYMENT' | 'RECEIPT';
  totalAmount: number;
  narration: string | null;
  status: string;
  available: string;
}

export interface LedgerDetail {
  ledger: AccountingLedger;
  balance: string;
  purchaseVouchers: PurchaseVoucher[];
  paymentVouchers: PaymentVoucher[];
}

export interface CreateLedgerInput {
  name: string;
  gstin?: string;
  phone?: string;
  email?: string;
  address?: string;
  partyType?: 'SUPPLIER' | 'TRANSPORTER';
}

export interface CreatePaymentVoucherInput {
  ledgerId: string;
  voucherType: 'PAYMENT' | 'RECEIPT';
  voucherNumber: string;
  voucherDate: string;
  totalAmount: number;
  narration?: string;
  allocations?: { purchaseVoucherId: string; amount: number }[];
}

export interface AccountingVoucherLineInput {
  description: string;
  quantity?: number;
  rate: number;
  amount: number;
}

export interface CreatePurchaseVoucherInput {
  ledgerId: string;
  voucherNumber: string;
  voucherDate: string;
  narration?: string;
  transporterName?: string;
  purchaseOrderId?: string;
  items: AccountingVoucherLineInput[];
}

export interface UpdateLedgerInput {
  name: string;
  gstin?: string;
  phone?: string;
  email?: string;
  address?: string;
  partyType: 'SUPPLIER' | 'TRANSPORTER' | null;
}

export interface PostDebitNoteInput {
  purchaseVoucherId: string;
  replacementPurchaseVoucherId?: string;
  voucherNumber: string;
  voucherDate: string;
  narration?: string;
  items: { purchaseVoucherItemId: string; returnedQuantity: number; amount: number }[];
}

export interface PostPaidTransporterVoucherInput {
  ledgerId: string;
  purchaseVoucherNumber: string;
  paymentVoucherNumber: string;
  voucherDate: string;
  narration?: string;
  transporterName?: string;
  purchaseOrderId?: string;
  items: AccountingVoucherLineInput[];
}

export const EXPENSE_CATEGORIES = ['RAPIDO', 'ZEPTO', 'FUEL', 'FOOD', 'SUPPLIES', 'REPAIRS', 'TRAVEL', 'MISC'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// The resolved shape GET /auth/me already computes server-side (backend/src/
// routes/auth.ts) via mergePermissions/getTabAccess (backend/src/lib/
// defaultPermissions.ts) — role defaults folded with any per-employee
// EmployeePermissions override. See MOBILE_PERMISSIONS_PATTERN.md for what
// this does and does NOT cover.
export interface ResolvedPermissions {
  tabs: Record<string, boolean>;
  tabModes: Record<string, string>;
  hasLegalAccess: boolean;
  // GET /auth/me's hasAdsAccess = middleware/auth.ts hasAdsAccess: OWNER, or an
  // explicit `ads` grant — the exact check behind requireAdsAccess.
  hasAdsAccess: boolean;
}

export interface ExpenseAttachment {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: { id: string; name: string };
  createdAt: string;
}

export interface ExpenseReply {
  id: string;
  message: string;
  author: { id: string; name: string };
  createdAt: string;
}

export interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  date: string | null;
  createdAt: string;
  status: ExpenseStatus;
  user?: { id: string; name: string; role: string };
  attachments?: ExpenseAttachment[];
  replies?: ExpenseReply[];
  reviewNote?: string | null;
  reviewedBy?: { id: string; name: string } | null;
}

export interface ExpenseListResponse {
  expenses: Expense[];
  total: number;
  page: number;
  limit: number;
}

export interface ExpenseSummaryByCategory { category: string; amount: number }
export interface ExpenseSummaryByPerson { id: string; name: string; total: number; count: number }
export interface ExpenseSummaryByDay { day: string; amount: number }

export interface ExpenseSummary {
  total: number;
  count: number;
  byCategory: ExpenseSummaryByCategory[];
  byPerson: ExpenseSummaryByPerson[];
  byDay: ExpenseSummaryByDay[];
}

// Extract/bulk-import — added 2026-09-24, closing the gap flagged when
// Expenses' core submit/approve flow was built earlier this pass. Neither
// /extract nor /extract-statement ever persists anything — pure read, the
// caller decides what (if anything) to submit with the result.
export interface ExtractedReceiptFields {
  amount: number | null;
  date: string | null;
}

export interface ExtractedStatementTransaction {
  date?: string;
  amount: number;
  category: ExpenseCategory | string;
  description: string;
  duplicateWarning?: boolean;
}

export interface ExtractedStatementResult {
  transactions: ExtractedStatementTransaction[];
  unparsedNote: string | null;
  source: 'spreadsheet' | 'ai';
}

export type TimesheetStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface TimesheetEntry {
  id?: string;
  task: string;
  hours: number;
  notes?: string;
}

export interface Timesheet {
  id: string;
  date: string;
  entries: TimesheetEntry[];
  totalHours: number;
  status: TimesheetStatus;
  notes: string | null;
  // GET /timesheets/my-month (backend/src/routes/timesheets.ts, re-verified
  // 2026-09-24) includes these same fields as TimesheetDetail below — the
  // self-service view was only reading a subset. editableUntil/canEdit come
  // from withEditability, which is where the SUBMITTED one-time 60-minute
  // edit window (canEditSubmittedTimesheet) is actually computed — never
  // re-derive that window client-side.
  entryReplies?: TimesheetEntryReply[];
  entryContacts?: TimesheetEntryContactLink[];
  entryAttachments?: TimesheetEntryAttachment[];
  editableUntil?: string | null;
  canEdit?: boolean;
}

// ── Manager-side full timesheet detail (GET /timesheets/:id,
// backend/src/routes/timesheets.ts) — the per-entry collaboration surface:
// replies, attachments, and linked contacts, plus who each entry's already-
// open follow-up task (if any) belongs to.
export interface TimesheetEntryReply {
  id: string;
  entryId: string;
  authorId: string;
  message: string;
  author: { id: string; name: string };
  createdAt: string;
}

export interface TimesheetEntryAttachment {
  id: string;
  entryId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: { id: string; name: string };
  createdAt: string;
}

export interface TimesheetEntryContactLink {
  id: string;
  entryId: string;
  reason: string | null;
  linkedBy: { id: string; name: string };
  contact: Contact;
  createdAt: string;
}

export interface TimesheetFollowUpTask {
  id: string;
  sourceEntryId: string | null;
  status: string;
  title: string;
}

export interface TimesheetDetail {
  id: string;
  date: string;
  entries: TimesheetEntry[];
  totalHours: number;
  status: TimesheetStatus;
  notes: string | null;
  user: { id: string; name: string; username: string; designation: string | null; role: string };
  approvedBy: { id: string; name: string } | null;
  entryReplies: TimesheetEntryReply[];
  entryAttachments: TimesheetEntryAttachment[];
  entryContacts: TimesheetEntryContactLink[];
  followUpTasks: TimesheetFollowUpTask[];
  canEdit: boolean;
}

export interface CallCapabilities {
  callingEnabled: boolean;
  canInitiate: boolean;
  canListenRecordings: boolean;
  canDownloadRecordings: boolean;
  canViewAllCalls: boolean;
}

export interface CallInitiateResult {
  ok: boolean;
  callSid?: string;
}

export interface PayrollResult {
  userId?: string;
  userName?: string;
  designation?: string | null;
  monthlySalary: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  earnedSalary: number;
  absentDeduction: number;
  halfDayDeduction: number;
  lateDeduction: number;
  lateCount: number;
  carriedLates: number;
  lateFullDays: number;
  lateHalfDays: number;
  lateCarryForward: number;
  carriedLateDeduction: number;
  totalOvertimePay: number;
  totalLoanDeduction: number;
  // Per-advance breakdown of totalLoanDeduction above — already computed and
  // returned by GET /payroll/calculate (backend/src/services/payrollService.ts)
  // but never surfaced in any UI before 2026-09-21; only the lump total was
  // shown, with no way to tell which advance it came from.
  loanDeductions: { loanId: string; amount: number; remainingAfter: number }[];
  totalDeductions: number;
  netSalary: number;
  finalSalaryOverride: number | null;
  cycleStart: string;
  cycleEnd: string;
  dailyRate: number;
  payableDays: number;
  // Only ever present (and false) on the unconfigured-employee stub row
  // calculateAllPayroll synthesizes (backend/src/services/payrollService.ts)
  // — absent on every real calculated row, so treat `!== false` as configured.
  isConfigured?: boolean;
  attendanceDetails?: PayrollAttendanceDetail[];
}

export interface PayrollAttendanceDetail {
  date: string;
  status: 'PRESENT' | 'LATE' | 'HALF_DAY' | 'ABSENT' | 'LEAVE' | 'WEEKEND';
  clockIn: string | null;
  clockOut: string | null;
  isOverridden: boolean;
  overrideReason: string | null;
  overriddenByName: string | null;
}

export interface LateRecord {
  id: string;
  date: string;
  /** WARNING (lates 1-2) | HALF_DAY (3-4) | FULL_DAY (5-7) | ONE_HALF_DAY (default) — see payrollService.calculateLatePenalty. */
  penaltyApplied: string;
}

export type LoanStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

export type RepaymentMode = 'MONTHLY_N' | 'LUMP_NEXT_MONTH' | 'TBD' | 'CUSTOM';

export interface LoanScheduleEntry {
  id: string;
  month: number;
  year: number;
  plannedAmount: number;
}

export interface LoanOrAdvance {
  id: string;
  amount: number;
  remainingAmount: number;
  monthlyDeductionPercent: number;
  monthlyDeductionAmount: number;
  repaymentMode: RepaymentMode | null;
  tenureMonths: number | null;
  status: LoanStatus;
  notes: string | null;
  rejectionReason: string | null;
  requestedAt: string;
  approvedAt: string | null;
  // The repayment plan for MONTHLY_N/CUSTOM loans — what's due which month.
  // Added 2026-09-21: this model already existed (used internally by payroll
  // to compute deductions) but was never read back out to the employee.
  scheduleEntries: LoanScheduleEntry[];
  // The loan's own CREATE history row, if any — self-requested loans
  // (POST /loans) never write one; only admin-created ones (POST /loans/
  // admin, e.g. a cashier recording an advance on the employee's behalf) do.
  // So `history.length > 0` alone means "someone else created this for me,"
  // no userId comparison needed. Empty array, never undefined/null, when
  // there's no such row.
  history: { changedBy: { id: string; name: string } }[];
}

export interface FullProfile {
  id: string;
  name: string;
  username: string;
  employeeId: string | null;
  role: string;
  phone: string | null;
  designation: string | null;
  monthlySalary: number | null;
  joiningDate: string | null;
  email: string | null;
  personalEmail: string | null;
  personalPhone: string | null;
  branch: string | null;
  isActive: boolean;
  customClockIn: string | null;
  customClockOut: string | null;
  defaultLeaves: number | null;
  workingDaysPerMonth: number | null;
}

export type IdentityDocType =
  | 'PAN_CARD' | 'AADHAAR_CARD' | 'OTHER'
  | 'PASSPORT' | 'DRIVING_LICENCE' | 'VOTER_ID' | 'LAST_SALARY_SLIP' | 'BANK_ACCOUNT' | 'CV'
  | 'EDUCATION_CERTIFICATE' | 'EXPERIENCE_LETTER';

// HR applications (ATS) — core subset of APPLICATION_SELECT in
// backend/src/routes/applications.ts, as returned by maskApplication. Statuses
// are the backend's STATUSES array.
export type ApplicationStatus =
  | 'APPLIED' | 'AI_SCREENING' | 'AI_INTERVIEW' | 'ASSESSMENT' | 'MANAGER_INTERVIEW' | 'SELECTED' | 'REJECTED';

export interface Application {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleApplied: string | null;
  department: string | null;
  status: ApplicationStatus;
  notes: string | null;
  dateOfBirth: string | null;
  age: number | null;
  currentAddress: string | null;
  permanentAddress: string | null;
  fresher: boolean | null;
  convertedUserId: string | null;
  // Advisory AI résumé screening (POST /:id/ai-screen); null until first run.
  aiScreeningResult: AiScreeningResult | null;
  aiScreenedAt: string | null;
  // Uploaded documents — a null filename means that document doesn't exist.
  resumeFilename: string | null;
  resumeMimeType: string | null;
  aadhaarImageFilename: string | null;
  aadhaarImageMimeType: string | null;
  salarySlipFilename: string | null;
  salarySlipMimeType: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
  // Manager Interview schedules, most recent first; at most one is SCHEDULED.
  interviewSchedules?: InterviewSchedule[];
}

// backend/src/lib/cvScreen.ts CvScreeningResult. fitScore is 0-100. A result
// with degraded=true (or the legacy all-empty shape, see isDegradedScreening)
// carries a placeholder fitScore of 0 that must never be shown as a real score.
export interface AiScreeningResult {
  skillsMatched: string[];
  experienceSummary: string;
  fitScore: number;
  rationale: string;
  modelUsed: string;
  degraded?: boolean;
}

// Subset of the AI interview / assignment scorecard that Compare displays
// (backend lib/aiInterview.ts, ariaInterview.ts, aiAssignment.ts).
// answeredCount === 0 (ARIA only) means "Not enough data", not a score of 0.
export interface AiScorecardSummary {
  weightedOverallScore: number;
  answeredCount?: number;
  totalCompetencies?: number;
  flaggedForReview?: boolean;
}

// GET /applications/compare?role= — ApplicationComparisonRow
// (backend/src/lib/applicationsData.ts). Stages not yet completed are null.
export interface CompareCandidate {
  id: string;
  name: string;
  status: ApplicationStatus;
  aiScreeningResult: AiScreeningResult | null;
  aiScreenedAt: string | null;
  aiInterviewScorecard: AiScorecardSummary | null;
  aiInterviewCompletedAt: string | null;
  aiAssignmentScorecard: AiScorecardSummary | null;
  aiAssignmentCompletedAt: string | null;
  createdAt: string;
}

// GET /applications/role-coverage
export interface RoleCoverage {
  roleApplied: string;
  applicantCount: number;
  hasLiveTemplate: boolean;
}

// POST /:id/interview-invite. inviteLink is the only way to reach the candidate
// when emailSent is false (the server won't show it again).
export interface InterviewInviteResult {
  id: string;
  expiresAt: string;
  createdAt: string;
  inviteLink: string;
  emailSent: boolean;
  sentTo: string | null;
  hasEmail: boolean;
  message?: string;
}

// Practical Assessment questions (backend PracticalQuestion model + the
// /:id/practical-questions routes). assessmentInviteId non-null = already sent
// to the candidate: locked against edit/delete/approve.
export interface PracticalQuestion {
  id: string;
  applicationId: string | null;
  assessmentInviteId: string | null;
  questionText: string;
  source: string;
  sortOrder: number;
  approvedAt: string | null;
  approvedBy: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
}

// GET /:id/practical-questions. `scorecard` and `recordings` are returned too
// but not used by the mobile app yet.
export interface PracticalQuestionsData {
  questions: PracticalQuestion[];
}

// POST /:id/practical-questions/approve-all — sends the assessment. When the
// email didn't go out, inviteLink is the only way to reach the candidate.
export interface SendAssessmentResult {
  inviteLink: string;
  expiresAt: string;
  questionCount: number;
  emailSent: boolean;
  sentTo: string | null;
  hasEmail: boolean;
  message?: string;
}

// Manager Interview scheduling — see services/interviewSchedule.ts
// (resolveInterviewLocation) and APPLICATION_SELECT.interviewSchedules.
export type InterviewLocationType = 'COMPANY' | 'ONLINE' | 'OTHER';

export interface InterviewSchedule {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  location: string | null;
  // null on rows saved before locationType existed.
  locationType: InterviewLocationType | null;
  notes: string | null;
  status: 'SCHEDULED' | 'CANCELLED';
  sequence: number;
  interviewerId: string;
  interviewer: { id: string; name: string; email: string | null };
  createdAt: string;
}

export interface InterviewScheduleInput {
  scheduledStart: string;
  scheduledEnd: string;
  interviewerId: string;
  locationType: InterviewLocationType;
  location: string;
  notes?: string;
}

// Email delivery flags returned by schedule / reschedule / cancel.
export interface InterviewScheduleResult {
  application: Application | null;
  candidateEmailed: boolean;
  interviewerEmailed: boolean;
  candidateHasEmail: boolean;
  interviewerHasEmail: boolean;
  message?: string;
}

// POST /applications/invite and /:id/invite/resend. inviteLink is returned so
// HR can send it by hand when emailSent is false.
export interface ApplicationInviteResult {
  inviteLink: string;
  expiresAt: string;
  emailSent: boolean;
}

// GET /applications/:id/invite — most recent self-service (APPLICATION) invite,
// or null when none was ever sent. A PENDING row past expiresAt is expired.
export interface ApplicationInvite {
  id: string;
  status: 'PENDING' | 'USED' | 'REVOKED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
}

// HR onboarding checklist — shape of ONBOARDING_SELECT in backend/src/routes/hr.ts.
export interface OnboardingTask {
  id: string;
  checklistId: string;
  title: string;
  description: string | null;
  responsible: string | null;
  sortOrder: number;
  isDone: boolean;
  doneAt: string | null;
  doneById: string | null;
}

export interface OnboardingChecklist {
  id: string;
  userId: string;
  createdAt: string;
  completedAt: string | null;
  createdBy: { id: string; name: string };
  user: { id: string; name: string; employeeId: string | null; designation: string | null; joiningDate: string | null };
  tasks: OnboardingTask[];
}

export interface OnboardingOverviewItem extends OnboardingChecklist {
  totalTasks: number;
  completedTasks: number;
}

// Matches Prisma's LeaveType enum exactly (backend/prisma/schema.prisma).
export type LeaveType = 'SICK' | 'PERSONAL' | 'EMERGENCY';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LeaveRequest {
  id: string;
  userId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  isHalfDay: boolean;
  status: LeaveStatus;
  rejectionReason: string | null;
  createdAt: string;
  respondedAt: string | null;
  user: { id: string; name: string; username: string; role?: string };
  approvedBy: { id: string; name: string; username: string } | null;
}

export interface IdentityDocument {
  id: string;
  type: IdentityDocType;
  label: string | null;
  filename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
  hasValue: boolean;
  maskedValue?: string | null;
}

// ── Desk-only "safe" batch ──────────────────────────────────────────────────

export type ItemStatus = 'ACTIVE' | 'OUT_OF_STOCK' | 'DISCONTINUED';

export interface InventoryItemRow {
  id: string;
  product: string;
  category: string;
  unit: string;
  status: ItemStatus;
  totalStock: number;
  sellingPrice: number | null;
  imageUrls?: string[];
  lastVerifiedAt?: string | null;
  lastVerifiedCount?: number | null;
  storeLocation?: string | null;
}

// POST/PATCH /inventory-items, POST /inventory-items/:id/receipts, POST
// /inventory-items/items-out — write actions added 2026-09-23 (scope
// update: full dashboard parity). Deliberately scoped to the basic
// InventoryItem fields; the receipt-level cost/dealer/logistics/GST/date
// fields PATCH /:id also accepts are out of scope for this pass (the same
// "batch management" concern is covered instead by the simpler POST
// /:id/receipts create-a-new-batch form below). Barcode scanning stays out
// of scope — no camera/barcode package installed, per the existing note
// on this screen.
export interface InventoryItemInput {
  product: string;
  category: string;
  sellingPrice?: number;
  incentiveValue?: number;
  unit?: string;
  compatibility?: string;
  warranty?: string;
  notes?: string;
  status?: ItemStatus;
  storeLocation?: string | null;
}

export interface InventoryReceiptInput {
  quantityReceived: number;
  costPerUnit?: number;
  sellerName?: string;
  notes?: string;
  barcode?: string;
  billUrl?: string;
}

// GET /inventory-items/:id (backend/src/routes/inventory_items_route.ts)
// includes the raw StockReceipt rows for that item — this is the shape of
// each one, verified against the schema + PATCH /receipts/:id handler.
export interface StockReceipt {
  id: string;
  itemId: string;
  barcode?: string | null;
  remainingQty?: number | null;
  quantityReceived: number;
  sellerName?: string | null;
  sellerContact?: string | null;
  sellerCity?: string | null;
  orderPlacedTo?: string | null;
  logisticsPartner?: string | null;
  logisticsCharge?: number | null;
  logisticsPartner2?: string | null;
  logisticsCharge2?: number | null;
  costPerUnit?: number | null;
  dealerPrice?: number | null;
  mrpAtReceipt?: number | null;
  gstPercent?: number | null;
  paymentTerms?: string | null;
  billUrl?: string | null;
  orderDate?: string | null;
  receiptDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  storeLocation?: string | null;
  createdAt: string;
}

// GET /inventory-items/:id returns the raw InventoryItem row (no computed
// totalStock/effectiveStatus — those are only computed by the LIST route),
// plus receipts. Used only to pull the receipts array; item fields keep
// coming from the already-fetched list row (InventoryItemRow).
export interface InventoryItemDetail {
  id: string;
  receipts: StockReceipt[];
}

// GET /inventory-items/incoming — draft receipts (receiptDate is null,
// i.e. never confirmed as arrived). 100% new — no mobile plumbing existed
// for this at all before this pass.
export interface DraftReceipt extends StockReceipt {
  estimatedArrivalDate?: string | null;
  item?: { product: string; category: string; unit: string } | null;
}

export interface ConfirmArrivalInput {
  quantityReceived?: number;
  receiptDate?: string;
  notes?: string;
}

// POST /api/v1/inventory/stock-receipts/:id/reconcile — a DIFFERENT
// backend route base (/inventory, not /inventory-items) and a wider role
// gate (adds TECH_TEAM) than the rest of this screen's write actions.
// Distinct from the simpler item-level reconcileInventoryItem() below,
// which adjusts the most recent batches automatically with no reason.
export type ReconcileReason = 'DAMAGED' | 'THEFT_LOSS' | 'COUNTING_ERROR' | 'FOUND_EXTRA' | 'OTHER';

export interface ReconciliationRecord {
  id: string;
  stockReceiptId: string;
  previousQty: number;
  newQty: number;
  difference: number;
  reason: string;
  notes?: string | null;
  reconciledAt: string;
  user?: { name: string };
}

// PATCH /inventory-items/receipts/:receiptId (requireInventoryWrite) —
// same route EditBatchModal and the inline store-location edit both use.
export interface UpdateReceiptInput {
  sellerName?: string;
  sellerContact?: string;
  sellerCity?: string;
  orderPlacedTo?: string;
  logisticsPartner?: string;
  logisticsCharge?: number;
  logisticsPartner2?: string;
  logisticsCharge2?: number;
  paymentTerms?: string;
  eta?: string;
  quantityReceived?: number;
  costPerUnit?: number;
  dealerPrice?: number;
  mrpAtReceipt?: number;
  gstPercent?: number;
  billUrl?: string;
  orderDate?: string;
  receiptDate?: string;
  expiryDate?: string;
  notes?: string;
  storeLocation?: string | null;
}

// POST /inventory-items/items-out (backend/src/routes/inventory_items_route.ts)
// — barcode is preferred (a locked, race-safe deduction against a specific
// receipt); itemName is a fallback FIFO-deduction path across that item's
// receipts. category is only used by the dashboard to filter its item-name
// datalist, not sent meaningfully server-side beyond that.
export interface ItemOutInput {
  barcode?: string;
  itemName?: string;
  category?: string;
  quantity: number;
  unit?: string;
  reason?: string;
  notes?: string;
  date?: string;
}

// status: DEDUCTED (normal path) | OUT_OF_STOCK_AT_TIME | ITEM_NOT_IN_INVENTORY
// — set server-side depending on what the deduction attempt found.
export interface ItemOutLog {
  id: string;
  itemId?: string | null;
  itemName: string;
  barcode?: string | null;
  quantity: number;
  unit: string | null;
  reason: string | null;
  notes?: string | null;
  status: string;
  loggedById?: string;
  date: string;
  item?: { product: string; category: string } | null;
}

export type SOStatus = 'DRAFT' | 'CONFIRMED' | 'SHIPPED' | 'CANCELLED';

export interface SalesOrderLine {
  id: string;
  qty: number;
  unitPrice: number;
  item: { id: string; name: string };
}

export interface SalesOrder {
  id: string;
  customerName: string;
  customerEmail: string | null;
  status: SOStatus;
  totalAmount: number;
  createdAt: string;
  lines: SalesOrderLine[];
}

export type POStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'CANCELLED';

export interface PurchaseOrderLine {
  id: string;
  qty: number;
  unitCost: number;
  item: { id: string; name: string };
}

export interface PurchaseOrder {
  id: string;
  status: POStatus;
  totalAmount: number;
  createdAt: string;
  supplier: { id: string; name: string };
  lines: PurchaseOrderLine[];
}

export type SimStatus = 'ACTIVE' | 'INACTIVE' | 'LOST' | 'EXPIRED' | 'SPARE';

export interface SimCard {
  id: number;
  simNumber: string;
  mobileNumber: string | null;
  operator: string;
  dataPlan: string | null;
  monthlyRent: number | null;
  assignedTo: string | null;
  purpose: string | null;
  deviceName: string | null;
  status: SimStatus;
  planExpiry: string | null;
  notes: string | null;
}

export interface CreateSimInput {
  simNumber: string;
  mobileNumber?: string;
  operator: string;
  dataPlan?: string;
  monthlyRent?: number;
  planExpiry?: string;
  assignedTo?: string;
  purpose?: string;
  deviceName?: string;
  status?: SimStatus;
  notes?: string;
}

export interface CompanySettings {
  id: string | null;
  gstNo: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  logoUrl: string | null;
}

export interface AllTimesheetRow {
  id: string;
  date: string;
  totalHours: number;
  status: TimesheetStatus;
  user: { id: string; name: string; designation: string | null };
}

export interface AllTimesheetsResponse {
  timesheets: AllTimesheetRow[];
  total: number;
  page: number;
  totalPages: number;
}

export interface PendingOvertimeRequest {
  id: string;
  date: string;
  requestedHours: number;
  reason: string;
  isUrgent: boolean;
  user: { id: string; name: string; role: string; designation: string | null };
  // Fields present on GET /overtime (the all-requests fetch) but not on
  // GET /overtime/pending — optional since the pending-only fetch's rows
  // won't have them. Added 2026-09-24 for the Approved/Rejected tabs.
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  actualHours?: number | null;
  overtimePay?: number | null;
  approvedBy?: { id: string; name: string } | null;
  createdAt: string;
  approvedAt?: string | null;
}

export interface AgentStatus {
  agentName: string;
  isActive: boolean;
  lastActivity: string | null;
  todayCount: number;
}

export interface AgentActivity {
  id: string;
  agentName: string;
  action: string;
  createdAt: string;
}

export interface RoleAppPolicy {
  id: string;
  role: string;
  appName: string;
  packageName: string | null;
  isAllowed: boolean;
  deviceType: DeviceType;
}

export interface DeviceLocationLog {
  id: string;
  latitude: number;
  longitude: number;
  createdAt: string;
}

export interface DeviceAppUsage {
  id: string;
  appName: string;
  packageName: string | null;
  usageMinutes: number;
  date: string;
}

export interface DeviceDetail extends DeviceRow {
  deviceModel: string | null;
  osVersion: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  isCompanyOwned: boolean;
  registeredAt: string;
}

export interface SimStats {
  total: number;
  active: number;
  inactive: number;
  lost: number;
  expired: number;
  spare: number;
  expiringSoon: number;
}

// ── Crown jewels — Employees / Configure / MDM ──────────────────────────────
// Deliberately no salary fields here: the mobile Employees directory never
// requests or renders monthlySalary/salaryType, even for authorized roles —
// that data belongs to Payroll/My Salary, not the general directory.

export interface EmployeeListItem {
  id: string;
  name: string;
  username: string;
  employeeId: string | null;
  role: string;
  phone: string | null;
  designation: string | null;
  isActive: boolean;
  // Always present in GET /employees regardless of canEditSalary — only
  // monthlySalary/salaryType are stripped for non-salary-authorized callers.
  customClockIn: string | null;
  customClockOut: string | null;
  defaultLeaves: number | null;
  workingDaysPerMonth: number | null;
}

// The actual GET/PUT /staff-config/:userId response shape (the ShiftConfig
// Prisma model's arrival-timing cutoffs) — distinct from the attendance
// defaults (customClockIn/Out, workingDaysPerMonth, defaultLeaves) which
// live on the User model and are read/written through EmployeeListItem
// above and updateStaffConfigAttendanceDefaults below, NOT this type. A
// prior version of this file conflated the two under one `ShiftConfig`
// name and sent the wrong fields to this endpoint — see MOBILE_PERMISSIONS_PATTERN
// note in staff-config.tsx for the fix.
export interface ShiftTimingConfig {
  userId: string;
  onTimeBeforeH: number;
  onTimeBeforeM: number;
  lateBeforeH: number;
  lateBeforeM: number;
  halfDayBeforeH: number;
  halfDayBeforeM: number;
  minFullDayMins: number;
}

export type ContactType = 'CUSTOMER' | 'VENDOR_SERVICE_PROVIDER' | 'STAFF' | 'OTHER';

export interface Contact {
  id: string;
  phone: string;
  contactType: ContactType;
  contactTypeOther: string | null;
  name: string | null;
  reason: string | null;
  addedBy: { id: string; name: string } | null;
  lastEditedBy?: { id: string; name: string } | null;
  createdAt: string;
}

// GET /contacts/:id (backend/src/routes/contacts.ts, re-verified 2026-09-24)
// joins TimesheetEntryContact rows for this contact against their parent
// timesheet's entries — every timesheet entry this contact was ever linked
// to, across every employee.
export interface ContactLink {
  id: string;
  entryId: string;
  reason: string | null;
  createdAt: string;
  linkedBy: { id: string; name: string };
  timesheetId: string;
  timesheetDate: string;
  employee: { id: string; name: string };
  entryTask: string | null;
}

export interface ContactDetail extends Contact {
  links: ContactLink[];
}

export interface EmployeeDetail {
  id: string;
  name: string;
  username: string;
  phone: string | null;
  designation: string | null;
  isActive: boolean;
  role: string;
  createdAt: string;
}

export const MODE_TABS = [
  'customers_jobs',
  'invoices',
  'employees',
  'attendance',
  'payroll',
  'financial',
  'inventory',
  'expenses',
] as const;
export type ModeTab = (typeof MODE_TABS)[number];

export const TAB_MODES: Record<ModeTab, readonly string[]> = {
  customers_jobs: ['view_only', 'sales_mode', 'full_access'],
  invoices: ['view_only', 'create_collect', 'full_access'],
  employees: ['view_only', 'hr_edit', 'full_access'],
  attendance: ['own_only', 'full_access'],
  payroll: ['view_only', 'full_access'],
  financial: ['view_only', 'full_access'],
  inventory: ['view_only', 'full_access'],
  expenses: ['add', 'verify', 'both'],
};

export const TAB_LABELS: Record<ModeTab, string> = {
  customers_jobs: 'Customers & Jobs',
  invoices: 'Invoices',
  employees: 'Employees',
  attendance: 'Attendance',
  payroll: 'Payroll',
  financial: 'Financial',
  inventory: 'Inventory',
  expenses: 'Expenses',
};

export interface TabAccess {
  enabled: boolean;
  mode: string;
}

// GET /permissions/tabs/registry — the same TAB_REGISTRY backend/src/lib/
// tabRegistry.ts already uses to gate every route; mirrored here so the
// mobile Configure screen (built 2026-09-23) lists exactly the tabs and
// mode options the backend actually enforces, not a hand-maintained copy.
export interface TabModeConfig {
  options: readonly string[];
  roleDefaults: Partial<Record<string, string>>;
}

export interface TabDef {
  key: string;
  label: string;
  group: 'general' | 'hr' | 'finance' | 'operations' | 'devices';
  route?: string;
  parent?: string;
  roleDefaults: Record<string, boolean>;
  mode?: TabModeConfig;
}

export interface EmployeePermissions {
  employeeId: string;
  name: string;
  role: string;
  permissions: Record<string, boolean | TabAccess>;
  hasOverrides: boolean;
  overrides: Record<string, boolean | TabAccess> | null;
}

export type DeviceType = 'ANDROID' | 'IOS';

export interface DeviceRow {
  id: string;
  deviceType: DeviceType;
  deviceName: string;
  deviceModel: string | null;
  isOnline: boolean;
  isLocked: boolean;
  lastSeen: string | null;
  user: { id: string; name: string; role: string } | null;
  alerts: { id: string; alertType: string }[];
}

export interface DeviceAlert {
  id: string;
  deviceId: string;
  alertType: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

// ── Payroll — OWNER/STORE_MANAGER/CASHIER only, both server- and UI-gated ──

export interface CompanyPayrollSummary {
  month: number;
  year: number;
  summary: { totalPayroll: number; totalDeductions: number; employeeCount: number; avgAttendance: number };
  employees: PayrollResult[];
}

export interface SalaryPaymentRecord {
  id: string;
  month: number;
  amount: number;
  mode: string | null;
  paidAt: string;
  paidBy: { name: string } | null;
}

// GET /payroll/disbursement/:year/:month — requirePayrollAccess
// (SALARY_ADMIN_ROLES=[OWNER,STORE_MANAGER,CASHIER], backend/src/routes/
// payroll.ts, verified 2026-09-19).
export interface LoanScheduledPlanEntry {
  loanId: string;
  mode: 'MONTHLY_N' | 'LUMP_NEXT_MONTH' | 'TBD' | 'CUSTOM';
  plannedAmount: number;
  carriedAmount: number;
  cappedAmount: number;
  suggestedAmount?: number;
}

export interface PayrollDisbursementRow {
  userId: string;
  name: string;
  role: string;
  branch: string | null;
  grossSalary: number;
  loanDeduction: number;
  loanOutstanding: number;
  loanMonthlyDeduction: number;
  advanceDeduction: number;
  attendanceDeduction: number;
  earnedSalary: number;
  payableDays: number;
  netPayable: number;
  incentiveSuggestion: { thisMonth: number; runningTotal: number };
  loanScheduledPlan?: LoanScheduledPlanEntry[];
  unpaidIncentiveBalance?: number;
  payment: {
    id: string; amount: number; mode: string | null; paidAt: string;
    grossSalary?: number; loanDeduction?: number; advanceDeduction?: number;
    advanceSkipped?: boolean; attendanceDeduction?: number; totalDeductions?: number;
    amountPaid?: number; paymentMode?: string; netPayable?: number;
    note?: string; paidBy?: string;
  } | null;
}

// ── ERP Finance — OWNER/STORE_MANAGER/ACCOUNTING only ──────────────────────

export interface ErpFinanceKpis {
  totalRevenue: number;
  totalProfit: number;
  totalOrders: number;
  avgOrderValue: number;
  profitPerOrder: number;
  momGrowth: number;
}

export interface ErpFinanceChartPoint {
  month: string;
  yearMonth: string;
  revenue: number;
  profit: number;
}

export interface ErpFinanceOverview {
  kpis: ErpFinanceKpis;
  chart: ErpFinanceChartPoint[];
}

export interface ErpFinanceOrder {
  isHistorical: boolean;
  id: string;
  date: string;
  orderNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  vehicleModel: string | null;
  amount: number | null;
  qty: number | null;
  unitPrice: number | null;
  profit: number | null;
  status: string | null;
  paymentMethod: string | null;
  soldBy: string | null;
  lineItems: string[];
  remarks: string | null;
  isFormerEmployee?: boolean;
  sourceNote?: string | null;
}

export interface ErpFinanceOrdersResponse {
  orders: ErpFinanceOrder[];
  total: number;
  page: number;
  limit: number;
  liveCount: number;
  historicalCount: number;
}

export interface ErpFinanceEmployeePerformance {
  name: string;
  designation?: string;
  revenue: number;
  profit: number;
  orderCount: number;
}

export interface ErpFinanceService {
  service: string;
  revenue: number;
  orderCount?: number;
  volume?: number;
}

export interface ErpFinanceServices {
  byRevenue: ErpFinanceService[];
  byVolume: ErpFinanceService[];
}

export interface ErpFinanceCustomer {
  name: string;
  phone: string | null;
  totalSpend: number;
  orderCount: number;
  lastVisit: string;
}

export interface ErpFinanceDailyPoint {
  date: string;
  revenue: number;
  profit: number;
  orders: number;
  entries: number;
}

export interface ErpFinanceCustomers {
  customers: ErpFinanceCustomer[];
  walkInCount: number;
}

export interface ErpFinanceMonthlyEmployee {
  name: string;
  monthly: { month: string; revenue: number; profit: number; orders: number }[];
  total: number;
}

export interface ErpFinanceMonthlyBreakdown {
  employees: ErpFinanceMonthlyEmployee[];
  months: string[];
}

// ── Staff Remarks — OWNER manages, everyone sees their own ────────────────

export type RemarkRating = 'POSITIVE' | 'NEGATIVE';
export type RemarkCategory =
  | 'ATTENDANCE'
  | 'PUNCTUALITY'
  | 'SALES'
  | 'CUSTOMER_HANDLING'
  | 'BEHAVIOUR'
  | 'TEAMWORK'
  | 'INITIATIVE'
  | 'OTHER';
export type RemarkVisibility = 'VISIBLE_TO_EMPLOYEE' | 'PRIVATE';

export interface RemarkReply {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; role: string };
}

export interface StaffRemark {
  id: string;
  employeeId: string;
  authorId: string;
  rating: RemarkRating;
  category: RemarkCategory;
  visibility: RemarkVisibility;
  note: string;
  createdAt: string;
  employee: { id: string; name: string; role: string };
  author: { id: string; name: string };
  replies: RemarkReply[];
}

export interface MyRemark {
  id: string;
  rating: RemarkRating;
  category: RemarkCategory;
  note: string;
  createdAt: string;
  replies: RemarkReply[];
}

export interface CreateRemarkInput {
  employeeId: string;
  rating: RemarkRating;
  category: RemarkCategory;
  visibility: RemarkVisibility;
  note: string;
}

// ── Owner Dashboard Overview — requireOwner only ──────────────────────────

export interface DashboardOverview {
  attendance: { present: number; absent: number; late: number; onTime: number; total: number };
  jobs: { open: number; byEmployee: { id: string; name: string; role: string; count: number }[] };
  revenue: { todayCollections: number; monthRevenue: number; outstanding: number; monthInvoiceCount: number };
  recentInvoices: {
    id: string;
    invoiceNumber: string;
    customerName: string;
    grandTotal: number;
    paidAmount: number;
    balanceDue: number;
    status: string;
    createdAt: string;
  }[];
  recentJobs: {
    id: string;
    jobNumber: string;
    vehicleNumber: string;
    reasonForVisit: string;
    status: string;
    createdAt: string;
  }[];
}

export interface OnLeaveEntry {
  id: string;
  user: { id: string; name: string; role: string };
  leaveType: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  isToday: boolean;
}

export interface DashboardRecentActivityItem {
  id: string;
  staffName: string;
  staffInitials: string;
  action: string;
  customerName: string;
  vehicleBrand: string | null;
  vehicleNumber: string;
  serviceTypes: string[];
  status: string;
  priority: string;
  createdAt: string;
}

export interface DashboardTodaySnapshot {
  jobsToday: {
    id: string;
    customerName: string;
    vehicleBrand: string | null;
    vehicleNumber: string;
    serviceTypes: string[];
    status: string;
    priority: string;
    assignedTo: string;
    createdAt: string;
  }[];
  staffPresent: { name: string; clockIn?: string; isLate: boolean }[];
  pendingFollowUps: {
    id: string;
    customerName: string;
    vehicleBrand: string | null;
    vehicleNumber: string;
    serviceTypes: string[];
    followUpDate?: string;
    assignedTo: string;
  }[];
}

export interface DashboardRevenueByEmployee {
  name: string;
  revenue: number;
  jobs: number;
}

// ── Employee Agreements — OWNER/STORE_MANAGER/HR only ──────────────────────

export type AgreementStatus = 'DRAFT' | 'AWAITING_EMPLOYEE' | 'SIGNED' | 'VOID';

export interface AgreementListItem {
  id: string;
  userId: string;
  employeeName: string;
  role: string;
  designation: string | null;
  agreementType: string;
  status: AgreementStatus;
  ownerName: string | null;
  ownerSignedAt: string | null;
  employeeSignedName: string | null;
  employeeSignedAt: string | null;
  effectiveDate: string | null;
  placeOfSigning: string | null;
  pdfUrl: string | null;
  createdAt: string;
}

export interface AgreementDetail extends AgreementListItem {
  bodyJson: unknown;
  ownerSignature: string | null;
  employeeSignature: string | null;
  employeeIp: string | null;
  witnessName: string | null;
  createdById: string;
}

export interface LoanRepayment {
  id: string;
  month: number;
  year: number;
  amountDeducted: number;
  remainingAfter: number;
  createdAt: string;
}

// ── Incentives — reads: OWNER/STORE_MANAGER/HR/ACCOUNTING/CASHIER; writes
// (targets, PUT amount): CASHIER/OWNER only, server-gated.

export interface IncentiveMonthEntry {
  amount: number;
  note: string | null;
  awardedBy: { id: string; name: string } | null;
  awardedAt: string;
}

export interface IncentiveRosterEntry {
  userId: string;
  name: string;
  role: string;
  thisMonth: IncentiveMonthEntry | null;
  runningTotal: number;
}

// ── Incentive Ledger — credits stack, payouts draw down (backend/src/routes/
// incentives.ts). Independent of the per-month PUT /:userId system above;
// same read gate (requireManagerOrOwner) and write gate (requireCashierOrOwner
// = CASHIER/OWNER only, narrower than Payroll's own SALARY_ADMIN_ROLES).
export interface IncentiveCreditHistoryEntry {
  id: string;
  oldAmount: number | null;
  newAmount: number;
  changedBy: { id: string; name: string };
  createdAt: string;
}

export interface IncentiveCredit {
  id: string;
  amount: number;
  note: string | null;
  addedBy: { id: string; name: string };
  addedAt: string;
  updatedAt: string;
  history: IncentiveCreditHistoryEntry[];
}

export interface IncentivePayout {
  id: string;
  amount: number;
  note: string | null;
  paidBy: { id: string; name: string };
  paidAt: string;
}

export interface IncentiveLedger {
  user: { id: string; name: string; role: string };
  totalCredited: number;
  totalPaid: number;
  balance: number;
  credits: IncentiveCredit[];
  payouts: IncentivePayout[];
}

export interface IncentiveHistoryEntry {
  id: string;
  userId: string;
  month: number;
  year: number;
  amount: number;
  note: string | null;
  awardedBy: { id: string; name: string } | null;
  awardedAt: string;
}

// ── Payslips — OWNER/STORE_MANAGER/CASHIER only, router-level gate.

export interface PayslipLineItem {
  label: string;
  amount: number;
}

export interface PayslipPrefill {
  employeeName: string;
  employeeRole: string;
  earnings: PayslipLineItem[];
  deductions: PayslipLineItem[];
  netPay: number;
  existing: { id: string; generatedAt: string } | null;
}

export interface Payslip {
  id: string;
  userId: string;
  month: number;
  year: number;
  employeeName: string;
  employeeRole: string;
  earnings: PayslipLineItem[];
  deductions: PayslipLineItem[];
  netPay: number;
  notes: string | null;
  generatedAt: string;
  generatedBy: { id: string; name: string } | null;
  user?: { id: string; name: string; designation: string | null; role: string };
}

export interface PayslipListItem {
  id: string;
  month: number;
  year: number;
  netPay: number;
  generatedAt: string;
}

// ── Financial — OWNER/STORE_MANAGER/HR/ACCOUNTING/CASHIER only ─────────────

export interface FinancialOverview {
  revenue: { today: number; thisWeek: number; thisMonth: number; thisYear: number };
  jobs: { today: number; thisMonth: number; thisYear: number; total: number };
  outstanding: { amount: number };
}

export interface FinancialKpis {
  totalRevenue: number;
  totalJobs: number;
  activeJobs: number;
  walkInsToday: number;
  conversionRate: number;
  outstandingPayments: number;
}

export interface RevenueBreakdownItem {
  service: string;
  revenue: number;
  count: number;
}

export interface OutstandingJob {
  id: string;
  finalAmount: number | null;
  quotedAmount: number | null;
  daysSinceCreated: number;
  customer: { id: string; name: string; phone: string; whatsapp: string | null } | null;
  assignedTo: { id: string; name: string } | null;
  [key: string]: unknown;
}

export interface OutstandingResponse {
  jobs: OutstandingJob[];
  totalOutstanding: number;
}

export interface PaymentsTodayJob {
  id: string;
  finalAmount: number | null;
  updatedAt: string;
  customer: { id: string; name: string; phone: string } | null;
  assignedTo: { id: string; name: string } | null;
  [key: string]: unknown;
}

export interface PaymentsTodayResponse {
  jobs: PaymentsTodayJob[];
  totalCollected: number;
}

// Top customers + growth — added 2026-09-24 (full-parity pass). Revenue
// trend/growth are rendered as charts on the dashboard; mobile shows the
// same underlying data (month/day -> revenue) as a scrollable list
// instead of a line/bar chart — no charting library is installed here,
// and a list is a legitimate functional equivalent for this data shape,
// not a missing feature.
export interface TopCustomerEntry {
  customer: { id: string; name: string; phone: string; whatsapp: string | null; email: string | null } | null;
  invoiceCount: number;
  totalSpent: number;
}

export type CustomerSpendSlab = 'BELOW_2L' | '2L_TO_5L' | '5L_TO_10L' | 'ABOVE_10L';

export interface SlabCustomer {
  id: string;
  name: string;
  phone: string;
  vehicles: { make: string | null; model: string | null; year: number | null }[];
  totalSpent: number;
  purchasedItems: string[];
}

export interface MonthlyGrowthEntry {
  month: string;
  revenue: number;
  jobCount: number;
  growthPercent: number | null;
}

// ── Legal — gated by a per-user LegalAccessConfig row, not a role ──────────

export type LegalCaseSection = 'PERSONAL' | 'PROFESSIONAL';

export interface LegalCase {
  id: string;
  section: LegalCaseSection;
  title: string;
  status: string;
  nextHearingDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
}

export interface LegalDocument {
  id: string;
  caseId: string;
  label: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  uploadedBy: { id: string; name: string };
}

// Create/edit case + upload document — added 2026-09-24 (full-parity
// pass), same requireLegalAccess gate the read-only list already used
// (router.use(verifyToken, requireLegalAccess), backend/src/routes/
// legal_route.ts — applies to every route in the file, no exceptions).
// File *viewing* (GET /legal/documents/:documentId/file) stays out of
// scope — that's the actual sensitive-file-bytes-on-a-phone concern; case
// metadata and uploading a new document don't pull existing file content
// onto the device.
export interface CreateLegalCaseInput {
  section: 'PERSONAL' | 'PROFESSIONAL';
  title: string;
  status: string;
  nextHearingDate?: string;
  notes?: string;
}

export type UpdateLegalCaseInput = Partial<Omit<CreateLegalCaseInput, 'section'>>;

// ── Accounts — OWNER/ACCOUNTING only ───────────────────────────────────────

export interface BankAccount {
  id: string;
  nickname: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  maskedAccountNumber: string;
  ifscCode: string;
  branch: string;
  accountType: string;
  currentBalance: number;
  isActive: boolean;
  balanceUpdatedAt: string | null;
  balanceUpdatedBy: { id: string; name: string } | null;
}

// Accounts CRUD. Same canAccess=requireRoles(OWNER,ACCOUNTING) gate as the
// read-only list this extends.
export type BankAccountType = 'SAVINGS' | 'CURRENT' | 'OD';

export interface BankAccountRevealLog {
  id: string;
  accountId: string;
  revealedBy: { id: string; name: string };
  createdAt: string;
}

export interface BankBalanceHistoryEntry {
  id: string;
  accountId: string;
  balance: number;
  updatedBy: { id: string; name: string };
  createdAt: string;
}

export interface EmailCheckLogEntry {
  id: string;
  userId: string;
  date: string;
  checkedAt: string;
}

export interface EmailCheckState {
  checkedToday: boolean;
  todayLog: EmailCheckLogEntry | null;
  history: EmailCheckLogEntry[];
}

export interface CreateBankAccountInput {
  nickname: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  accountType: BankAccountType;
  currentBalance?: number;
}

export type UpdateBankAccountInput = Partial<CreateBankAccountInput>;

// Document upload — added 2026-09-24, closing the gap flagged above.
// Same shape for bank-account docs and EMI docs (backend/src/routes/
// accounts_route.ts): private Azure storage, streamed back through an
// authenticated route, no public `url`.
export interface AccountDocument {
  id: string;
  label: string | null;
  filename: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: { id: string; name: string };
  createdAt: string;
}

export type EMIStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface EMI {
  id: string;
  lenderName: string;
  loanPurpose: string;
  description: string | null;
  emiAmount: number;
  debitDay: number;
  bankAccountId: string | null;
  bankAccount: { id: string; nickname: string; bankName: string } | null;
  totalTenure: number;
  emisPaid: number;
  remainingBalance: number;
  interestRate: number | null;
  startDate: string | null;
  principalAmount: number | null;
  endDate: string | null;
  notes: string | null;
  status: EMIStatus;
}

export interface CreateEMIInput {
  lenderName: string;
  loanPurpose: string;
  emiAmount: number;
  debitDay: number;
  totalTenure: number;
  remainingBalance: number;
  bankAccountId?: string;
  interestRate?: number;
  startDate?: string;
  principalAmount?: number;
  notes?: string;
}

export type PaymentReminderCategory =
  | 'ELECTRICITY' | 'RENT' | 'INTERNET' | 'INSURANCE' | 'LICENSE'
  | 'SUBSCRIPTION' | 'VENDOR_DUE' | 'TAX' | 'SALARY' | 'OTHER';
export type PaymentRecurrence = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ONE_OFF';
export type PaymentReminderStatus = 'PENDING' | 'PAID' | 'OVERDUE';

export interface PaymentReminder {
  id: string;
  payeeName: string;
  category: PaymentReminderCategory;
  amount: number | null;
  isAmountFixed: boolean;
  dueDate: string;
  recurrence: PaymentRecurrence;
  bankAccount: { id: string; nickname: string; bankName: string } | null;
  status: PaymentReminderStatus;
  datePaid: string | null;
  notes: string | null;
  isActive: boolean;
  isOverdue: boolean;
  isDue: boolean;
  isUpcoming: boolean;
}

export interface CreatePaymentReminderInput {
  payeeName: string;
  category: PaymentReminderCategory;
  dueDate: string;
  recurrence: PaymentRecurrence;
  amount?: number;
  isAmountFixed?: boolean;
  bankAccountId?: string;
  notes?: string;
}

// ── Work-docs — vendor/customer-interaction notes attached to a Timesheet
// day, each with its own file attachments. BLOCKED_ROLES=[TECHNICIAN,STAFF]
// deny the whole router; else MANAGER_ROLES=[OWNER,STORE_MANAGER] or the
// note's own creator may view/edit/upload.
export type WorkDocType = 'VENDOR' | 'CUSTOMER_INTERACTION';

export interface WorkDocumentationFile {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  fileSize: number;
}

export interface WorkDocQuote {
  id: string;
  amount: number;
  sortOrder: number;
}

export interface WorkDocReply {
  id: string;
  authorId: string;
  message: string;
  author: { id: string; name: string };
  createdAt: string;
}

export interface WorkDocumentation {
  id: string;
  timesheetId: string;
  type: WorkDocType;
  description: string;
  vendorName: string | null;
  contactPhone: string | null;
  quotedPrice: number | null;
  finalPrice: number | null;
  createdById: string;
  createdBy: { id: string; name: string };
  customer: { id: string; name: string; phone: string } | null;
  jobCard: { id: string; jobNumber: string; vehicleNumber: string; reasonForVisit: string } | null;
  quotes: WorkDocQuote[];
  replies: WorkDocReply[];
  files: WorkDocumentationFile[];
  createdAt: string;
}

// ── Timesheets Register — GET /timesheets/register, manager-only grid ──────
export interface TimesheetRegisterCell {
  id: string;
  status: TimesheetStatus;
  totalHours: number;
}

export interface TimesheetRegisterEmployee {
  id: string;
  name: string;
  role: string;
  timesheets: Record<string, TimesheetRegisterCell>;
}

export interface TimesheetRegister {
  dates: string[];
  employees: TimesheetRegisterEmployee[];
}

// ── Loans (Finance Approvals) — GET/POST /loans, ADMIN_ROLES=[OWNER,
// STORE_MANAGER,CASHIER] to list/create; approve/reject narrower
// [OWNER,STORE_MANAGER] with a self-approval / peer-STORE_MANAGER block
// enforced server-side (backend/src/routes/loans.ts). Advances are a
// separate, deliberately unbuilt product surface — not represented here.
export interface Loan extends LoanOrAdvance {
  rejectionReason: string | null;
  user: { id: string; name: string; role: string; designation: string | null };
  approvedBy: { id: string; name: string } | null;
}

// ── Staff Config — shift/attendance defaults + salary, separate Prisma
// model from User/Employees. ADMIN_ROLES=[OWNER,STORE_MANAGER] for most
// routes; PUT /:userId/salary additionally allows CASHIER
// (backend/src/routes/staffConfig.ts).
export interface ShiftConfig {
  userId: string;
  customClockIn: string | null;
  customClockOut: string | null;
  workingDaysPerMonth: number | null;
  defaultLeaves: number | null;
}

export interface SalaryHistoryEntry {
  id: string;
  userId: string;
  oldSalary: number | null;
  newSalary: number;
  effectiveFrom: string;
  changedBy: { id: string; name: string };
  createdAt?: string;
}

// ── My Attendance (full module) — GET /attendance/late-records and
// /attendance/warnings are self-or-manager scoped via verifyToken alone (no
// role gate), backend/src/routes/attendance.ts, verified 2026-09-20. Do NOT
// build any edit/override/pardon action here — /attendance/register and the
// related edit-log endpoints reference (prisma as any).attendanceEditLog,
// a Prisma model that does not exist in schema.prisma and will 500.
export interface WarningRecord {
  id: string;
  userId: string;
  reason: string;
  issuedAt: string;
  month: number;
  year: number;
  source: string;
}

// ── Quotations — GET/POST /quotations, backend/src/routes/quotationRoutes.ts.
// Built 2026-09-23, read-only + cancel (matches the invoices.tsx precedent:
// document-CRUD screens with a line-item wizard on the dashboard stay
// read-only on mobile; the create/edit wizard itself is not replicated
// here). List/detail: ADMIN_ROLES=[OWNER,STORE_MANAGER,ACCOUNTING] see all,
// everyone else sees only their own created quotations, or nothing without
// an explicit per-employee 'quotations' permission override. Cancel
// (PATCH /:id/cancel, sets status to REJECTED) is ADMIN_ROLES-only.
export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface QuotationListItem {
  id: string;
  quotationNumber: string;
  quotationDate: string;
  validUntil: string | null;
  customerName: string;
  customerPhone: string | null;
  vehicleNumber: string | null;
  grandTotal: number;
  status: QuotationStatus;
  createdAt: string;
  createdBy: { id: string; name: string; username: string };
}

// customerEmail/Address/GSTIN and vehicle brand/model/year/colour — these
// scalar fields are already present on the raw GET /quotations/:id
// response (no `select` on that route, verified by reading it), just
// never declared here or editable until 2026-09-24.

export interface QuotationLineItem {
  id: number;
  description: string;
  hsnSacCode: string | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  discountAmount: number;
  discountMode: string;
  amount: number;
}

export interface QuotationDetail extends QuotationListItem {
  subtotal: number;
  discountAmount: number;
  overallDiscountAmount: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  gstRate: number;
  notes: string | null;
  termsConditions: string | null;
  lineItems: QuotationLineItem[];
  customerEmail: string | null;
  customerAddress: string | null;
  customerGSTIN: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;
  vehicleColour: string | null;
}

// POST/PUT /quotations — create/edit added 2026-09-23 (scope update: full
// dashboard parity). Same calculateAmounts() server-side computation as
// invoices — the client sends raw line items, never a precomputed total,
// so this mirrors CreateInvoiceInput's shape deliberately. Job-card/CRM
// linking and per-line GST rates (the inventory-item-picker wizard's
// manualAmounts path) are out of scope, same cut already made for
// invoices' create form.
export interface QuotationLineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  discountMode?: 'PERCENT' | 'FIXED';
}

export interface CreateQuotationInput {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerGSTIN?: string;
  vehicleNumber?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleColour?: string;
  lineItems: QuotationLineItemInput[];
  gstRate?: number;
  notes?: string;
  termsConditions?: string;
  validUntil?: string;
}

export type UpdateQuotationInput = Partial<CreateQuotationInput> & { status?: QuotationStatus };

// GET /notifications (backend/src/routes/notifications.ts) — page-based, not cursor-based.
// `metadata.link` is a dashboard web path (e.g. '/dashboard/my-tasks'), when the row has a target.
export interface AppNotification {
  id: string;
  userId: string | null;
  type: string;
  message: string;
  isRead: boolean;
  metadata: { link?: string; [key: string]: unknown } | null;
  createdAt: string;
}

export interface NotificationListPage extends PaginatedResponse<AppNotification> {
  totalPages: number;
}

// HR analytics (backend/src/routes/analytics.ts) — both endpoints are
// read-only aggregates computed at request time.
export interface HiringAnalytics {
  totalApplications: number;
  totalHired: number;
  totalRejected: number;
  // Percent (one decimal); null when there are no applications.
  rejectionRate: number | null;
  // null when no application has been converted yet; see timeToHireSampleSize.
  avgTimeToHireDays: number | null;
  timeToHireSampleSize: number;
  // Which AI stages ran before each rejected application — there is no
  // stage-at-rejection history, so this is the closest signal available.
  stagesCompletedBeforeRejection: {
    NONE: number;
    SCREENED_ONLY: number;
    INTERVIEWED: number;
    ASSESSED: number;
  };
  // Sorted by avgScore desc; avgScore is null when every scorecard for the
  // role was flagged (nothing to average).
  avgScoreByRole: { role: string; avgScore: number | null; scoredCount: number; flaggedCount: number }[];
}

export interface RetentionAnalytics {
  activeCount: number;
  departedTrackedCount: number;
  // Past deactivations with no departure date — counted separately, never as 0.
  departedNoDataCount: number;
  avgTenureDays: number | null;
  tenureSampleSize: number;
  earliestTrackedDeparture: string | null;
  reasonBreakdown: { reason: string; count: number }[];
}

// Role competency templates (backend/src/routes/competencyTemplates.ts,
// TEMPLATE_SELECT). The list returns one row per role — the current version.
export type CompetencyTemplateStatus = 'DRAFT' | 'APPROVED';
export type CompetencyCategory = 'WORKSHOP' | 'CUSTOMER_SALES' | 'OFFICE_ADMIN' | 'TECH_IT';

export interface RoleCompetency {
  id: string;
  name: string;
  description: string | null;
  weightage: number;
  sortOrder: number;
  whatToAssess: string | null;
  ratingGuide: string | null;
}

export interface CompetencyTemplate {
  id: string;
  roleName: string;
  version: number;
  isCurrent: boolean;
  status: CompetencyTemplateStatus;
  source: 'MANUAL' | 'AI_SUGGESTED';
  // Non-null = the whole role (every version) is archived.
  archivedAt: string | null;
  category: CompetencyCategory | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string } | null;
  updatedBy: { id: string; name: string } | null;
  competencies: RoleCompetency[];
}

// GET /competency-templates adds these two; GET /:id and the lifecycle
// responses don't carry them.
export interface CompetencyTemplateListItem extends CompetencyTemplate {
  // Distinct applications that used any version of this role's template.
  usageCount: number;
  // What to badge: a DRAFT current row whose role still has a live APPROVED
  // version reads APPROVED (the role is still hireable).
  liveStatus: CompetencyTemplateStatus;
}

// One competency as sent to POST / and PATCH /:id (validateCompetencies in
// competencyTemplates.ts): name required, weightage an integer 0-100, and every
// weightage in a template must add up to exactly 100.
export interface CompetencyInput {
  name: string;
  weightage: number;
  description?: string;
  whatToAssess?: string;
  ratingGuide?: string;
}

export interface CreateCompetencyTemplateInput {
  roleName: string;
  category: CompetencyCategory;
  competencies: CompetencyInput[];
}

// POST /suggest and POST /:id/regenerate — AI calls; category is required by
// both, description is optional context (never stored).
export interface SuggestCompetencyTemplateInput {
  roleName: string;
  category: CompetencyCategory;
  description?: string;
}

export interface RegenerateCompetencyTemplateInput {
  category: CompetencyCategory;
  description?: string;
}

// HR report exports (backend/src/routes/hrReports.ts).
export type HrReportKind = 'hiring' | 'onboarding' | 'attendance' | 'discipline';
export type HrReportFormat = 'pdf' | 'excel';

// Password Manager (backend/src/routes/passwords.ts + cards.ts). Both routers
// are requireRoles(OWNER, STORE_MANAGER, INVENTORY_MANAGER). The list endpoints
// return secrets MASKED — `password` is always '••••••••', `cardNumber` is
// '**** **** **** 1234' and `cvv` is '•••'; the real values come only from the
// /reveal* endpoints.
export interface SecretAddedBy {
  id: string;
  name: string;
  role: string;
}

export interface PasswordEntry {
  id: string;
  title: string;
  category: string;
  url: string | null;
  username: string;
  password: string;
  notes: string | null;
  addedById: string;
  addedBy: SecretAddedBy;
  createdAt: string;
  updatedAt: string;
}

export type CardType = 'CREDIT' | 'DEBIT';

export interface CardEntry {
  id: string;
  label: string;
  cardType: CardType;
  bankName: string;
  cardholderName: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
  billingAddress: string | null;
  notes: string | null;
  addedById: string;
  addedBy: SecretAddedBy;
  createdAt: string;
  updatedAt: string;
}

// POST bodies. On update every field is optional; password / cardNumber / cvv
// are only changed when a non-empty value is sent.
export interface PasswordEntryInput {
  title: string;
  category: string;
  url?: string;
  username: string;
  password?: string;
  notes?: string;
}

export interface CardEntryInput {
  label: string;
  cardType: CardType;
  bankName: string;
  cardholderName: string;
  cardNumber?: string;
  expiry: string;
  cvv?: string;
  billingAddress?: string;
  notes?: string;
}

// Meta Ads (backend/src/routes/ads.ts + adLeads.ts). Every endpoint sits behind
// requireAdsAccess (OWNER, or an explicit `ads` grant). Windows are `days`
// counted in IST, capped at 90 by the server. Totals come from the server-side
// aggregates; nothing here is summed from the (paged) lead rows.
export interface AdsDayRow {
  date: string; // YYYY-MM-DD, IST
  leads: number;
  paid: number;
  organic: number;
  premium: number;
  waiting: number;
  spend: number;
  impressions: number;
  clicks: number;
  costPerLead: number | null;
}

// GET /ads/running rows. `comparable` false = the ad's spend predates lead
// capture, so its leads / costPerLead are null and must not be shown as 0.
export interface AdsRunningRow {
  adId: string | null;
  adName: string | null;
  campaignName: string | null;
  adsetName: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  firstDay: string | null;
  lastDay: string | null;
  comparable: boolean;
  leads: number | null;
  costPerLead: number | null;
}

export interface AdsRunningResponse {
  leadsSince: string | null;
  rows: AdsRunningRow[];
}

// A row of ad_leads as GET /ads/lead-list returns it (the fields the page uses).
export interface AdLead {
  id: string;
  name: string | null;
  vehicle: string | null;
  service: string | null;
  location: string | null;
  tier: string; // premium | mid | low | unknown
  stage: string;
  isPaid: boolean;
  adHeadline: string | null;
  seenAt: string | null;
  seenBy: string | null;
  responseSec: number | null;
  remark: string | null;
  remarkAt: string | null;
  arrivedAt: string;
}

export interface AdLeadListResponse {
  rows: AdLead[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

// Server-side filters for /ads/lead-list (only set when active).
export interface AdLeadFilters {
  tier?: string; // comma list, e.g. 'premium,mid'
  paid?: '1' | '0';
  owner?: string; // a team member, or 'none' for not accepted
  vehicle?: string;
  adId?: string;
  date?: string; // YYYY-MM-DD (IST day) — overrides days
  waiting?: '1';
}

export interface AdsOwnerRow {
  name: string;
  leads: number;
  medianSec: number | null;
}

export interface AdsFollowThrough {
  days: number;
  total: number;
  accepted: number;
  notAccepted: number;
  remarks: number;
  acceptedNoRemark: number;
  underTwoMin: number;
  medianResponseSec: number | null;
  owners: AdsOwnerRow[];
  tiers: { tier: string; leads: number }[];
  vehicles: { vehicle: string; leads: number }[];
}

// POST /ads/refresh — spend + leads + ownership in one call, 60s cooldown.
export interface AdsRefreshResult {
  spendRows: number;
  spendOk: boolean;
  newLeads: number;
  ownersUpdated: number;
  failed: string[];
}

// Role-specific onboarding task templates (backend/src/routes/
// onboardingTaskTemplates.ts, TEMPLATE_SELECT). One row per role; edits mutate
// in place (no versions) and roleName is immutable after creation.
export interface OnboardingTemplateTask {
  id: string;
  label: string;
  description: string | null;
  responsible: string | null;
  sortOrder: number;
}

export interface OnboardingTemplate {
  id: string;
  roleName: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
  updatedBy: { id: string; name: string } | null;
  tasks: OnboardingTemplateTask[];
}

// A task as sent to POST / and PATCH /:id (validateTasks): label required,
// description / responsible optional.
export interface OnboardingTaskInput {
  label: string;
  description?: string;
  responsible?: string;
}

// POST /suggest returns drafted tasks and writes NOTHING — only an explicit
// Save (POST / or PATCH /:id) persists, which is the approval step.
export interface SuggestedOnboardingTask {
  label: string;
  description: string;
  responsible: string;
}

// Audit Trail. Two read-only logs, both HR/Owner-gated (requireHROrOwner =
// OWNER/STORE_MANAGER/HR/ACCOUNTING), newest first, capped at 200 rows.
// GET /identity-documents/views — the Document Access Log (every file view /
// value reveal on an identity document). `action` is VIEW_FILE | REVEAL_VALUE.
export interface DocumentAccessEntry {
  id: string;
  action: string;
  createdAt: string;
  viewedBy: { id: string; name: string };
  document: {
    id: string;
    type: string;
    label: string | null;
    user: { id: string; name: string; employeeId: string | null };
  };
}

export interface DocumentAccessParams {
  employeeId?: string;
  from?: string; // YYYY-MM-DD, IST day start
  to?: string; // YYYY-MM-DD, IST day end
  action?: string;
}

// GET /action-log — HR decisions merged from every source model.
export interface ActionLogEntry {
  id: string;
  actionType: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  subjectId: string | null;
  subjectName: string | null;
  subjectEmployeeId: string | null;
  detail: string;
}

export interface ActionLogParams {
  employeeId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  actionType?: string; // one of the backend's ACTION_TYPES
}

// GET /reports/daily?date=YYYY-MM-DD (backend/src/routes/reports.ts) — the
// dashboard Overview's "Daily Breakdown". jobs.list is passed through
// untouched by the dashboard too, so it stays loosely typed.
export interface DailyReportInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  vehicleNumber?: string | null;
  grandTotal: number;
  paidAmount: number;
  balanceDue: number;
  status: string;
  createdBy?: string;
  createdAt: string;
}

export interface DailyReport {
  date: string;
  revenue: { collected: number; invoiced: number; invoiceCount: number };
  jobs: { total: number; byStatus: Record<string, number>; list: unknown[] };
  customers: { new: number; returning: number; total: number };
  employees: { name: string; employeeId: string | null; jobs: number; invoicedTotal: number; collectedTotal: number }[];
  invoices: { count: number; list: DailyReportInvoice[] };
  attendance: { present: number; late: number; absent: number; total: number };
}

// GET /reports/customer-stats?fromDate=&toDate= — "Customer & Walkout Stats".
export interface CustomerStatsReport {
  fromDate: string;
  toDate: string;
  jobs: { total: number };
  customers: { total: number; new: number; returning: number };
  walkouts: {
    total: number;
    byEmployee: { name: string; employeeId: string | null; walkouts: number; totalJobs: number; walkoutRate: number }[];
  };
}

// ── Customers & Jobs (dashboard customers/page.tsx parity) ───────────────────
export type BoardStage = 'CREATED' | 'QUOTED' | 'HANDED_OVER' | 'COLLECTED' | 'WALKED_OUT';

export interface CjJobInvoice {
  id: string;
  invoiceNumber: string;
  grandTotal: number;
  balanceDue?: number;
  status: string;
}

// GET /job-cards/active and GET /job-cards/board (raw JSON arrays).
export interface CjJobCard {
  id: string;
  jobNumber: string;
  vehicleNumber: string;
  reasonForVisit: string;
  status: JobCardStatus;
  createdAt: string;
  invoiceId?: string | null;
  invoice?: CjJobInvoice | null;
  walkoutReason?: string | null;
  walkoutNote?: string | null;
  customerRole?: 'OWNER' | 'DRIVER' | null;
  customer: { id: string; name: string; phone: string };
  vehicle?: { id: string; vehicleNumber: string; make?: string | null; model?: string | null } | null;
  handledBy: { id: string; name: string; role?: string };
  mediaCount?: number;
  boardStage: BoardStage;
  boardWalkoutReason?: string | null;
  boardWalkoutRemarks?: string | null;
}

// GET /employees/handled-by — any logged-in user.
export interface HandledByEmployee {
  id: string;
  name: string;
  role: string;
}

// GET /crm/customers (paged, searchBy name|phone|vehicleNumber|vehicleModel).
export type CrmSearchBy = 'name' | 'phone' | 'vehicleNumber' | 'vehicleModel';

export interface CrmCustomerRow {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  source?: string | null;
  isRegular: boolean;
  visitCount: number;
  isActive: boolean;
  createdAt: string;
  totalSpent?: number;
  invoiceCount?: number;
  vehicles: { id: string; vehicleNumber: string; make?: string | null; model?: string | null; isActive: boolean }[];
  crmInvoices: { id: string; invoiceNumber: string; grandTotal: number; paidAmount?: number; status: string; createdAt: string }[];
}

export interface CrmCustomerPage {
  customers: CrmCustomerRow[];
  total: number;
}

export interface CrmVisitJobCard {
  id: string;
  jobNumber: string;
  vehicleNumber: string;
  reasonForVisit: string;
  status: JobCardStatus;
  createdAt: string;
  invoiceId?: string | null;
  walkoutReason?: string | null;
  walkoutNote?: string | null;
  estimatedTotal?: number | null;
  handledBy: { id: string; name: string; designation?: string | null };
  vehicle?: { vehicleNumber: string; make?: string | null; model?: string | null; year?: string | null } | null;
  invoice?: { id: string; invoiceNumber: string; grandTotal: number; paidAmount: number; balanceDue: number; status: string } | null;
}

export interface CrmInteraction {
  id: string;
  description: string;
  createdAt: string;
  createdBy: { id: string; name: string };
  jobCard?: { id: string; jobNumber: string; vehicleNumber: string; reasonForVisit: string } | null;
  quotes: { amount: string; sortOrder: number }[];
}

// GET /crm/customers/:id — only the parts the panel reads.
export interface CrmCustomerDetail {
  jobCards: CrmVisitJobCard[];
  interactions: CrmInteraction[];
}

// ── Team page (dashboard employees/page.tsx) ─────────────────────────────────
// GET /employees returns more than EmployeeListItem declares: the card shows
// branch and monthly salary, and the edit sheet pre-fills the rest. salary
// fields are stripped server-side for callers who aren't salary-authorized.
export interface EmployeeCardItem {
  id: string;
  name: string;
  username: string;
  role: string;
  phone: string | null;
  designation: string | null;
  isActive: boolean;
  monthlySalary?: number | null;
  salaryType?: string | null;
  joiningDate?: string | null;
  deviceUserId?: string | null;
  email?: string | null;
  branch?: string | null;
  personalEmail?: string | null;
}

// ── Employee detail panel, Overview tab (dashboard EmployeeDetailPanel) ─────
// GET /employees/:id/analytics (nested shape; the panel flattens it).
export interface EmployeeAnalyticsRaw {
  jobs?: { thisMonth?: number };
  financial?: { revenueGenerated?: number; averageDealSize?: number };
  performance?: { conversionRate?: number; walkOutRate?: number; mostCommonService?: string | null };
  attendance?: { present?: number; late?: number; absent?: number; halfDay?: number };
}

// GET /employees/:id/performance-chart — last six months.
export interface EmployeePerformancePoint {
  month: string;
  label: string;
  jobCount: number;
  revenue: number;
}

// GET /attendance/punches — "interpretation" says which scan counted as the clock-in/out.
export interface EmployeePunch {
  id: string;
  direction: string;
  time: string;
  interpretation?: 'CLOCK_IN' | 'CLOCK_OUT' | 'IGNORED';
}

// ── Applications page (dashboard applications/page.tsx) ─────────────────────
// The list endpoint returns more than Application declares; these are the
// extra fields the dashboard's row and detail view read.
export interface ApplicationQuestionAnswers {
  whyJoin?: string;
  experience?: string;
  expectedSalary?: string;
  noticePeriod?: string;
  preferredLocation?: string;
  skills?: string;
  additionalInfo?: string;
}

export interface ApplicationRowExtras extends ApplicationPhase2Extras {
  hasAadhaar?: boolean;
  aadhaarSelfDeclared?: boolean;
  aadhaarSelfDeclaredAt?: string | null;
  candidateQuestionAnswers?: ApplicationQuestionAnswers | null;
  convertedUser?: { onboardingStatus?: string | null; _count: { onboardingInvitesReceived: number } } | null;
  aiInterviewCompletedAt?: string | null;
  aiAssignmentCompletedAt?: string | null;
}

export type ApplicationRowData = Application & ApplicationRowExtras;

/** Fields the New / Edit Application form sends (dashboard ApplicationFormFields). */
export interface ApplicationFormInput {
  name: string;
  email?: string;
  phone?: string;
  roleApplied: string;
  department?: string;
  notes?: string;
  dateOfBirth?: string;
  currentAddress?: string;
  permanentAddress?: string;
  fresher: boolean;
}

/** POST /applications/:id/status-email */
export interface ApplicationStatusEmailResult {
  emailSent: boolean;
  sentTo: string | null;
  hasEmail?: boolean;
}

// ── Applications Phase 2 (dashboard applications/page.tsx panels) ───────────
export interface CompetencyScoreEntry {
  competencyId: string;
  name: string;
  weightage: number;
  score: number;
  rationale?: string;
  /** ARIA only: false when the interview ended before this competency was reached. */
  covered?: boolean;
  /** ARIA only: false when every reply was a non-answer. */
  answered?: boolean;
}

// Interview / assignment scorecard (backend lib/aiInterview.ts, ariaInterview.ts, aiAssignment.ts).
export interface AiFullScorecard {
  competencyScores: CompetencyScoreEntry[];
  weightedOverallScore: number;
  /** ARIA only. 0 means "Not enough data". */
  answeredCount?: number;
  totalCompetencies?: number;
  flaggedForReview: boolean;
  flagReason: string | null;
  modelUsed: string;
}

export interface AriaTranscriptTurn {
  turnIndex: number;
  role: 'aria' | 'candidate';
  kind: 'intro' | 'question' | 'followup' | 'reprompt' | 'closing' | 'answer';
  text: string;
  competencyId?: string;
  isEmpty?: boolean;
  isRepeatRequest?: boolean;
  isSkip?: boolean;
  isNonAnswer?: boolean;
  sttConfidence?: number;
  answerAudioBlobName?: string;
  timestamp: string;
}

export interface AriaProctoringEvent {
  type: 'VIOLATION' | 'COPY_ATTEMPT' | 'PASTE_ATTEMPT';
  reason?: string;
  at: string;
}

// One INTERVIEW-type invite (an Aria session), most recent first on Application.interviewInvites.
export interface AiInterviewInviteFull {
  id: string;
  engine: 'LEGACY' | 'ARIA';
  transcript: AriaTranscriptTurn[] | null;
  status: 'PENDING' | 'USED' | 'REVOKED' | 'EXPIRED';
  terminationReason: string | null;
  createdAt: string;
  usedAt: string | null;
  proctoringEvents: AriaProctoringEvent[] | null;
  scorecard: AiFullScorecard | null;
  cameraRecordingBlobName?: string | null;
  screenRecordingBlobName?: string | null;
}

export interface CandidateActivity {
  tabSwitches?: { leftAt: string; returnedAt?: string }[];
  largePastes?: { competencyId: string; chars: number; at: string }[];
  autoSubmitted?: boolean;
}

export interface CompetencyTaskItem {
  competencyId: string;
  competencyName: string;
}

export interface ApplicationPhase2Extras {
  interviewInvites?: AiInterviewInviteFull[];
  aiInterviewScorecard?: AiFullScorecard | null;
  aiAssignmentScorecard?: AiFullScorecard | null;
  aiInterviewActivity?: CandidateActivity | null;
  aiAssignmentActivity?: CandidateActivity | null;
  aiInterviewQuestions?: CompetencyTaskItem[] | null;
  aiAssignmentTasks?: CompetencyTaskItem[] | null;
  hasDraftQuestions?: boolean;
  hasSentAssessmentInvite?: boolean;
}

export interface PracticalScorecard {
  questionScores: { questionId: string; questionText: string; score: number; rationale: string }[];
  overallScore: number;
  flaggedForReview: boolean;
  flagReason: string | null;
  modelUsed: string;
}

// GET /:id/practical-questions in full: questions + the AI scorecard + sent-assessment recordings.
export interface PracticalQuestionsFull {
  questions: PracticalQuestion[];
  scorecard: PracticalScorecard | null;
  recordings?: { id: string; createdAt: string; usedAt: string | null }[];
}

// GET /applications/compare rows with the full scorecards the compare table breaks down.
export interface CompareCandidateFull {
  id: string;
  name: string;
  status: ApplicationStatus;
  aiScreeningResult: AiScreeningResult | null;
  aiScreenedAt: string | null;
  aiInterviewScorecard: AiFullScorecard | null;
  aiInterviewCompletedAt: string | null;
  aiAssignmentScorecard: AiFullScorecard | null;
  aiAssignmentCompletedAt: string | null;
  createdAt: string;
  interviewInvites: { engine: 'LEGACY' | 'ARIA'; status: string; terminationReason: string | null; proctoringEvents: AriaProctoringEvent[] | null; createdAt: string }[];
}

export interface HrChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Onboarding page (dashboard onboarding/page.tsx): Overview, Letters, candidates ──
export type OnboardingStatus = 'INVITED' | 'IN_PROGRESS' | 'SUBMITTED' | 'HR_REVIEW' | 'APPROVED' | 'REJECTED';
export type HRLetterType = 'OFFER' | 'EXPERIENCE' | 'RELIEVING' | 'LETTER_OF_INTENT' | 'LETTER_OF_ONBOARDING';

// GET /employees rows as the Letters picker reads them (same endpoint as EmployeeListItem).
export interface OnboardingEmployee {
  id: string;
  name: string;
  employeeId: string | null;
  role: string;
  isActive: boolean;
  designation?: string | null;
  joiningDate?: string | null;
  department?: string | null;
  address?: string | null;
  phone?: string | null;
  personalPhone?: string | null;
  emergencyContactPhone?: string | null;
}

export interface Candidate {
  id: string;
  name: string;
  personalEmail?: string | null;
  personalPhone?: string | null;
  department?: string | null;
  address?: string | null;
  emergencyContactPhone?: string | null;
  onboardingStatus: OnboardingStatus;
  isActive: boolean;
  createdAt: string;
  daysSinceInvited?: number | null;
  overdue?: boolean;
}

export type CandidateOverviewMetric = 'inPipeline' | 'pendingVerification' | 'rejectedAwaitingReupload' | 'overdue';

export interface CandidateOverviewCounts {
  inPipeline: number;
  pendingVerification: number;
  rejectedAwaitingReupload: number;
  overdue: number;
}

export interface CandidateOverviewListItem {
  id: string;
  name: string;
  personalEmail: string | null;
  personalPhone: string | null;
  onboardingStatus: OnboardingStatus;
  createdAt: string;
  daysWaiting: number | null;
  waitingOn: 'candidate' | 'hr';
  rejectedDocuments: string[];
}

export interface IssuedLetterSummary {
  id: string;
  userId: string;
  type: HRLetterType;
  issuedAt: string;
  user: { id: string; name: string; employeeId: string | null };
  issuedBy: { id: string; name: string };
}

export interface HRLetter {
  id: string;
  userId: string;
  type: HRLetterType;
  issuedAt: string;
  issuedBy: { id: string; name: string };
  letterInvite?: { inviteLink: string; expiresAt: string; emailSent: boolean } | null;
}

export type OnboardingInviteStatus = 'PENDING' | 'USED' | 'REVOKED' | 'EXPIRED';

export interface OnboardingInviteStatusInfo {
  id: string;
  status: OnboardingInviteStatus;
  expiresAt: string;
  createdAt: string;
  usedAt?: string | null;
}

export interface OnboardingInviteResult {
  inviteLink: string;
  expiresAt: string;
  emailSent: boolean;
  sentTo: string | null;
  hasEmail: boolean;
}

// Pre-Joining Terms: only what the Letters prefill reads.
export interface PreJoiningTermsLite {
  status: string;
  monthlySalary?: number | null;
  employmentType?: string | null;
  jobLocation?: string | null;
  dateOfJoining?: string | null;
  probationMonths?: number | null;
}

export type ProbationMilestone = 'DAY_7' | 'DAY_30' | 'DAY_60' | 'DAY_90';
export type ProbationCheckInStatus = 'OVERDUE' | 'DUE_SOON' | 'COMPLETED' | 'NOT_YET_DUE';

export interface ProbationCheckIn {
  userId: string;
  employee: { id: string; name: string; employeeId?: string | null; designation?: string | null };
  reportingManager?: { id: string; name: string } | null;
  milestone: ProbationMilestone;
  dueDate: string;
  status: ProbationCheckInStatus;
}

// ── Onboarding Phase 2: Employment, Pre-Joining Terms, Documents, Discipline, Check-ins ──
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
export type EmploymentStatus = 'PROBATION' | 'CONFIRMED' | 'NOTICE_PERIOD' | 'EXITED';

export interface EducationEntry {
  qualification: string;
  institution: string;
  yearOfPassing: number;
  score?: string;
}

export interface WorkExperienceEntry {
  company: string;
  designation: string;
  /** YYYY-MM */
  fromDate: string;
  /** YYYY-MM; absent = still working there */
  toDate?: string;
  reasonForLeaving?: string;
}

// GET /hr/employment/:userId
export interface EmploymentDetails {
  id: string;
  designation?: string | null;
  department?: string | null;
  branch?: string | null;
  joiningDate?: string | null;
  employmentType?: EmploymentType | null;
  employmentStatus?: EmploymentStatus | null;
  probationEndDate?: string | null;
  reportingManagerId?: string | null;
  coreResponsibilities?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelationship?: string | null;
  emergencyContactPhone?: string | null;
  educationDetails?: EducationEntry[] | null;
  workExperience?: WorkExperienceEntry[] | null;
  passportPlaceOfIssue?: string | null;
  passportExpiryDate?: string | null;
}

export interface EmploymentUpdate {
  designation: string | null;
  department: string | null;
  branch: string | null;
  joiningDate: string | null;
  employmentType: EmploymentType | null;
  employmentStatus: EmploymentStatus | null;
  probationEndDate: string | null;
  reportingManagerId: string | null;
  coreResponsibilities: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
}

export type PreJoiningTermsStatus = 'DRAFT' | 'APPROVED';

export interface PreJoiningTerms {
  id: string;
  userId: string;
  status: PreJoiningTermsStatus;
  monthlySalary?: number | null;
  salaryType?: string | null;
  employmentType?: EmploymentType | null;
  jobLocation?: string | null;
  dateOfJoining?: string | null;
  probationMonths?: number | null;
  workingHours?: string | null;
  roster?: string | null;
  approvedBy?: { id: string; name: string } | null;
  approvedAt?: string | null;
}

export interface PreJoiningTermsInput {
  monthlySalary: string | null;
  salaryType: string | null;
  employmentType: EmploymentType | null;
  jobLocation: string | null;
  dateOfJoining: string | null;
  probationMonths: string | null;
  workingHours: string | null;
  roster: string | null;
}

export type IdentityDocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

// GET /identity-documents/:userId and the cross-employee queue (HR view).
export interface OnboardingDocument {
  id: string;
  type: IdentityDocType;
  label?: string | null;
  filename?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  createdAt: string;
  status: IdentityDocumentStatus;
  verifiedAt?: string | null;
  rejectionReason?: string | null;
  hasValue: boolean;
  maskedValue?: string | null;
  bankIfsc?: string | null;
  bankBranch?: string | null;
  uploadedBy: { id: string; name: string };
  verifiedBy?: { id: string; name: string } | null;
  user?: { id: string; name: string; employeeId?: string | null; designation?: string | null };
}

export interface CandidateVerificationQueueItem extends Candidate {
  documentsSummary: { required: number; verified: number; pending: number; missing: number; rejectedTypes: string[] };
  daysSinceStatusChange: number;
}

export type DisciplineRecordType = 'WARNING' | 'POLICY_ACKNOWLEDGEMENT' | 'DISCIPLINARY_ACTION' | 'OTHER';

export interface DisciplineRecord {
  id: string;
  type: DisciplineRecordType;
  description: string;
  date: string;
  issuedBy: { id: string; name: string };
}

export interface ProbationCheckInDetail extends ProbationCheckIn {
  rating?: number | null;
  notes?: string | null;
  completedAt?: string | null;
}

// ── Tasks page: Daily Tasks with proof (dashboard my-tasks) ──
export type RecurringTaskProof = 'NONE' | 'PHOTO' | 'NOTE_PHOTO';

// GET /recurring-tasks/my-current rows carry the proof requirement too (lifted
// from the definition by the API).
export interface DailyTaskCompletion extends RecurringTaskCompletion {
  definition: RecurringTaskCompletion['definition'] & { proof?: RecurringTaskProof; proofLabel?: string | null };
  proof?: RecurringTaskProof;
  proofLabel?: string | null;
}

// ── Purchase page (dashboard accounting/page.tsx): ledger detail rows ──
export interface PurchaseVoucherItemRow {
  id: string; description: string; quantity: string; rate: string; amount: string;
}

// A debit note nested under a purchase voucher (the over-return check) or one
// row of the ledger-wide `debitNotes` history (any status, incl. superseded).
export interface PurchaseDebitNoteRow {
  id: string; voucherNumber: string; voucherDate: string; totalAmount: string; status: string; narration: string | null;
  purchaseVoucherId: string;
  purchaseVoucher?: { id: string; voucherNumber: string };
  replacementPurchaseVoucherId: string | null;
  replacementPurchaseVoucher: { id: string; voucherNumber: string } | null;
  items: { id: string; purchaseVoucherItemId: string; returnedQuantity: string; amount: string }[];
  supersededById?: string | null;
  supersededBy?: { id: string; voucherNumber: string } | null;
  supersedes?: { id: string; voucherNumber: string } | null;
}

export interface PurchaseVoucherRow {
  id: string; voucherNumber: string; voucherDate: string; totalAmount: string; status: string; outstanding: string;
  narration: string | null;
  transporterName: string | null;
  purchaseOrder: { id: string; status: string; totalAmount: number; supplierId: string } | null;
  allocations: { paymentVoucher: { voucherNumber: string } }[];
  items: PurchaseVoucherItemRow[];
  debitNotesAsSource: PurchaseDebitNoteRow[];
  debitNotesAsReplacement: PurchaseDebitNoteRow[];
  supersededById?: string | null;
  supersededBy?: { id: string; voucherNumber: string } | null;
  supersedes?: { id: string; voucherNumber: string } | null;
}

export interface PaymentVoucherRow {
  id: string; ledgerId: string; voucherNumber: string; voucherType: string; voucherDate: string; totalAmount: string;
  bankAccountId: string | null; narration: string | null; status: string; available: string;
  allocations: { id: string; purchaseVoucherId: string; amountAllocated: string; purchaseVoucher: { id: string; voucherNumber: string } }[];
  supersededById: string | null;
  supersededBy: { id: string; voucherNumber: string } | null;
  supersedes: { id: string; voucherNumber: string } | null;
}

export interface PurchaseLedgerDetail {
  ledger: {
    id: string; name: string; gstin: string | null; phone: string | null; email: string | null; address: string | null; isActive: boolean;
    partyType: 'SUPPLIER' | 'TRANSPORTER' | null;
  };
  balance: string;
  purchaseVouchers: PurchaseVoucherRow[];
  paymentVouchers: PaymentVoucherRow[];
  debitNotes: PurchaseDebitNoteRow[];
}

export interface EditPurchaseVoucherInput {
  editReason: string;
  voucherNumber?: string;
  voucherDate: string;
  narration?: string;
  transporterName?: string;
  purchaseOrderId?: string;
  items: { description: string; quantity?: number; rate: number; amount: number }[];
}

export interface EditPaymentVoucherInput {
  editReason: string;
  ledgerId: string;
  voucherType: 'PAYMENT' | 'RECEIPT';
  voucherNumber?: string;
  voucherDate: string;
  totalAmount: number;
  bankAccountId?: string;
  narration?: string;
  // Omitted = keep the current allocation set; [] = clear it.
  allocations?: { purchaseVoucherId: string; amount: number }[];
}

export interface EditDebitNoteInput {
  editReason: string;
  purchaseVoucherId: string;
  replacementPurchaseVoucherId?: string;
  voucherNumber?: string;
  voucherDate: string;
  narration?: string;
  items: { purchaseVoucherItemId: string; returnedQuantity: number; amount: number }[];
}

// Payroll page: a salary payment with the breakdown parsed from its JSON note.
// Payments made before the breakdown existed (note null / plain text) come back
// with grossSalary null, and the row then falls back to the live figures.
export interface SalaryPaymentWithBreakdown {
  id: string;
  userId: string;
  amount: number;
  mode: string | null;
  paidAt: string;
  paidBy: { name: string } | null;
  grossSalary: number | null;
  attendanceDeduction: number;
  advanceDeduction: number | null;
  advanceSkipped: boolean;
  loanDeduction: number | null;
  netPayable: number | null;
}

// Not returned by every backend build (the dashboard reads it defensively).
export interface PayrollResult {
  totalAdvanceDeduction?: number;
}

// ── Conversations page (dashboard conversations/page.tsx) ──
// Fields the API returns that the original Conversation / message types omit.
export interface Conversation {
  lastCustomerMessageAt?: string | null;
  businessPhoneNumberId?: string | null;
}

export interface ConversationMessage {
  deliveryError?: string | null;
}

export interface ConversationListParams {
  category?: string;
  status?: string;
  search?: string;
  staffPhoneNumberId?: string;
}

export interface ConversationStats {
  total: number;
  active: number;
  waiting: number;
  highValue: number;
  byCategory: Record<ConversationCategory, number>;
}

export interface StaffPhoneNumberRow {
  id: string;
  phoneNumberId: string;
  displayPhone: string | null;
  label: string | null;
  employee?: { id: string; name: string } | null;
}

// ── Conversations Phase 2: call recordings, new conversation, staff numbers ──
// GET /call-recordings?conversationId= (OWNER / STORE_MANAGER only).
export interface ConversationCallRecording {
  id: string;
  conversationId: string | null;
  callerPhone: string;
  audioUrl: string;
  durationSecs: number | null;
  callTimestamp: string;
  transcriptText: string | null;
  transcriptStatus: TranscriptStatus;
}

// GET /call-recordings/my-summary: no audio URL and no transcript, by design.
export interface ConversationCallSummary {
  id: string;
  callTimestamp: string;
  durationSecs: number | null;
  customerName: string;
  summary: string;
  source: string;
}

export interface CreateConversationInput {
  customerName: string;
  customerPhone: string;
  assignedToId: string;
  category: ConversationCategory;
}

// One number on the WhatsApp Business Account (GET /staff-phone-numbers/waba-numbers).
export interface WabaNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  status: string;
  quality_rating: string;
}

export interface StaffPhoneNumberRow {
  employeeId?: string | null;
}

// ── Inventory page (dashboard parity) ───────────────────────────────────────
// GET /inventory-items (list) — every row carries totalStock and the derived
// effectiveStatus (computeEffectiveStatus in inventory_items_route.ts), plus
// its receipts with the last reconciliation attached.
export type InventoryEffectiveStatus = 'ACTIVE' | 'OUT_OF_STOCK' | 'EXPIRED' | 'DISCONTINUED';

export interface InventoryListReceipt extends StockReceipt {
  lastReconciliation?: { reconciledAt: string; difference: number; user?: { name: string } | null } | null;
}

export interface InventoryListItem {
  id: string;
  product: string;
  category: string;
  unit: string;
  status: string;
  effectiveStatus: InventoryEffectiveStatus;
  totalStock?: number;
  sellingPrice?: number | null;
  incentiveValue?: number | null;
  compatibility?: string | null;
  warranty?: string | null;
  notes?: string | null;
  storeLocation?: string | null;
  imageUrls?: string[];
  lastVerifiedAt?: string | null;
  lastVerifiedCount?: number | null;
  receipts?: InventoryListReceipt[];
  createdAt: string;
}

export interface InventoryListParams {
  category?: string;
  status?: string;
  q?: string;
}

// GET /inventory-items/check-seller-match → { receiptId, barcode, quantityReceived, sellerName } | null
export interface SellerMatch {
  receiptId: string;
  barcode: string;
  quantityReceived: number;
  sellerName: string;
}

// GET /inventory-items/lookup-barcode → { itemName, receiptId?, remainingQty? }
export interface BarcodeLookup {
  itemName: string;
  receiptId?: string;
  remainingQty?: number;
}

// ── Accounts page: the reminder fields the dashboard reads beyond PaymentReminder ──
export interface PaymentReminderFull extends PaymentReminder {
  bankAccountId: string | null;
  paymentMethod: string | null;
  accountReference: string | null;
  paidBy: { id: string; name: string } | null;
  receiptUrl: string | null;
}
