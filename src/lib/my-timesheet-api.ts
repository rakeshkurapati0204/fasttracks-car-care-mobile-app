import * as FileSystem from 'expo-file-system/legacy';

import { api } from '@/lib/api';
import { tokenStorage } from '@/lib/token-storage';

// Calls used only by the My Timesheet screen (dashboard /dashboard/timesheet).
// Kept in their own file so the shared api.ts stays untouched.

export type MtStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface MtTask {
  id?: string;
  task: string;
  hours: number;
  notes?: string;
  /** Resolved user ids for anyone @-tagged in this entry's text. */
  mentions?: string[];
}

export interface MtReply {
  id: string;
  entryId: string;
  authorId: string;
  message: string;
  author?: { id: string; name: string };
  mentionedUsers?: { id: string; name: string }[];
  createdAt: string;
}

export interface MtAttachment {
  id: string;
  entryId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
}

export interface MtContact {
  id: string;
  phone: string;
  contactType: string;
  contactTypeOther: string | null;
  name: string | null;
  deletedAt?: string | null;
}

export interface MtContactLink {
  id: string;
  entryId: string;
  reason: string | null;
  linkedById: string;
  linkedBy?: { id: string; name: string };
  createdAt: string;
  contact: MtContact;
}

export interface MtDay {
  id: string;
  date: string;
  entries: MtTask[];
  totalHours: number;
  status: MtStatus;
  notes?: string | null;
  canEdit?: boolean;
  editableUntil?: string | null;
  lockedReason?: string | null;
  entryReplies?: MtReply[];
  entryAttachments?: MtAttachment[];
  entryContacts?: MtContactLink[];
}

export interface MtCustomer { id: string; name: string; phone: string }
export interface MtJobCardOption { id: string; jobNumber: string; vehicleNumber: string; reasonForVisit: string }

export interface MtContactConflict {
  isDeleted: boolean;
  name?: string | null;
  contactType?: string;
  contactTypeOther?: string | null;
  createdAt?: string;
  addedBy?: { id: string; name: string } | null;
}

export interface MtLinkContactInput {
  phone: string;
  contactType?: string;
  contactTypeOther?: string;
  name?: string;
  reason?: string;
  linkExistingConfirmed?: boolean;
}

interface Envelope<T> { success: boolean; data: T; message?: string }

// GET /timesheets/my-month — the dashboard's timesheetAPI.myMonth.
export async function mtMyMonth(month: number, year: number) {
  const { data } = await api.get<Envelope<MtDay[]>>('/timesheets/my-month', { params: { month, year } });
  return data.data ?? [];
}

// GET /timesheets/:id — refreshes status/canEdit/editableUntil/lockedReason plus replies/attachments/contacts.
export async function mtGetOne(id: string) {
  const { data } = await api.get<Envelope<MtDay>>(`/timesheets/${id}`);
  return data.data;
}

// POST /timesheets — upsert for a date. notes is sent as-is (including '') exactly like the dashboard.
export async function mtSave(date: string, entries: MtTask[], notes?: string) {
  const { data } = await api.post<Envelope<MtDay>>('/timesheets', { date, entries, notes });
  return data.data;
}

export async function mtSubmit(id: string) {
  const { data } = await api.patch<Envelope<MtDay>>(`/timesheets/${id}/submit`);
  return data.data;
}

export async function mtReplyToEntry(timesheetId: string, entryId: string, message: string, mentions?: string[]) {
  const { data } = await api.post<Envelope<MtReply>>(`/timesheets/${timesheetId}/entries/${entryId}/reply`, { message, mentions });
  return data.data;
}

export async function mtLinkContact(timesheetId: string, entryId: string, input: MtLinkContactInput) {
  const { data } = await api.post<Envelope<MtContactLink>>(`/timesheets/${timesheetId}/entries/${entryId}/contacts`, input);
  return data.data;
}

// Streams a private entry attachment to the cache (needs the Bearer header) so it can be opened in the share sheet.
export async function mtDownloadAttachment(attachmentId: string, filename: string): Promise<{ uri: string }> {
  const token = await tokenStorage.get();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const dest = `${FileSystem.cacheDirectory}tsatt-${attachmentId}-${safe}`;
  const result = await FileSystem.downloadAsync(`${process.env.EXPO_PUBLIC_API_URL}/timesheets/attachments/${attachmentId}/file`, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
    throw new Error('Failed to open attachment.');
  }
  return { uri: result.uri };
}

// ── Work documentation (/work-docs) ─────────────────────────────────────────
export async function mtCreateWorkDoc(timesheetId: string, body: Record<string, unknown>) {
  const { data } = await api.post(`/work-docs/timesheet/${timesheetId}`, body);
  return data;
}

export async function mtUpdateWorkDoc(id: string, body: Record<string, unknown>) {
  const { data } = await api.put(`/work-docs/${id}`, body);
  return data;
}

export async function mtRemoveWorkDoc(id: string) {
  const { data } = await api.delete(`/work-docs/${id}`);
  return data;
}

// ── CRM customer picker (raw JSON, not enveloped) ───────────────────────────
export async function mtSearchCustomers(query: string) {
  const { data } = await api.get<{ customers?: MtCustomer[] }>('/crm/customers', { params: { search: query, searchBy: 'name', limit: 10 } });
  return data.customers ?? [];
}

export async function mtCreateCustomer(input: { name: string; phone: string }) {
  const { data } = await api.post<MtCustomer>('/crm/customers', input);
  return data;
}

export async function mtCustomerJobCards(id: string) {
  const { data } = await api.get<{ jobCards?: MtJobCardOption[] }>(`/crm/customers/${id}`);
  return data.jobCards ?? [];
}

// ── Unread "manager replied" notifications (calendar dot) ───────────────────
export async function mtUnreadRemarks() {
  const { data } = await api.get<{ data?: { id: string; type: string; metadata?: { timesheetId?: string } | null }[] }>('/notifications', {
    params: { isRead: false, limit: 100 },
  });
  const rows = (data as { data?: unknown }).data;
  // The server wraps the page as { success, data: { data: [...] } }.
  const list = Array.isArray(rows) ? rows : ((rows as { data?: unknown[] } | undefined)?.data ?? []);
  return (list as { id: string; type: string; metadata?: { timesheetId?: string } | null }[])
    .filter((n) => n.type === 'TIMESHEET_ENTRY_REMARK')
    .map((n) => ({ id: n.id, timesheetId: n.metadata?.timesheetId }))
    .filter((n): n is { id: string; timesheetId: string } => !!n.timesheetId);
}
