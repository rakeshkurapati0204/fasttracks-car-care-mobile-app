import type { BadgeVariant } from '@/components/ui';
import type { CandidateOverviewMetric, HRLetterType, OnboardingStatus, ProbationMilestone } from '@/types/api';

// Tab order, labels, letter/candidate labels and badge colours: copied from the
// dashboard's Onboarding page (onboarding/page.tsx) so both show the same thing.

export type TabKey = 'overview' | 'employment' | 'prejoining' | 'letters' | 'documents' | 'verification' | 'onboarding' | 'discipline' | 'checkins';

export const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'employment', label: 'Employment & Role' },
  { key: 'prejoining', label: 'Pre-Joining Terms' },
  { key: 'letters', label: 'Letters' },
  { key: 'documents', label: 'Documents' },
  { key: 'verification', label: 'Verification' },
  { key: 'onboarding', label: 'Onboarding Checklist' },
  { key: 'discipline', label: 'Discipline & Policies' },
  { key: 'checkins', label: 'Check-ins' },
];

// Phase 1 builds these; the rest show "Coming next".
export const BUILT_TABS: TabKey[] = ['overview', 'letters', 'onboarding'];

export type CheckInFilter = 'ALL' | 'DUE_SOON' | 'OVERDUE';

// Where an Overview card / drill-down row sends HR.
export type OverviewTarget =
  | { tab: 'verification' }
  | { tab: 'onboarding'; userId?: string }
  | { tab: 'checkins'; checkInFilter: CheckInFilter; userId?: string; milestone?: ProbationMilestone }
  | { tab: 'documents' | 'employment'; userId: string }
  | { tab: 'letters' | 'prejoining'; userId?: string };

// Overview card colours (the dashboard's hex values).
export const STAT_AMBER = '#f59e0b';
export const STAT_INDIGO = '#6366f1';
export const STAT_SKY = '#0ea5e9';
export const STAT_RED = '#e06868';

export const MILESTONE_LABELS: Record<ProbationMilestone, string> = { DAY_7: 'Day 7', DAY_30: 'Day 30', DAY_60: 'Day 60', DAY_90: 'Day 90' };

export const LETTER_TYPE_LABELS: Record<HRLetterType, string> = {
  LETTER_OF_INTENT: 'Letter of Intent',
  OFFER: 'Offer Letter',
  LETTER_OF_ONBOARDING: 'Letter of Onboarding',
  EXPERIENCE: 'Experience Letter',
  RELIEVING: 'Relieving Letter',
};

export const LETTER_TYPE_BADGE: Record<HRLetterType, BadgeVariant> = {
  LETTER_OF_INTENT: 'secondary',
  OFFER: 'primary',
  LETTER_OF_ONBOARDING: 'success',
  EXPERIENCE: 'blue',
  RELIEVING: 'orange',
};

export const CANDIDATE_METRIC_COPY: Record<CandidateOverviewMetric, { title: string; empty: string; action: string; goTo: 'documents' | 'verification' }> = {
  inPipeline: { title: 'Candidates in Pipeline', empty: 'No candidates are currently filling in their onboarding details.', action: 'Documents', goTo: 'documents' },
  pendingVerification: { title: 'Pending HR Verification', empty: 'No candidates are waiting on HR verification.', action: 'Verification', goTo: 'verification' },
  rejectedAwaitingReupload: { title: 'Rejected Docs Awaiting Re-upload', empty: 'No candidates have a rejected document waiting to be re-uploaded.', action: 'Documents', goTo: 'documents' },
  overdue: { title: 'Overdue Onboarding', empty: 'No onboarding is overdue.', action: 'Documents', goTo: 'documents' },
};

export const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  INVITED: 'Invited',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted — Awaiting HR Review',
  HR_REVIEW: 'HR Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

// Who the ball is with: the one line HR reads to decide whether to keep waiting.
export const CANDIDATE_STATUS_HINT: Record<string, { text: string; ready: boolean }> = {
  INVITED: { text: 'Waiting for the candidate to open the onboarding link and fill in their details.', ready: false },
  IN_PROGRESS: { text: "The candidate has started filling in their details but hasn't submitted yet.", ready: false },
  SUBMITTED: { text: 'The candidate has submitted all their details and documents — ready for you to verify.', ready: true },
  HR_REVIEW: { text: 'Submitted by the candidate and under HR review.', ready: true },
};

export function candidateStatusBadgeVariant(status: OnboardingStatus | string): 'success' | 'warning' | 'primary' | 'danger' {
  if (status === 'APPROVED') return 'success';
  if (status === 'SUBMITTED' || status === 'HR_REVIEW') return 'warning';
  if (status === 'REJECTED') return 'danger';
  return 'primary';
}

// "Not invited yet" | "Invited 3d ago — waiting on candidate" | "3d awaiting HR review"
export function waitingLabel(daysWaiting: number | null, waitingOn: 'candidate' | 'hr'): string {
  if (daysWaiting == null) return 'Not invited yet';
  return waitingOn === 'candidate' ? `Invited ${daysWaiting}d ago — waiting on candidate` : `${daysWaiting}d awaiting HR review`;
}
