// Mapping between the Call Intelligence read API and the Call Tracker's CallTrackerEntry.
//
// The Call Intelligence service (Python PoC: Exotel recording -> Sarvam transcript + summary) is never called from the app. The existing
// Node/Express backend calls it server-to-server (it holds the token) and re-exposes it at /call-intelligence/recordings; see
// docs/call-intelligence-integration.md for the contract. This file only turns that JSON into what the screens render. No React Native
// imports on purpose, so it can be tested with plain `node --test`.

import type { CallSummaryData, CallTrackerEntry, CallTrackerStatus, CallTurn } from './call-tracker';

/** One item of GET /call-intelligence/recordings (and of the detail response, which adds the last three fields). */
export type CallIntelligenceItem = {
  recordingId: string;
  source: string | null;
  salesperson: string | null;
  direction: string | null;
  fromMasked: string | null;
  toMasked: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt?: string | null;
  durationSeconds: number | null;
  conversationSeconds: number | null;
  status: { recording: string; transcription: string; summary: string };
  audioUrl: string | null;
  failureReason?: string | null;
  transcriptText?: string | null;
  summary?: Record<string, unknown> | null;
};

const SPEAKER_LINE = /^(SALESMAN|CUSTOMER|SPEAKER_\d+):\s*(.*)$/;

// The service stores "2026-10-28 11:34:49" (India time, no offset); the screens expect "2026-10-28T11:34:49".
const VALID_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// An ISO instant ("2026-10-30T07:09:00+00:00") as India wall-clock time, the form the screens use. null when it is not a date.
export function istStampFromIso(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return null;
  return new Date(t + 330 * 60_000).toISOString().slice(0, 19);
}

export function toLocalStamp(value: string | null | undefined): string {
  return (value ?? '').trim().replace(' ', 'T');
}

// Pipeline stage status -> badge status: pending (not started), processing (running or queued), completed, failed. "pending" is never shown
// as "processing": a stage that has not run is not being worked on.
export function mapStageStatus(value: string | undefined): CallTrackerStatus {
  if (value === 'completed') return 'completed';
  if (value === 'failed' || value === 'unavailable') return 'failed';
  if (value === 'running' || value === 'queued') return 'processing';
  if (value === 'pending') return 'pending';
  return 'none';
}

export function mapRecordingStatus(value: string | undefined): CallTrackerEntry['recordingStatus'] {
  if (value === 'available') return 'available';
  if (value === 'pending' || value === 'running' || value === 'queued') return 'processing';
  return 'missing';
}

// "SALESMAN: hello\nCUSTOMER: hi" -> turns. A line without a known speaker prefix continues the previous turn.
export function parseTurns(text: string | null | undefined): CallTurn[] {
  const turns: CallTurn[] = [];
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = SPEAKER_LINE.exec(line);
    if (m) turns.push({ speaker: m[1], text: m[2] });
    else if (turns.length) turns[turns.length - 1].text += ` ${line}`;
    else turns.push({ speaker: 'UNKNOWN', text: line });
  }
  return turns;
}

// Summaries saved before 28 Oct used other field names and wrote "Not mentioned" for every empty field. That placeholder is never
// shown as content; real text under the old names is mapped to the current fields (the stored record is not changed).
const PLACEHOLDER = /^\s*not mentioned\.?\s*$/i;
const strings = (v: unknown): string[] =>
  (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '' && !PLACEHOLDER.test(x)) : []);
const text = (v: unknown): string => (typeof v === 'string' && !PLACEHOLDER.test(v) ? v.trim() : '');
const first = (...vals: string[]): string => vals.find((v) => v !== '') ?? '';

// summary.numbers: rows {what, value, said_by, quote?, verified?}. A row without a label or a value is dropped; nothing is invented.
function parseNumbers(v: unknown): CallSummaryData['numbers'] {
  if (!Array.isArray(v)) return [];
  const rows: CallSummaryData['numbers'] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const what = text(o.what);
    const value = text(o.value);
    if (!what || !value) continue;
    rows.push({ what, value, saidBy: text(o.said_by), quote: text(o.quote), verified: o.verified !== false });
  }
  return rows;
}

// The summary JSON from the service, or null when it is missing or not an object. A short call carries
// {status: "not_enough_speech", reason} instead of the normal fields: it is shown as such, never invented.
export function parseSummary(raw: unknown): CallSummaryData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const legacyRequirement = text(r.customer_requirement);
  const keyPoints = strings(r.key_points);
  const legacyPoints = strings(r.main_discussion_points);
  return {
    intent: first(text(r.intent), text(r.call_objective)),
    keyPoints: [...(keyPoints.length ? keyPoints : legacyPoints), ...(legacyRequirement && !keyPoints.length ? [`Requirement: ${legacyRequirement}`] : [])],
    decisions: strings(r.decisions),
    actionItems: strings(r.action_items).length ? strings(r.action_items) : strings(r.follow_up_actions),
    objections: strings(r.objections),
    nextSteps: first(text(r.next_steps), strings(r.agreed_next_steps).join('; ')),
    brief: text(r.brief),
    detailedSummary: text(r.detailed_summary),
    salesmanSaid: strings(r.salesman_said),
    customerSaid: strings(r.customer_said),
    numbers: parseNumbers(r.numbers),
    notice: r.status === 'not_enough_speech' ? text(r.reason) || 'Not enough speech to summarise.' : undefined,
  };
}

export function toEntry(item: CallIntelligenceItem): CallTrackerEntry {
  // The screens need a real timestamp: a call Exotel gave no StartTime for (e.g. never answered) falls back to when the pipeline first saw it.
  const given = toLocalStamp(item.startedAt);
  const started = VALID_STAMP.test(given) ? given : (istStampFromIso(item.createdAt) ?? '1970-01-01T00:00:00');
  const entry: CallTrackerEntry = {
    callId: item.recordingId,
    salesperson: item.salesperson ?? 'Unknown',
    salespersonPhoneMasked: item.direction?.startsWith('inbound') ? (item.toMasked ?? '') : (item.fromMasked ?? ''),
    customerPhoneMasked: item.direction?.startsWith('inbound') ? (item.fromMasked ?? '') : (item.toMasked ?? ''),
    direction: item.direction?.startsWith('inbound') ? 'INBOUND' : 'OUTBOUND',
    source: item.source === 'android_native' ? 'Android' : 'Exotel',
    startedAt: started,
    endedAt: VALID_STAMP.test(toLocalStamp(item.endedAt)) ? toLocalStamp(item.endedAt) : started,
    durationSeconds: item.durationSeconds ?? 0,
    talkTimeSeconds: item.conversationSeconds ?? 0,
    recordingStatus: mapRecordingStatus(item.status?.recording),
    audioUrl: item.audioUrl ?? undefined,
    transcriptStatus: mapStageStatus(item.status?.transcription),
    summaryStatus: mapStageStatus(item.status?.summary),
    failureReason: item.failureReason ?? undefined,
  };
  return item.transcriptText !== undefined || item.summary !== undefined ? withDetail(entry, item) : entry;
}

// Adds the detail-only fields. `transcript` stays the plain text (the list search matches on it); `summary` is the one-line intent.
export function withDetail(entry: CallTrackerEntry, item: CallIntelligenceItem): CallTrackerEntry {
  const turns = parseTurns(item.transcriptText);
  const summaryData = parseSummary(item.summary);
  return {
    ...entry,
    detailLoaded: true,
    transcript: item.transcriptText ?? undefined,
    turns: turns.length ? turns : undefined,
    summaryData: summaryData ?? undefined,
    summary: summaryData?.intent || summaryData?.notice || undefined,
  };
}
