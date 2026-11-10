import type { IdentityDocType, IdentityDocumentStatus, OnboardingDocument } from '@/types/api';

// Copied from the dashboard's Documents tab so both sides agree.

// Insertion order drives the Document Type dropdown ("Other" deliberately last).
export const DOC_TYPE_LABELS: Record<IdentityDocType, string> = {
  PAN_CARD: 'PAN Card', AADHAAR_CARD: 'Aadhaar Card', BANK_ACCOUNT: 'Bank Account', CV: 'CV / Resume',
  PASSPORT: 'Passport', DRIVING_LICENCE: 'Driving Licence', VOTER_ID: 'Voter ID',
  LAST_SALARY_SLIP: 'Last Salary Slip', EDUCATION_CERTIFICATE: 'Education Certificate',
  EXPERIENCE_LETTER: 'Experience Letter', OTHER: 'Other',
};

// Types whose sensitive data is an encrypted number (VALUE_TYPES in identity-documents.ts).
export const VALUE_TYPES = new Set<IdentityDocType>(['PAN_CARD', 'AADHAAR_CARD', 'BANK_ACCOUNT', 'PASSPORT', 'DRIVING_LICENCE', 'VOTER_ID']);

// File and number are each optional, but at least one is required.
export const FILE_OR_VALUE_TYPES = new Set<IdentityDocType>(['PAN_CARD', 'AADHAAR_CARD', 'PASSPORT', 'DRIVING_LICENCE', 'VOTER_ID']);

// Documents HR collects for every hire (matches the candidate invite's mandatory set).
export const MANDATORY_TYPES = new Set<IdentityDocType>(['PAN_CARD', 'AADHAAR_CARD', 'CV', 'BANK_ACCOUNT']);

const DOC_TYPE_ORDER: IdentityDocType[] = [
  'AADHAAR_CARD', 'PAN_CARD', 'BANK_ACCOUNT', 'CV', 'EDUCATION_CERTIFICATE',
  'PASSPORT', 'DRIVING_LICENCE', 'VOTER_ID', 'LAST_SALARY_SLIP', 'EXPERIENCE_LETTER', 'OTHER',
];

export function sortByDocType(docs: OnboardingDocument[]): OnboardingDocument[] {
  return [...docs].sort((a, b) => DOC_TYPE_ORDER.indexOf(a.type) - DOC_TYPE_ORDER.indexOf(b.type));
}

export function statusBadgeVariant(status: IdentityDocumentStatus): 'success' | 'warning' | 'danger' {
  return status === 'VERIFIED' ? 'success' : status === 'REJECTED' ? 'danger' : 'warning';
}

export function allMandatoryVerified(list: OnboardingDocument[]): boolean {
  return Array.from(MANDATORY_TYPES).every((t) => list.some((d) => d.type === t && d.status === 'VERIFIED'));
}

// Same limits as the dashboard's file input and the backend.
export const DOC_UPLOAD_RULES = {
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  maxSizeBytes: 10 * 1024 * 1024,
};
