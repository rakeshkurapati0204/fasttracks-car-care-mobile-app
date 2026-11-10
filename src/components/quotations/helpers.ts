import type { QuotationFull, QuotationFullLineItem, QuotationStatus } from '@/types/api';

// Ports of the dashboard's quotation helpers: quotations/page.tsx, QuotationLineItemPicker.tsx,
// quotations/new/page.tsx and quotations/[id]/print/page.tsx. Same rules, same math, same wording.

export const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER', 'ACCOUNTING'];
export const GST_RATES = [0, 5, 12, 18, 28];
export const PAGE_SIZE = 20;
export const WIDE_MIN = 560;

export const STATUS_META: Record<QuotationStatus, { label: string; bg: string; color: string }> = {
  DRAFT:    { label: 'Draft',    bg: 'rgba(100,116,139,0.15)', color: '#64748b' },
  SENT:     { label: 'Sent',     bg: 'rgba(59,130,246,0.15)',  color: '#2563eb' },
  ACCEPTED: { label: 'Accepted', bg: 'rgba(34,197,94,0.15)',   color: '#15803d' },
  REJECTED: { label: 'Rejected', bg: 'rgba(239,68,68,0.15)',   color: '#b91c1c' },
  EXPIRED:  { label: 'Expired',  bg: 'rgba(245,158,11,0.15)',  color: '#b45309' },
};
export const STATUS_KEYS = Object.keys(STATUS_META) as QuotationStatus[];

/** en-IN, always two decimals (dashboard `fmt`). */
export function fmt(n: number | null | undefined): string {
  return (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const dmy = (iso: string) => new Date(iso).toLocaleDateString('en-IN');

// ── Line items (QuotationLineItemPicker) ────────────────────────────────────

export interface QLine {
  id?: string;
  description: string;
  hsnSacCode: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  discountMode: 'PERCENT' | 'FIXED';
  /** Informational, from inventory search; the wizard uses it for its per-item GST totals. */
  gstPercent?: number;
  inventoryItemId?: string;
  sku?: string;
  erpItemId?: string;
}

export function emptyLine(): QLine {
  return { description: '', hsnSacCode: '998714', quantity: 1, unitPrice: 0, discountAmount: 0, discountMode: 'PERCENT' };
}

export function calcLineAmount(item: QLine): number {
  const gross = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  const disc = item.discountMode === 'FIXED'
    ? (Number(item.discountAmount) || 0)
    : gross * ((Number(item.discountAmount) || 0) / 100);
  return Math.max(0, gross - disc);
}

// Same math as the dashboard wizard's useCartTotals (per-line GST from gstPercent, scaled by the
// discounted/original ratio).
export function computeTotals(items: QLine[], overallDiscountAmount = 0, overallDiscountMode: 'PERCENT' | 'FIXED' = 'PERCENT') {
  const lineAmounts = items.map(calcLineAmount);
  const lineSubtotal = lineAmounts.reduce((s, a) => s + a, 0);
  const totalLineDiscounts = items.reduce((s, li, i) => {
    const gross = (Number(li.quantity) || 0) * (Number(li.unitPrice) || 0);
    return s + (gross - lineAmounts[i]);
  }, 0);
  const overallDiscAmt = overallDiscountMode === 'PERCENT'
    ? lineSubtotal * ((overallDiscountAmount || 0) / 100)
    : (overallDiscountAmount || 0);
  const discountedSubtotal = Math.max(0, lineSubtotal - overallDiscAmt);
  const totalGST = items.reduce((s, li) => {
    const gstFactor = 1 + (li.gstPercent || 0) / 100;
    const unitPrice = Number(li.unitPrice) || 0;
    return s + (unitPrice - unitPrice / gstFactor) * (Number(li.quantity) || 0);
  }, 0);
  const originalGross = items.reduce((s, li) => s + (Number(li.unitPrice) || 0) * (Number(li.quantity) || 0), 0);
  const discountRatio = originalGross > 0 ? discountedSubtotal / originalGross : 1;
  const adjustedGST = totalGST * discountRatio;
  return { lineSubtotal, totalLineDiscounts, overallDiscAmt, discountedSubtotal, cgst: adjustedGST / 2, sgst: adjustedGST / 2, totalGST: adjustedGST };
}

export interface ServiceCharge { id: string; label: string; amount: number }

export function cartTotals(items: QLine[], services: ServiceCharge[], overallDiscountAmount = 0, overallDiscountMode: 'PERCENT' | 'FIXED' = 'PERCENT') {
  const base = computeTotals(items, overallDiscountAmount, overallDiscountMode);
  const serviceTotal = services.reduce((s, c) => s + (c.amount || 0), 0);
  return { ...base, serviceTotal, grandTotal: Math.round(base.discountedSubtotal + serviceTotal) };
}

/** Edit-modal totals: a single blended GST rate over the line subtotal. */
export function blendedTotals(items: QLine[], gstRate: number) {
  const subtotal = items.reduce((s, li) => s + calcLineAmount(li), 0);
  const half = (Number(gstRate) || 0) / 2 / 100;
  const cgst = subtotal * half;
  const sgst = subtotal * half;
  return { subtotal, cgst, sgst, grandTotal: subtotal + cgst + sgst };
}

// ── Print page (quotations/[id]/print) ──────────────────────────────────────

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
}
export const fmtLongDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// unitPrice is GST-inclusive; every print row is the pre-tax basis, so GST is stripped first.
export const exclUnitPrice = (item: QuotationFullLineItem) => item.unitPrice / (1 + (item.gstPercent || 0) / 100);

export function lineDiscountAmt(item: QuotationFullLineItem): number {
  const excl = exclUnitPrice(item);
  const gstFactor = 1 + (item.gstPercent || 0) / 100;
  if (item.discountMode === 'PERCENT') return excl * item.quantity * ((item.discountAmount || 0) / 100);
  if (item.discountMode === 'FIXED') return (item.discountAmount || 0) / gstFactor;
  return excl * item.quantity * ((item.discountPct || 0) / 100);
}

export function effectiveDiscountPct(item: QuotationFullLineItem): number {
  if (item.discountMode === 'PERCENT') return item.discountAmount || 0;
  if (item.discountMode === 'FIXED') {
    const gross = exclUnitPrice(item) * item.quantity;
    return gross > 0 ? (lineDiscountAmt(item) / gross) * 100 : 0;
  }
  return item.discountPct || 0;
}

export const taxableAmt = (item: QuotationFullLineItem) => Math.max(0, exclUnitPrice(item) * item.quantity - lineDiscountAmt(item));

export function numberToWords(num: number): string {
  if (!isFinite(num) || num < 0) return '';
  if (num === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const hundreds = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + hundreds(n % 100) : '');
  };
  const intPart = Math.floor(Math.abs(num));
  const paise = Math.round((Math.abs(num) - intPart) * 100);
  const crore = Math.floor(intPart / 10000000);
  const lakh = Math.floor((intPart % 10000000) / 100000);
  const thou = Math.floor((intPart % 100000) / 1000);
  const rest = intPart % 1000;
  const parts: string[] = [];
  if (crore > 0) parts.push(hundreds(crore) + ' Crore');
  if (lakh > 0) parts.push(hundreds(lakh) + ' Lakh');
  if (thou > 0) parts.push(hundreds(thou) + ' Thousand');
  if (rest > 0) parts.push(hundreds(rest));
  let result = 'Rupees ' + (parts.length ? parts.join(' ') : 'Zero');
  if (paise > 0) result += ' and ' + hundreds(paise) + ' Paise';
  return result + ' Only';
}

