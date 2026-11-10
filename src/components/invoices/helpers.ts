import { numberToWords } from '@/components/quotations/helpers';
import type { InvoiceFull, InvoiceFullLine, InvoicePaymentHistoryRow } from '@/types/api';

// Ports of the dashboard's invoice helpers (invoices/page.tsx, invoices/[id]/print/page.tsx): same labels,
// same status colours, same math, same wording.
export const WIDE_MIN = 560;
export const PAGE_SIZE = 20;
export const GST_RATES = [0, 5, 12, 18, 28];

export const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  DRAFT: { label: 'Draft', bg: 'rgba(100,116,139,0.15)', color: '#64748b' },
  ACTIVE: { label: 'Active', bg: 'rgba(59,130,246,0.15)', color: '#2563eb' },
  ISSUED: { label: 'Issued', bg: 'rgba(59,130,246,0.15)', color: '#2563eb' },
  PAID: { label: 'Paid', bg: 'rgba(34,197,94,0.15)', color: '#15803d' },
  PARTIAL: { label: 'Partially Paid', bg: 'rgba(245,158,11,0.15)', color: '#b45309' },
  CANCELLED: { label: 'Cancelled', bg: 'rgba(239,68,68,0.15)', color: '#b91c1c' },
  OVERDUE: { label: 'Overdue', bg: 'rgba(239,68,68,0.15)', color: '#b91c1c' },
};

export const PAYMENT_MODE_LABELS: Record<string, string> = {
  CASH: 'Cash', FTCC_KOTAK: 'Kotak', FTCC_YES_BANK: 'Yes Bank', FTCC_UPI_ICICI: 'UPI/ICICI', CARD: 'Card', CHEQUE: 'Cheque',
  NIVED_ACCOUNT: "Nived's A/c", OTHER: 'Other', SPLIT: 'Split Payment', UPI: 'UPI / QR', BANK_TRANSFER: 'Bank Transfer', CREDIT: 'Credit',
};

export const INVOICE_STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'ISSUED,PARTIAL,OVERDUE', label: 'Unpaid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export function fmtINR(n: number | null | undefined) {
  const v = Number(n) || 0;
  return `${v < 0 ? '-' : ''}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`;
}

