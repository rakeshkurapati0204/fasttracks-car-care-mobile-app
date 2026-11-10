import { api } from '@/lib/api';
import type { EmployeeListItem } from '@/types/api';

// Dashboard Remarks page loads its employee picker with employeesAPI.list({ isActive: true }).
export async function fetchActiveEmployeesForRemarks() {
  const { data } = await api.get<{ data: EmployeeListItem[] }>('/employees', { params: { isActive: true } });
  return data.data ?? [];
}