/** Derived figures the print page shows under the line table. */
export function printTotals(q: QuotationFull) {
  const lineGross = q.lineItems.reduce((s, item) => s + exclUnitPrice(item) * item.quantity, 0);
  const totalLineDiscounts = q.lineItems.reduce((s, item) => s + lineDiscountAmt(item), 0);
  const lineSubtotal = lineGross - totalLineDiscounts;
  const overallDiscAmt = q.overallDiscountMode === 'PERCENT'
    ? lineSubtotal * ((Number(q.overallDiscountAmount) || 0) / 100)
    : (Number(q.overallDiscountAmount) || 0);
  const hasLineDiscounts = totalLineDiscounts > 0;
  const hasOverallDiscount = overallDiscAmt > 0;
  const hasLegacyDiscount = !hasLineDiscounts && !hasOverallDiscount && (Number(q.discountAmount) || 0) > 0;
  const hasRoundOff = (Number(q.roundOff) || 0) !== 0;
  const showCgst = q.cgstAmount > 0 || q.cgstRate > 0;
  const showSgst = q.sgstAmount > 0 || q.sgstRate > 0;
  return { lineGross, totalLineDiscounts, overallDiscAmt, hasLineDiscounts, hasOverallDiscount, hasLegacyDiscount, hasRoundOff, showCgst, showSgst };
}

/**
 * The print page as plain text, same blocks in the same order: header, seller, customer, vehicle bar,
 * line table, words / validity / totals, notes, terms, salesperson, thank-you. (There is no PDF package
 * in the app, so this goes out through the OS share sheet.)
 */