/** Two-decimal rupee figure, as the print page shows (`fmt`). */
export const fmt2 = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function fmtPrintDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${date}, ${time}`;
}

export const paymentLabel = (mode?: string | null) => (mode ? (PAYMENT_MODE_LABELS[mode] ?? mode) : '—');

/** Dashboard calcLineAmount for the edit form (qty × price less a % discount). */
export const calcEditLine = (qty: number, price: number, discPct: number) => parseFloat((qty * price * (1 - discPct / 100)).toFixed(2));

// ── Print page ──────────────────────────────────────────────────────────────

const lineDiscount = (li: InvoiceFullLine) => {
  const gross = li.unitPrice * li.quantity;
  if (li.discountMode === 'PERCENT') return gross * ((li.discountAmount || 0) / 100);
  if (li.discountMode === 'FIXED') return li.discountAmount || 0;
  return gross * ((li.discountPct || 0) / 100);
};

/** Only PAID and PARTIAL invoices can be printed (the dashboard's status gate). */
export const canPrint = (status: string) => status === 'PAID' || status === 'PARTIAL';

export const PRINT_LOCK_TEXT = (status: string) =>
  `This invoice is ${status} — the full invoice cannot be printed or sent until at least a payment has been recorded. Only the Advance Receipt (AR-*) is available at this stage.`;

/**
 * The print page as plain text, blocks in the print page's order: header, seller, buyer, vehicle, line table,
 * amount in words, payment details, totals, GST notes, notes, terms, salesperson, footer.
 */
export function buildInvoiceText(inv: InvoiceFull, history: InvoicePaymentHistoryRow[]): string {
  const lines = inv.lineItems ?? [];
  const advancePaid = Number(inv.paidAmount) || 0;
  const isAdvance = advancePaid > 0 && lines.length === 0;
  const status = STATUS_META[inv.status]?.label ?? inv.status;
  const vehicleLine = [inv.vehicleBrand, inv.vehicleModel].filter(Boolean).join(' ');
  const out: string[] = [];

  out.push('FAST TRACKS CAR CARE', 'Professional Auto Care Services', 'Hyderabad, Telangana', '');
  out.push(isAdvance ? 'ADVANCE RECEIPT' : 'INVOICE', inv.invoiceNumber, `Date: ${fmtPrintDateTime(inv.createdAt)}`, inv.status === 'PAID' ? 'PAID' : status.toUpperCase(), '');

  out.push('SELLER / SUPPLIER', inv.companyName ?? 'FAST TRACKS CAR CARE', `${inv.companyAddress ?? ''},`, `${inv.companyCity ?? ''}, ${inv.companyState ?? ''} – ${inv.companyPin ?? ''}`);
  out.push(`State/UT Code: ${inv.companyStateCode ?? ''}`, `Phone: +91 ${inv.companyPhone ?? ''}`, `Email: ${inv.companyEmail ?? ''}`, '');

  out.push('BILL TO / BUYER', inv.customerName || '—');
  if (inv.customerPhone) out.push(`Phone: ${inv.customerPhone}`);
  if (inv.customerEmail) out.push(`Email: ${inv.customerEmail}`);
  if (inv.customerAddress) out.push(inv.customerAddress);
  if (inv.customerGstin) out.push(`GSTIN: ${inv.customerGstin}`);
  out.push('State/UT Code: 36', 'Place of Supply: TG (Telangana)', '');

  if (vehicleLine || inv.vehicleNumber || inv.vehicleYear || inv.vehicleColour) {
    const v = ['Vehicle:'];
    if (vehicleLine) v.push(vehicleLine);
    if (inv.vehicleNumber) v.push(`| Reg No: ${inv.vehicleNumber}`);
    if (inv.vehicleYear) v.push(`| Year: ${inv.vehicleYear}`);
    if (inv.vehicleColour) v.push(`| Colour: ${inv.vehicleColour}`);
    out.push(v.join(' '), '');
  }

  if (isAdvance) {
    out.push('Advance Payment', 'This is an advance payment receipt. Final invoice will be generated upon completion of service.', `₹${fmt2(advancePaid)}`, '');
  } else {
    out.push('Sr | Description of Service | HSN/SAC | Qty | Unit Price (₹) | Disc % | Amount (₹)');
    lines.forEach((li, i) => {
      const gross = li.unitPrice * li.quantity;
      const disc = lineDiscount(li);
      const pct = gross > 0 ? (disc / gross) * 100 : 0;
      out.push(`${i + 1} | ${li.description} | ${li.hsnSacCode || '998714'} | ${li.quantity} | ${fmt2(li.unitPrice)} | ${pct > 0 ? `${pct.toFixed(1)}%` : '—'} | ${fmt2(Math.max(0, gross - disc))}`);
    });
    out.push('');
  }

  out.push(`Amount in Words: ${numberToWords(isAdvance ? advancePaid : Number(inv.grandTotal) || 0)}`, '');

  out.push('PAYMENT DETAILS');
  if (inv.paymentRef) out.push(`Reference / UTR: ${inv.paymentRef}`);
  if (isAdvance) {
    out.push(`Advance Paid: ₹${fmt2(advancePaid)}`, 'Balance Due: ₹0.00 (for this receipt)', 'Note: Balance payable on final invoice');
  } else {
    history.forEach((p) => {
      out.push(`${new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}${p._type === 'advance' ? ' (ADV)' : ''}: ₹${fmt2(Number(p.amount))}`);
    });
    out.push(`${history.length > 1 ? 'Total Paid' : 'Amount Paid'}: ₹${fmt2(inv.paidAmount)}`, `Balance Due: ₹${fmt2(inv.balanceDue)}`);
  }
  if (inv.paymentNote) out.push(`Note: ${inv.paymentNote}`);
  out.push('');

  const lineGross = lines.reduce((s, li) => s + li.unitPrice * li.quantity, 0);
  const lineDisc = lines.reduce((s, li) => s + lineDiscount(li), 0);
  const overall = inv.overallDiscountMode === 'PERCENT' ? (lineGross - lineDisc) * ((Number(inv.overallDiscountAmount) || 0) / 100) : (Number(inv.overallDiscountAmount) || 0);
  const legacy = lineDisc <= 0 && overall <= 0 && (Number(inv.discountAmount) || 0) > 0;
  const cgst = Number(inv.cgstAmount ?? inv.cgst) || 0;
  const sgst = Number(inv.sgstAmount ?? inv.sgst) || 0;
  const showCgst = cgst > 0 || (Number(inv.cgstRate) || 0) > 0;
  const showSgst = sgst > 0 || (Number(inv.sgstRate) || 0) > 0;
  const rate = (r?: number | null) => (r != null ? ` (${r}%)` : '');
  out.push(`Gross Amount: ₹${fmt2(lineGross)}`);
  if (lineDisc > 0) out.push(`Line Discounts: -₹${fmt2(lineDisc)}`);
  if (overall > 0) out.push(`Overall Discount${inv.overallDiscountMode === 'PERCENT' ? ` (${inv.overallDiscountAmount}%)` : ''}: -₹${fmt2(overall)}`);
  if (legacy) out.push(`Discount: -₹${fmt2(inv.discountAmount)}`);
  if (showCgst) out.push(`CGST${rate(inv.cgstRate)}: ₹${fmt2(cgst)}`);
  if (showSgst) out.push(`SGST${rate(inv.sgstRate)}: ₹${fmt2(sgst)}`);
  if ((Number(inv.roundOff) || 0) !== 0) out.push(`Round Off: ${Number(inv.roundOff) >= 0 ? '+' : ''}₹${fmt2(inv.roundOff)}`);
  out.push(`GRAND TOTAL: ₹${fmt2(inv.grandTotal)}`, '');

  if (showCgst) out.push('• All services are intra-state (Telangana). CGST + SGST applicable.');
  out.push('• HSN/SAC: 998714 — Motor Vehicle Maintenance & Repair', '• Supply of service — not a goods invoice.');
  if (inv.notes) out.push('', 'NOTES', inv.notes);
  if (inv.termsConditions) out.push('', 'TERMS & CONDITIONS', inv.termsConditions);
  if (inv.salesperson) out.push('', `Salesperson: ${inv.salesperson.name}${inv.salesperson.phone ? ` (${inv.salesperson.phone})` : ''}`);
  out.push('', 'Terms & Conditions: No warranty. No return. No exchange. No cancellation. In any case, even if a product becomes eligible for a refund, the refund will take a minimum of 30 days to process.', 'Thank you for choosing Fasttracks Car Care.');
  return out.join('\n');
}
