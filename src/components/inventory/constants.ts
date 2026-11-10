import type { InventoryEffectiveStatus } from '@/types/api';

// Everything below is the dashboard Inventory page's own constants and maths
// (frontend/src/app/(dashboard)/dashboard/inventory/page.tsx), kept identical.

export const CATEGORIES = [
  'Recliners', 'PPFs', 'Sun Films', 'Detailing Accessories',
  'Perfumes', 'Off Road Accessories', 'Side Foot Steps',
  'Headrest Monitors', 'Food Trays', 'Full Matting', 'Door Visors',
  'Wheels and Tyres', 'Alloys and Rims', 'Body Kits and Bumpers',
  'Exterior Panels and Spoilers', 'Paint and Wrap Material',
  'Suspension and Steering', 'Lights and Electrical',
  'Interior Accessories', 'Engine and Performance Parts',
  'Exhaust System', 'Miscellaneous and Tools', 'Others',
];

export const IO_REASONS = ['Sale', 'Service Use', 'Self Use', 'Damaged', 'Lost', 'Other'];
export const WARRANTY_OPTIONS = ['No Warranty', 'Self Warranty', '1 Month', '3 Months', '6 Months', '1 Year', '2 Years', 'Lifelong'];
export const UNIT_OPTIONS = ['pcs', 'set', 'litre', 'kg', 'g', 'ml', 'roll', 'pair', 'box', 'self'];
export const PAYMENT_TERMS = ['Cash on Delivery', 'Advance Payment', 'Credit 15 Days', 'Credit 30 Days', 'Credit 60 Days', 'UPI', 'Cheque', 'NEFT/RTGS'];
export const GST_SLABS = [
  { value: '0', label: '0% (Exempt)' },
  { value: '5', label: '5%' },
  { value: '12', label: '12%' },
  { value: '18', label: '18%' },
  { value: '28', label: '28%' },
];

export const STATUS_CFG: Record<InventoryEffectiveStatus, { label: string; bg: string; text: string }> = {
  ACTIVE: { label: 'Active', bg: 'rgba(34,197,94,0.15)', text: '#16a34a' },
  OUT_OF_STOCK: { label: 'Out of Stock', bg: 'rgba(245,158,11,0.15)', text: '#d97706' },
  EXPIRED: { label: 'Expired', bg: 'rgba(239,68,68,0.15)', text: '#dc2626' },
  DISCONTINUED: { label: 'Discontinued', bg: 'rgba(107,114,128,0.2)', text: '#6b7280' },
};

export const ITEM_OUT_STATUS_CFG: Record<string, { label: string; bg: string; text: string }> = {
  DEDUCTED: { label: 'Deducted', bg: 'rgba(34,197,94,0.15)', text: '#16a34a' },
  OUT_OF_STOCK_AT_TIME: { label: 'Out of stock', bg: 'rgba(245,158,11,0.15)', text: '#d97706' },
  ITEM_NOT_IN_INVENTORY: { label: 'Not in inventory', bg: 'rgba(239,68,68,0.15)', text: '#dc2626' },
};

export const BILL_RULES = {
  allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  maxSizeBytes: 20 * 1024 * 1024,
};
export const IMAGE_RULES = {
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  maxSizeBytes: 15 * 1024 * 1024,
};

// ─── Formatting ─────────────────────────────────────────────────────────────
export const fmtC = (n?: number | null) => (n != null ? `₹${n.toLocaleString('en-IN')}` : '—');
export const fmtC2 = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtD = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const todayYmd = () => new Date().toISOString().slice(0, 10);

// ─── Compatibility ──────────────────────────────────────────────────────────
export interface CarEntry { make: string; model: string; yearFrom: string; yearTo: string }

export function carLabel(c: CarEntry) {
  return [c.make, c.model, c.yearFrom || c.yearTo ? `(${c.yearFrom}–${c.yearTo})` : ''].filter(Boolean).join(' ');
}

export function compatValue(mode: 'UNIVERSAL' | 'SPECIFIC', cars: CarEntry[]) {
  if (mode === 'UNIVERSAL') return 'Universal';
  return cars.length === 0 ? 'Specific (unspecified)' : cars.map(carLabel).join(', ');
}

// ─── Logistics maths (calcLogistics / buildReceiptNotes) ────────────────────
export interface LogisticsState {
  barcode: string;
  sellerName: string; sellerCity: string; orderPlacedTo: string; contactPhone: string;
  quantityReceived: string; dealerPrice: string;
  logisticsPartner1: string; logisticsCharge1: string;
  logisticsPartner2: string; logisticsCharge2: string;
  // '' = not chosen yet; blocks submission when a receipt is being created.
  gstPercent: string;
  billUrl: string; billFileName: string;
  paymentTerms: string; orderDate: string; eta: string;
  storeLocation: string; dateAdded: string;
  forceNew: boolean;
}

