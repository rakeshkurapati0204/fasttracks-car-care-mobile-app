// Run with: npm test   (Node's built-in test runner, no extra dependency).
// The fixtures follow the real shape returned by the Call Intelligence read API for a real Exotel call (checked against the PoC's own
// output); the text is synthetic on purpose so no real call content is committed to this repository.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { istStampFromIso, mapRecordingStatus, mapStageStatus, parseSummary, parseTurns, toEntry, toLocalStamp, type CallIntelligenceItem } from './call-intelligence.ts';

const ITEM: CallIntelligenceItem = {
  recordingId: 'abc123-457000031e',
  source: 'exotel',
  salesperson: 'Salesman 2',
  direction: 'outbound-api',
  fromMasked: '****5252',
  toMasked: '****1086',
  startedAt: '2026-10-28 11:34:49',
  endedAt: '2026-10-28 11:35:45',
  durationSeconds: 56,
  conversationSeconds: 44,
  status: { recording: 'available', transcription: 'completed', summary: 'completed' },
  audioUrl: '/api/recordings/abc123-457000031e/audio',
  failureReason: null,
};

const DETAIL: CallIntelligenceItem = {
  ...ITEM,
  transcriptText: 'SALESMAN: Hello, FastTracks here.\nCUSTOMER: Hi, tell me the price.\nSALESMAN: Around five thousand\nfor a full service.',
  summary: {
    intent: 'Price enquiry for a service',
    key_points: ['Customer asked for the price', ''],
    decisions: [],
    action_items: ['Send a quote'],
    objections: [],
    next_steps: 'Salesman sends the quote tomorrow',
  },
};

test('list item maps to a call tracker entry with the right stamps, status and numbers', () => {
  const e = toEntry(ITEM);
  assert.equal(e.callId, 'abc123-457000031e');
  assert.equal(e.startedAt, '2026-10-28T11:34:49');
  assert.equal(e.endedAt, '2026-10-28T11:35:45');
  assert.equal(e.direction, 'OUTBOUND');
  assert.equal(e.salespersonPhoneMasked, '****5252');
  assert.equal(e.customerPhoneMasked, '****1086');
  assert.equal(e.talkTimeSeconds, 44);
  assert.equal(e.recordingStatus, 'available');
  assert.equal(e.transcriptStatus, 'completed');
  assert.equal(e.detailLoaded, undefined);
  assert.equal(e.transcript, undefined);
});

test('inbound calls swap the salesperson and customer numbers', () => {
  const e = toEntry({ ...ITEM, direction: 'inbound', fromMasked: '****1111', toMasked: '****2222' });
  assert.equal(e.direction, 'INBOUND');
  assert.equal(e.customerPhoneMasked, '****1111');
  assert.equal(e.salespersonPhoneMasked, '****2222');
});

test('detail adds speaker turns (SALESMAN / CUSTOMER) and the structured summary', () => {
  const e = toEntry(DETAIL);
  assert.equal(e.detailLoaded, true);
  assert.deepEqual(e.turns?.map((t) => t.speaker), ['SALESMAN', 'CUSTOMER', 'SALESMAN']);
  assert.equal(e.turns?.[2].text, 'Around five thousand for a full service.');
  assert.deepEqual(e.summaryData?.keyPoints, ['Customer asked for the price']);
  assert.deepEqual(e.summaryData?.actionItems, ['Send a quote']);
  assert.equal(e.summaryData?.nextSteps, 'Salesman sends the quote tomorrow');
  assert.equal(e.summary, 'Price enquiry for a service');
});

test('a short call shows the service notice and no invented summary', () => {
  const s = parseSummary({ status: 'not_enough_speech', reason: 'Not enough speech to summarise (13 words, minimum 40).' });
  assert.equal(s?.notice, 'Not enough speech to summarise (13 words, minimum 40).');
  assert.equal(s?.intent, '');
  assert.deepEqual(s?.keyPoints, []);
});

test('stage statuses: pending, processing, completed, failed; pending is never "processing"', () => {
  assert.equal(mapStageStatus('pending'), 'pending');
  assert.equal(mapStageStatus('running'), 'processing');
  assert.equal(mapStageStatus('queued'), 'processing');
  assert.equal(mapStageStatus('completed'), 'completed');
  assert.equal(mapStageStatus('failed'), 'failed');
  assert.equal(mapStageStatus('unavailable'), 'failed');
  assert.equal(mapStageStatus(undefined), 'none');
  assert.equal(mapRecordingStatus('pending'), 'processing');
  assert.equal(mapRecordingStatus('unavailable'), 'missing');
});

test('malformed input does not throw', () => {
  assert.equal(parseSummary(null), null);
  assert.equal(parseSummary([1, 2]), null);
  assert.deepEqual(parseTurns(null), []);
  assert.deepEqual(parseTurns('no speaker here').map((t) => t.speaker), ['UNKNOWN']);
  assert.equal(toLocalStamp(null), '');
  const e = toEntry({ ...ITEM, startedAt: null, endedAt: null, durationSeconds: null, conversationSeconds: null, salesperson: null });
  assert.equal(e.salesperson, 'Unknown');
  assert.equal(e.durationSeconds, 0);
});

test('older format: placeholders are never shown, real text under the old names is mapped', () => {
  const placeholders = parseSummary({ call_objective: 'Not mentioned', customer_requirement: 'Not mentioned', main_discussion_points: [], outcome: 'Not mentioned', agreed_next_steps: [] });
  assert.equal(placeholders?.intent, '');
  assert.equal(placeholders?.nextSteps, '');
  assert.deepEqual([placeholders?.keyPoints, placeholders?.actionItems], [[], []]);
  const mapped = parseSummary({ call_objective: 'Price enquiry', customer_requirement: 'Ceramic coating', main_discussion_points: ['Budget asked', 'Not mentioned'],
    agreed_next_steps: ['Call back', 'Send quote'], follow_up_actions: ['Share brochure'] });
  assert.equal(mapped?.intent, 'Price enquiry');
  assert.deepEqual(mapped?.keyPoints, ['Budget asked', 'Requirement: Ceramic coating']);
  assert.equal(mapped?.nextSteps, 'Call back; Send quote');
  assert.deepEqual(mapped?.actionItems, ['Share brochure']);
});

test('current format wins over old names when both exist', () => {
  const s = parseSummary({ intent: 'New', call_objective: 'Old', key_points: ['k'], main_discussion_points: ['m'] });
  assert.equal(s?.intent, 'New');
  assert.deepEqual(s?.keyPoints, ['k']);
});

test('a call without a start time (never answered) falls back to when the pipeline saw it, so the screens never get an empty time', () => {
  const e = toEntry({ ...ITEM, startedAt: null, endedAt: null, createdAt: '2026-10-30T07:09:19.100+00:00', durationSeconds: 0 });
  assert.equal(e.startedAt, '2026-10-30T12:39:19');
  assert.equal(e.endedAt, e.startedAt);
  assert.match(e.startedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  assert.equal(istStampFromIso('not a date'), null);
  assert.equal(toEntry({ ...ITEM, startedAt: null, endedAt: null, createdAt: null }).startedAt, '1970-01-01T00:00:00'); // last resort, never empty
});
