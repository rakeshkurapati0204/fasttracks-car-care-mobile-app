import type { BadgeVariant } from '@/components/ui';
import type { ApplicationQuestionAnswers, ApplicationRowData, ApplicationStatus } from '@/types/api';

// Constants and helpers from the dashboard's Applications page
// (applications/page.tsx + ApplicationFormFields.tsx), kept identical.

export const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'];

export const STATUSES: ApplicationStatus[] = ['APPLIED', 'AI_SCREENING', 'AI_INTERVIEW', 'ASSESSMENT', 'MANAGER_INTERVIEW', 'SELECTED', 'REJECTED'];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  AI_SCREENING: 'AI Screening',
  AI_INTERVIEW: 'AI Interview',
  ASSESSMENT: 'Assessment',
  MANAGER_INTERVIEW: 'Manager Interview',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
};

export const STATUS_BADGE_VARIANT: Record<ApplicationStatus, BadgeVariant> = {
  APPLIED: 'secondary',
  AI_SCREENING: 'blue',
  AI_INTERVIEW: 'blue',
  ASSESSMENT: 'purple',
  MANAGER_INTERVIEW: 'purple',
  SELECTED: 'success',
  REJECTED: 'danger',
};

// Display labels for Application.candidateQuestionAnswers, in the dashboard's order.
export const CANDIDATE_QUESTION_LABELS: { key: keyof ApplicationQuestionAnswers; label: string }[] = [
  { key: 'whyJoin', label: 'Why do you want to join FastTracks?' },
  { key: 'experience', label: 'Previous workshop/service experience?' },
  { key: 'expectedSalary', label: 'Expected salary?' },
  { key: 'noticePeriod', label: 'Notice period?' },
  { key: 'preferredLocation', label: 'Preferred location?' },
  { key: 'skills', label: 'Relevant skills?' },
  { key: 'additionalInfo', label: 'Additional information' },
];

export function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function fmtDateTime(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

export function scoreVariant(score: number): 'success' | 'warning' | 'danger' {
  return score >= 70 ? 'success' : score >= 40 ? 'warning' : 'danger';
}

// SELECTED already created the candidate's User row, but nothing reaches them
// until HR approves Pre-Joining Terms and sends an onboarding link.
export function onboardingNotStarted(a: ApplicationRowData): boolean {
  const u = a.convertedUser;
  return a.status === 'SELECTED' && !!u && u._count.onboardingInvitesReceived === 0 && u.onboardingStatus !== 'APPROVED' && u.onboardingStatus !== 'REJECTED';
}

// The server's `error` field already states the specific reason; this only
// covers the cases where there's no such message to show.
export function saveErrorMessage(err: any, fallback: string): string {
  const serverMessage = err?.response?.data?.error;
  if (typeof serverMessage === 'string' && serverMessage.trim()) return serverMessage;
  if (!err?.response) return `${fallback}: couldn't reach the server — check your connection and try again.`;
  return `${fallback} (server returned HTTP ${err.response.status}).`;
}

// ── Form values and validation (ApplicationFormFields.tsx) ──────────────────
export interface PersonalInfoValue {
  name: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  currentAddress: string;
  permanentAddress: string;
  sameAsCurrent: boolean;
  fresher: boolean;
  notes: string;
}

export const emptyPersonalInfo: PersonalInfoValue = {
  name: '', dateOfBirth: '', email: '', phone: '',
  currentAddress: '', permanentAddress: '', sameAsCurrent: false,
  fresher: false, notes: '',
};

// Digits only, max 10; a pasted "+91 98765 43210" / "098765 43210" keeps the
// real 10-digit number instead of chopping it.
export function toTenDigitPhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

export function ageFromDob(dob: string): number | null {
  const t = new Date(dob).getTime();
  if (!dob.trim() || Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (365.25 * 24 * 60 * 60 * 1000));
}

// Mirrors backend buildPersonalFieldsData validation. requireContact is true
// for a new application; editing an older row relaxes email/phone to
// "valid if present".
export function validatePersonalInfo(v: PersonalInfoValue, opts?: { requireContact?: boolean }): string | null {
  const requireContact = opts?.requireContact ?? true;
  if (!v.name.trim()) return 'Name is required.';
  if (requireContact && !v.email.trim()) return 'Email is required.';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return 'Please enter a valid email address.';
  if (requireContact && !v.phone.trim()) return 'Phone number is required.';
  if (v.phone.trim() && !/^\d{10}$/.test(v.phone.trim())) return 'Phone number must be exactly 10 digits.';
  if (!requireContact && !v.email.trim() && !v.phone.trim()) return 'An email or phone number is required.';
  if (v.dateOfBirth.trim()) {
    const d = new Date(v.dateOfBirth);
    if (Number.isNaN(d.getTime())) return 'Please enter a valid date of birth.';
    if (d.getTime() > Date.now()) return 'Date of birth can’t be in the future.';
    const ageYears = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears < 15 || ageYears > 80) return 'Date of birth must correspond to an age between 15 and 80.';
  }
  return null;
}

// ── Link sharing (ShareLinkModal inputs) ────────────────────────────────────
export type ShareLink = { title: string; message: string; link: string; expiresAt: string; warning?: boolean };

export function applicationInviteShare(invite: { inviteLink: string; expiresAt: string; emailSent: boolean }, resent: boolean): ShareLink {
  return invite.emailSent
    ? { title: resent ? 'Invite Re-sent' : 'Invite Sent', message: `The invite was ${resent ? 're-' : ''}emailed to the candidate. Here's the link in case you need it:`, link: invite.inviteLink, expiresAt: invite.expiresAt }
    : { title: 'Share Link Manually', message: 'The email failed to send — copy this link and send it to the candidate yourself (WhatsApp, SMS or email).', link: invite.inviteLink, expiresAt: invite.expiresAt, warning: true };
}

export function candidateInviteShare(
  what: 'AI Interview' | 'Assessment',
  invite: { inviteLink: string; expiresAt: string; emailSent: boolean; sentTo: string | null; hasEmail: boolean },
  candidateName: string,
): ShareLink {
  if (invite.emailSent) {
    return { title: `${what} Invite Sent`, message: `The link was emailed to ${invite.sentTo}. Here it is in case you need it (shown only once):`, link: invite.inviteLink, expiresAt: invite.expiresAt };
  }
  return {
    title: 'Share Link Manually',
    message: `${invite.hasEmail ? "The email couldn't be sent" : `${candidateName} has no email on file`} — copy this link and send it to them yourself (WhatsApp, SMS or email). It's shown only once.`,
    link: invite.inviteLink,
    expiresAt: invite.expiresAt,
    warning: true,
  };
}