export function defaultLogistics(): LogisticsState {
  return {
    barcode: '', sellerName: '', sellerCity: '', orderPlacedTo: '', contactPhone: '',
    quantityReceived: '', dealerPrice: '', logisticsPartner1: '', logisticsCharge1: '',
    logisticsPartner2: 'Porter', logisticsCharge2: '', gstPercent: '', billUrl: '', billFileName: '',
    paymentTerms: 'Cash on Delivery', orderDate: '', eta: '', storeLocation: '', dateAdded: todayYmd(), forceNew: true,
  };
}

export interface CalcResult {
  costPerUnit: number; marginPerUnit: number; marginPct: string; totalLogistics: number; qty: number; dealerPrice: number;
}

export function calcLogistics(l: LogisticsState, mrpNum: number): CalcResult {
  const qty = parseFloat(l.quantityReceived) || 0;
  const dealerPrice = parseFloat(l.dealerPrice) || 0;
  const lc1 = parseFloat(l.logisticsCharge1) || 0;
  const lc2 = parseFloat(l.logisticsCharge2) || 0;
  const gstPct = parseFloat(l.gstPercent) || 0;
  const totalLogistics = lc1 + lc2;
  const logisticsPerUnit = qty > 0 ? totalLogistics / qty : 0;
  const gstAmount = (dealerPrice * gstPct) / 100;
  const costPerUnit = dealerPrice + logisticsPerUnit + gstAmount;
  const marginPerUnit = mrpNum > 0 ? mrpNum - costPerUnit : 0;
  const marginPct = mrpNum > 0 && costPerUnit > 0 ? ((marginPerUnit / mrpNum) * 100).toFixed(1) : '--';
  return { costPerUnit, marginPerUnit, marginPct, totalLogistics, qty, dealerPrice };
}

export function buildReceiptNotes(l: LogisticsState): string {
  const lc1 = parseFloat(l.logisticsCharge1) || 0;
  const lc2 = parseFloat(l.logisticsCharge2) || 0;
  return [
    l.sellerCity ? `Seller city: ${l.sellerCity}` : '',
    l.orderPlacedTo ? `Order placed to: ${l.orderPlacedTo}` : '',
    l.logisticsPartner1 ? `Logistics 1: ${l.logisticsPartner1}${lc1 ? ` (₹${lc1})` : ''}` : '',
    l.logisticsPartner2 && lc2 ? `Logistics 2: ${l.logisticsPartner2} (₹${lc2})` : '',
    l.paymentTerms ? `Payment: ${l.paymentTerms}` : '',
    l.eta ? `ETA: ${l.eta}` : '',
  ].filter(Boolean).join('\n');
}

// The receipt body both the wizard and Add Stock POST (their payloads differ
// only in forceNew and in how the receipt/order dates are chosen).
export function buildReceiptBody(l: LogisticsState, calc: CalcResult, mrpNum: number, dates: { orderDate?: string; receiptDate?: string }, forceNew?: boolean) {
  const lc2 = parseFloat(l.logisticsCharge2) || 0;
  const lpNames = [l.logisticsPartner1, l.logisticsPartner2 && lc2 ? l.logisticsPartner2 : ''].filter(Boolean).join(' + ');
  return {
    ...(forceNew === undefined ? {} : { forceNew }),
    barcode: l.barcode || undefined,
    sellerName: [l.sellerName, l.orderPlacedTo].filter(Boolean).join(' / ') || undefined,
    sellerContact: l.contactPhone || undefined,
    quantityReceived: parseFloat(l.quantityReceived),
    dealerPrice: calc.dealerPrice || undefined,
    costPerUnit: calc.costPerUnit > 0 ? calc.costPerUnit : undefined,
    mrpAtReceipt: mrpNum || undefined,
    gstPercent: l.gstPercent !== '' ? parseFloat(l.gstPercent) : undefined,
    billUrl: l.billUrl || undefined,
    orderDate: dates.orderDate,
    receiptDate: dates.receiptDate,
    logisticsPartner: lpNames || undefined,
    logisticsCharge: calc.totalLogistics > 0 ? calc.totalLogistics : undefined,
    notes: buildReceiptNotes(l) || undefined,
    storeLocation: l.storeLocation || undefined,
  };
}

export function verifyState(lastVerifiedAt?: string | null): 'unverified' | 'verified' | 'soon' {
  if (!lastVerifiedAt) return 'unverified';
  const days = (Date.now() - new Date(lastVerifiedAt).getTime()) / 86400000;
  return days <= 30 ? 'verified' : 'soon';
}
