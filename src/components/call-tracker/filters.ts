import { callMatchesSearch } from '@/lib/call-search';
import { directionLabel, type CallTrackerEntry } from '@/lib/call-tracker';

export type Filters = {
  search: string;
  direction: string;
  salesperson: string;
  source: string;
  recording: string;
  transcript: string;
  summary: string;
  from: string;
  to: string;
};

export const ALL = 'all';
export const EMPTY_FILTERS: Filters = { search: '', direction: ALL, salesperson: ALL, source: ALL, recording: ALL, transcript: ALL, summary: ALL, from: '', to: '' };

// 'yes' filters match the "done" status exactly; 'not' matches everything else.
const matches = (filter: string, status: string, yes: string) => filter === ALL || (filter === 'not' ? status !== yes : status === yes);

export function applyFilters(calls: CallTrackerEntry[], f: Filters) {
  const q = f.search.trim().toLowerCase();
  return calls.filter((c) => {
    if (!callMatchesSearch(c, q)) return false;
    if (f.direction !== ALL && c.direction !== f.direction) return false;
    if (f.salesperson !== ALL && c.salesperson !== f.salesperson) return false;
    if (f.source !== ALL && c.source !== f.source) return false;
    if (!matches(f.recording, c.recordingStatus, 'available')) return false;
    if (!matches(f.transcript, c.transcriptStatus, 'completed')) return false;
    if (!matches(f.summary, c.summaryStatus, 'completed')) return false;
    const day = c.startedAt.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return true;
  });
}

export type ActiveChip = { key: string; label: string; clear: Partial<Filters> };

const dmy = (ymd: string) => ymd.split('-').reverse().join('/');
const yesNo = (name: string, v: string) => `${name}: ${v === 'not' ? 'no' : 'yes'}`;

// Removable chips under the search row. The search text is not a chip: it is
// already visible (and clearable) in the field itself.
export function activeChips(f: Filters): ActiveChip[] {
  const chips: ActiveChip[] = [];
  if (f.direction !== ALL) chips.push({ key: 'direction', label: directionLabel(f.direction as CallTrackerEntry['direction']), clear: { direction: ALL } });
  if (f.salesperson !== ALL) chips.push({ key: 'salesperson', label: f.salesperson, clear: { salesperson: ALL } });
  if (f.source !== ALL) chips.push({ key: 'source', label: f.source, clear: { source: ALL } });
  if (f.recording !== ALL) chips.push({ key: 'recording', label: yesNo('Audio', f.recording), clear: { recording: ALL } });
  if (f.transcript !== ALL) chips.push({ key: 'transcript', label: yesNo('Transcript', f.transcript), clear: { transcript: ALL } });
  if (f.summary !== ALL) chips.push({ key: 'summary', label: yesNo('Summary', f.summary), clear: { summary: ALL } });
  if (f.from) chips.push({ key: 'from', label: `From ${dmy(f.from)}`, clear: { from: '' } });
  if (f.to) chips.push({ key: 'to', label: `To ${dmy(f.to)}`, clear: { to: '' } });
  return chips;
}