export function buildQuotationText(q: QuotationFull): string {
  const t = printTotals(q);
  const status = STATUS_META[q.status] ?? STATUS_META.DRAFT;
  const vehicleLine = [q.vehicleBrand, q.vehicleModel].filter(Boolean).join(' ');
  const out: (string | null)[] = [];

  out.push('FAST TRACKS CAR CARE', 'Professional Auto Care Services', 'Hyderabad, Telangana', '');
  out.push(`QUOTATION ${q.quotationNumber}`, `Date: ${fmtDateTime(q.createdAt)}`);
  if (q.validUntil) out.push(`Valid Until: ${fmtLongDate(q.validUntil)}`);
  out.push(`Status: ${status.label}`, '');

  out.push('SELLER / SUPPLIER', q.companyName, `${q.companyAddress},`, `${q.companyCity}, ${q.companyState} – ${q.companyPin}`);
  out.push(`GSTIN: ${q.companyGstin}`, `State/UT Code: ${q.companyStateCode}`, `Phone: +91 ${q.companyPhone}`, `Email: ${q.companyEmail}`, '');

  out.push('QUOTE FOR', q.customerName);
  if (q.customerPhone) out.push(`Phone: ${q.customerPhone}`);
  if (q.customerEmail) out.push(`Email: ${q.customerEmail}`);
  if (q.customerAddress) out.push(q.customerAddress);
  if (q.customerGSTIN) out.push(`GSTIN: ${q.customerGSTIN}`);
  out.push('State/UT Code: 36', 'Place of Supply: TG (Telangana)', '');

  if (vehicleLine || q.vehicleNumber || q.vehicleYear || q.vehicleColour) {
    const v = ['Vehicle:'];
    if (vehicleLine) v.push(vehicleLine);
    if (q.vehicleNumber) v.push(`| Reg No: ${q.vehicleNumber}`);
    if (q.vehicleYear) v.push(`| Year: ${q.vehicleYear}`);
    if (q.vehicleColour) v.push(`| Colour: ${q.vehicleColour}`);
    out.push(v.join(' '), '');
  }

  out.push('Sr | Description of Service | Qty | Unit Price (₹) | Disc % | Taxable Amt (₹)');
  q.lineItems.forEach((item, idx) => {
    const d = effectiveDiscountPct(item);
    out.push(`${idx + 1} | ${item.description} | ${item.quantity} | ${fmt(exclUnitPrice(item))} | ${d > 0 ? `${d.toFixed(1)}%` : '—'} | ${fmt(taxableAmt(item))}`);
  });
  out.push('');

  out.push(`Amount in Words: ${numberToWords(Number(q.grandTotal) || 0)}`);
  if (q.validUntil) out.push(`Validity: This quotation is valid until ${fmtLongDate(q.validUntil)}.`);
  out.push('');

  out.push(`Gross Amount: ₹${fmt(t.lineGross)}`);
  if (t.hasLineDiscounts) out.push(`Line Discounts: -₹${fmt(t.totalLineDiscounts)}`);
  if (t.hasOverallDiscount) out.push(`Overall Discount${q.overallDiscountMode === 'PERCENT' ? ` (${q.overallDiscountAmount}%)` : ''}: -₹${fmt(t.overallDiscAmt)}`);
  if (t.hasLegacyDiscount) out.push(`Discount: -₹${fmt(q.discountAmount)}`);
  if (t.showCgst) out.push(`CGST (${q.cgstRate}%): ₹${fmt(q.cgstAmount)}`);
  if (t.showSgst) out.push(`SGST (${q.sgstRate}%): ₹${fmt(q.sgstAmount)}`);
  if (t.hasRoundOff) out.push(`Round Off: ${Number(q.roundOff) >= 0 ? '+' : ''}₹${fmt(q.roundOff)}`);
  out.push(`GRAND TOTAL: ₹${fmt(q.grandTotal)}`);
  if (t.showCgst) out.push('• All services are intra-state (Telangana). CGST + SGST applicable.');

  if (q.notes) out.push('', 'NOTES', q.notes);
  if (q.termsConditions) out.push('', 'TERMS & CONDITIONS', q.termsConditions);
  if (q.salesperson) out.push('', `Salesperson: ${q.salesperson.name}${q.salesperson.phone ? ` (${q.salesperson.phone})` : ''}`);
  out.push('', 'Thank you for considering Fasttracks Car Care.');

  return out.filter((l): l is string => l !== null).join('\n');
}
