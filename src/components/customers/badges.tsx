import { Badge, type BadgeVariant } from '@/components/ui';
import { JOB_STATUS_LABELS, UNPAID_STATUSES } from '@/lib/customers-format';
import type { JobCardStatus } from '@/types/api';

// Dashboard invStatusBadge: PAID green, ACTIVE blue, DRAFT outlined, CANCELLED
// red, ISSUED / PARTIAL / OVERDUE orange. Anything else renders as plain text.
export function InvStatusBadge({ status }: { status: string }) {
  const variant: BadgeVariant =
    status === 'PAID' ? 'success' : status === 'ACTIVE' ? 'blue' : status === 'DRAFT' ? 'secondary' : status === 'CANCELLED' ? 'danger' : UNPAID_STATUSES.includes(status) ? 'orange' : 'muted';
  return <Badge variant={variant}>{status}</Badge>;
}

// Dashboard InvBadge (job card): "Invoice Pending" / "PAID ✓" / "Payment Due".
export function InvBadge({ status }: { status?: string | null }) {
  if (!status || status === 'DRAFT') return <Badge variant="secondary">Invoice Pending</Badge>;
  if (status === 'PAID') return <Badge variant="success">PAID ✓</Badge>;
  if (UNPAID_STATUSES.includes(status)) return <Badge variant="orange">Payment Due</Badge>;
  return <Badge variant="muted">{status}</Badge>;
}

// Active Jobs card: In Progress blue, Walked Out grey, otherwise (Ready) amber.
export function JobStatusBadge({ status }: { status: JobCardStatus }) {
  const variant: BadgeVariant = status === 'IN_PROGRESS' ? 'blue' : status === 'WALKED_OUT' ? 'muted' : 'warning';
  return <Badge variant={variant}>{JOB_STATUS_LABELS[status] ?? status}</Badge>;
}

// Customer panel visit history: In Progress amber, Ready blue, Released green, Walked Out grey.
export function VisitStatusBadge({ status }: { status: JobCardStatus }) {
  const variant: BadgeVariant = status === 'IN_PROGRESS' ? 'warning' : status === 'READY' ? 'blue' : status === 'RELEASED' ? 'success' : 'muted';
  return <Badge variant={variant}>{JOB_STATUS_LABELS[status] ?? status}</Badge>;
}
