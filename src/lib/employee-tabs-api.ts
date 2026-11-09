import { api } from '@/lib/api';

// Employee detail panel — Pardon / Scans / Configure history. Same endpoints the dashboard's attendanceAPI and
// permissionsAPI call (backend attendance.ts and permissions_route.ts); the response envelope is { data }.

export interface MonthAttendanceRow { date: string; status: string; clockIn?: string | null; clockOut?: string | null; isLate?: boolean }
export interface PunchHistoryRow { id: string; direction: string; time: string; date: string; interpretation?: 'CLOCK_IN' | 'CLOCK_OUT' | 'IGNORED' }
export interface PermissionChangeLogRow {
  id: string;
  tabKey: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  changedBy?: { id: string; name: string } | null;
}

const list = <T,>(d: unknown): T[] => (Array.isArray(d) ? d : Array.isArray((d as { data?: unknown })?.data) ? ((d as { data: T[] }).data) : []);

// GET /attendance/user/:userId?month&year
export async function fetchEmployeeMonthAttendance(userId: string, month: number, year: number) {
  const { data } = await api.get(`/attendance/user/${userId}`, { params: { month, year } });
  return list<MonthAttendanceRow>(data);
}

// PATCH /attendance/pardon — { userId, date, newStatus }
export async function pardonAttendanceDay(userId: string, date: string, newStatus: string) {
  const { data } = await api.patch('/attendance/pardon', { userId, date, newStatus });
  return data;
}

// GET /attendance/punch-history/:userId?month&year
export async function fetchEmployeePunchHistory(userId: string, month: number, year: number) {
  const { data } = await api.get(`/attendance/punch-history/${userId}`, { params: { month, year } });
  return list<PunchHistoryRow>(data);
}

// GET /permissions/:employeeId/history (OWNER / STORE_MANAGER, or the person themselves)
export async function fetchPermissionHistory(employeeId: string) {
  const { data } = await api.get(`/permissions/${employeeId}/history`);
  return list<PermissionChangeLogRow>(data);
}
