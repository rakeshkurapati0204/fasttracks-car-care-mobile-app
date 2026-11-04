import { Platform } from 'react-native';

import { api } from '@/lib/api';
import { tokenStorage } from '@/lib/token-storage';
import type { ApiEnvelope } from '@/types/api';

import { toEntry, withDetail, type CallIntelligenceItem } from './call-intelligence';

export type CallTrackerStatus = 'completed' | 'processing' | 'pending' | 'failed' | 'none';

export type CallTrackerEntry = {
  callId: string;
  salesperson: string;
  salespersonPhoneMasked: string;
  customerPhoneMasked: string;
  direction: 'INBOUND' | 'OUTBOUND';
  source: string;
  /** Local (IST) wall-clock time, "YYYY-MM-DDTHH:mm:ss" with no offset. */
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  talkTimeSeconds: number;
  recordingStatus: 'available' | 'processing' | 'missing';
  audioUrl?: string;
  transcriptStatus: CallTrackerStatus;
  summaryStatus: CallTrackerStatus;
  /** Plain transcript text ("SALESMAN: ...\nCUSTOMER: ..."), only after the detail is loaded. */
  transcript?: string;
  /** Speaker-labelled turns parsed from the transcript. Speaker = recording channel (channel 0 SALESMAN, channel 1 CUSTOMER). */
  turns?: CallTurn[];
  /** One line: the summary's intent (or the "not enough speech" notice). */
  summary?: string;
  summaryData?: CallSummaryData;
  /** Why a stage failed, when the service says so. */
  failureReason?: string;
  /** True once /call-intelligence/recordings/:id has been merged in. */
  detailLoaded?: boolean;
};

export type CallTurn = { speaker: 'SALESMAN' | 'CUSTOMER' | 'UNKNOWN' | string; text: string };

export type CallSummaryData = {
  intent: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
  objections: string[];
  nextSteps: string;
  /** Two or three lines, then the long account of the call (what each side said), both in English. Empty on older records. */
  brief: string;
  detailedSummary: string;
  /** What the salesman and the customer each said, one point per entry. */
  salesmanSaid: string[];
  customerSaid: string[];
  /** Prices, amounts, dates and quantities. `verified` is false when the number could not be matched to the transcript. */
  numbers: { what: string; value: string; saidBy: string; quote: string; verified: boolean }[];
  /** Set when the call was too short to summarise; the other fields are then empty. */
  notice?: string;
};

const PAGE_SIZE = 100;

// GET /call-intelligence/recordings (Node backend, OWNER only) -> list items without transcript or summary.
export async function fetchCallTrackerEntries(): Promise<CallTrackerEntry[]> {
  const { data } = await api.get<ApiEnvelope<{ items: CallIntelligenceItem[] }>>('/call-intelligence/recordings', { params: { limit: PAGE_SIZE } });
  return (data.data?.items ?? []).map(toEntry);
}

// GET /call-intelligence/recordings/:id -> the same item plus transcriptText and summary. Fetched when a call is opened.
export async function fetchCallTrackerDetail(entry: CallTrackerEntry): Promise<CallTrackerEntry> {
  const { data } = await api.get<ApiEnvelope<CallIntelligenceItem>>(`/call-intelligence/recordings/${encodeURIComponent(entry.callId)}`);
  return withDetail(entry, data.data);
}

// Playback source for expo-audio: the backend's own audio route (same origin as the API) plus the login token as a header. The service's
// token and its recording URLs never reach the app. Only a path on the API's own host is accepted, so the token cannot be sent elsewhere.
// A browser <audio> element cannot send headers, so on web (a preview target, not a shipped one) the file is fetched with the normal
// authenticated client and played from a blob: URL instead.
export async function callAudioSource(audioUrl: string): Promise<{ uri: string; headers: Record<string, string> }> {
  if (!audioUrl.startsWith('/') || audioUrl.startsWith('//')) throw new Error('Unexpected audio location');
  const url = new URL(audioUrl, api.defaults.baseURL).toString();
  if (Platform.OS === 'web') {
    const { data } = await api.get<Blob>(url, { responseType: 'blob' });
    return { uri: URL.createObjectURL(data), headers: {} };
  }
  const token = await tokenStorage.get();
  return { uri: url, headers: token ? { Authorization: `Bearer ${token}` } : {} };
}

// m:ss, e.g. 56 -> "0:56".
export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// "2026-10-28T11:34:49" -> "28/10/2026, 11:34:49".
export function formatStamp(local: string) {
  const [date, time = ''] = local.split('T');
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}, ${time}`;
}

export function directionLabel(direction: CallTrackerEntry['direction']) {
  return direction === 'INBOUND' ? 'Incoming' : 'Outgoing';
}
