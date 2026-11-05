// Search text of a call: id, salesperson, the numbers as shown and as plain digits (so "9848012345" or "12345" finds "+91 98480 12345"),
// the transcript and the one-line summary. No imports on purpose, so it runs under the plain test runner.
type Searchable = { callId: string; salesperson: string; salespersonPhone: string; customerPhone: string; transcript?: string; summary?: string };

const digits = (v: string) => v.replace(/\D/g, '');

export function callMatchesSearch(c: Searchable, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [c.callId, c.salesperson, c.salespersonPhone, digits(c.salespersonPhone), c.customerPhone, digits(c.customerPhone), c.transcript, c.summary]
    .filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}
