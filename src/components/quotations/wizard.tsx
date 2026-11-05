import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createQuotationRaw, fetchQuotationStaff, getErrorMessage, lookupQuotationVehicle, verifyQuotationGstin } from '@/lib/api';
import type { QuotationGstData, QuotationStaffOption } from '@/types/api';

import { calcLineAmount, cartTotals, fmt, type QLine, type ServiceCharge } from './helpers';
import { LineItemPicker, NumField, Panel, SalespersonField, TotalRow } from './parts';

// Dashboard quotations/new/page.tsx: 3 steps — Customer & Vehicle, Items, Review & Generate.
interface GstData {
  businessName: string; address: string; stateName: string; legalName?: string; tradeName?: string;
  gstinStatus?: string; taxPayerType?: string; dateOfRegistration?: string; isActive?: boolean;
}

export interface WizardState {
  step: 1 | 2 | 3;
  customerType: 'INDIVIDUAL' | 'BUSINESS';
  customerName: string; customerPhone: string; customerEmail: string; customerAddress: string; customerGSTIN: string;
  gstVerified: boolean; gstData: GstData | null;
  vehicleRegNo: string; vehicleMake: string; vehicleModel: string; vehicleYear: string; vehicleColour: string; vehicleFuelType: string;
  vehicleFetched: boolean;
  cartItems: QLine[]; serviceCharges: ServiceCharge[];
  overallDiscountAmount: number; overallDiscountMode: 'PERCENT' | 'FIXED';
  validUntil: string; notes: string; termsConditions: string;
  salespersonId: string | null;
}

// The dashboard keeps the last customer in sessionStorage ("Pre-filled from previous customer"); there is no
// session storage on a phone, so it is kept in memory for as long as the app stays open.
type SavedCustomer = Pick<WizardState, 'customerType' | 'customerName' | 'customerPhone' | 'customerEmail' | 'customerAddress' | 'customerGSTIN' | 'gstVerified' | 'gstData'>;
const memory: { value: Record<string, SavedCustomer | null> } = { value: {} };
const getSaved = (key: string) => memory.value[key] ?? null;
const setSaved = (key: string, v: SavedCustomer | null) => { memory.value = { ...memory.value, [key]: v }; };

export function initialState(salespersonId: string | null, memoryKey = 'quotation'): WizardState {
  const d = getSaved(memoryKey);
  return {
    step: 1, customerType: d?.customerType || 'INDIVIDUAL',
    customerName: d?.customerName || '', customerPhone: d?.customerPhone || '', customerEmail: d?.customerEmail || '',
    customerAddress: d?.customerAddress || '', customerGSTIN: d?.customerGSTIN || '', gstVerified: d?.gstVerified || false, gstData: d?.gstData || null,
    vehicleRegNo: '', vehicleMake: '', vehicleModel: '', vehicleYear: '', vehicleColour: '', vehicleFuelType: '', vehicleFetched: false,
    cartItems: [], serviceCharges: [], overallDiscountAmount: 0, overallDiscountMode: 'PERCENT',
    validUntil: '', notes: '', termsConditions: '', salespersonId,
  };
}

export function StepIndicator({ step, onGoStep, wide, steps = ['Customer & Vehicle', 'Items', 'Review & Generate'] }: { step: number; onGoStep: (s: 1 | 2 | 3 | 4) => void; wide: boolean; steps?: string[] }) {
  const theme = useTheme();
  return (
    <View style={styles.stepRow}>
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const active = step === n;
        const done = step > n;
        const bg = active ? theme.primary : done ? 'rgba(34,197,94,0.15)' : theme.backgroundElement;
        const fg = active ? '#fff' : done ? '#15803d' : theme.textMuted;
        return (
          <View key={n} style={[styles.stepItem, !wide && !active && styles.stepCompact]}>
            <Pressable onPress={() => (done ? onGoStep(n) : undefined)} disabled={!done} accessibilityRole="button" style={[styles.stepBtn, { backgroundColor: bg }]}>
              <View style={[styles.stepNum, { backgroundColor: active ? '#fff' : done ? '#22c55e' : theme.border }]}>
                <ThemedText style={[styles.stepNumText, { color: active ? theme.primary : done ? '#fff' : theme.textMuted }]}>{done ? '✓' : n}</ThemedText>
              </View>
              {wide || active ? <ThemedText numberOfLines={1} style={[styles.stepLabel, { color: fg }]}>{label}</ThemedText> : null}
            </Pressable>
            {i < steps.length - 1 ? <View style={[styles.stepLine, { backgroundColor: step > n ? '#4ade80' : theme.border }]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function Seg({ value, onChange }: { value: 'INDIVIDUAL' | 'BUSINESS'; onChange: (v: 'INDIVIDUAL' | 'BUSINESS') => void }) {
  const theme = useTheme();
  const opts: ['INDIVIDUAL' | 'BUSINESS', string][] = [['INDIVIDUAL', 'Individual'], ['BUSINESS', 'Business / Company']];
  return (
    <View style={[styles.seg, { borderColor: theme.border }]}>
      {opts.map(([k, label], i) => (
        <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="button" accessibilityState={{ selected: value === k }}
          style={[styles.segBtn, { backgroundColor: value === k ? '#2563eb' : theme.surface }, i > 0 && { borderLeftWidth: 1, borderLeftColor: theme.border }]}>
          <ThemedText style={[styles.segText, { color: value === k ? '#fff' : theme.text }]}>{label}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

export function Step1({ state, set, onNext, wide, memoryKey = 'quotation' }: { state: WizardState; set: (p: Partial<WizardState>) => void; onNext: () => void; wide: boolean; memoryKey?: string }) {
  const theme = useTheme();
  const [gstLoading, setGstLoading] = useState(false);
  const [gstError, setGstError] = useState('');
  const [vehicleLoading, setVehicleLoading] = useState(false);
  const [vehicleError, setVehicleError] = useState('');
  const [showGstin, setShowGstin] = useState(!!state.customerGSTIN && state.customerType !== 'BUSINESS');
  const [hasSaved, setHasSaved] = useState(() => getSaved(memoryKey) !== null);

  const verifyGST = async () => {
    setGstLoading(true); setGstError('');
    try {
      const gd: QuotationGstData = await verifyQuotationGstin(state.customerGSTIN);
      const bizName = gd.tradeName || gd.legalName || gd.businessName || '';
      const bizAddr = gd.address || '';
      const isActive = gd.isActive !== false;
      set({
        gstVerified: true,
        gstData: {
          businessName: bizName, address: bizAddr, stateName: gd.stateName || '', legalName: gd.legalName || '', tradeName: gd.tradeName || '',
          gstinStatus: gd.gstinStatus || (isActive ? 'Active' : 'Inactive'), taxPayerType: gd.taxPayerType || '',
          dateOfRegistration: gd.dateOfRegistration || '', isActive,
        },
        ...(bizName ? { customerName: bizName } : {}),
        ...(bizAddr ? { customerAddress: bizAddr } : {}),
      });
    } catch (e) { setGstError(getErrorMessage(e, 'GST verification failed')); }
    finally { setGstLoading(false); }
  };

  const fetchVehicle = async () => {
    if (!state.vehicleRegNo) return;
    setVehicleLoading(true); setVehicleError('');
    try {
      const v = await lookupQuotationVehicle(state.vehicleRegNo);
      set({ vehicleMake: v.make || '', vehicleModel: v.model || '', vehicleYear: v.year != null ? String(v.year) : '', vehicleFuelType: v.fuelType || '', vehicleFetched: !!v.make });
      if (!v.make) setVehicleError('Vehicle not found — please fill manually');
    } catch (e) { setVehicleError(getErrorMessage(e, 'Lookup failed')); }
    finally { setVehicleLoading(false); }
  };

  const canNext = state.customerType === 'INDIVIDUAL' ? !!(state.customerName.trim() && state.customerPhone.trim()) : !!state.customerName.trim();
  const gd = state.gstData;
  const bad = gd?.isActive === false;
  const box = bad ? { bg: 'rgba(239,68,68,0.1)', fg: '#b91c1c' } : gd?.businessName ? { bg: 'rgba(34,197,94,0.12)', fg: '#15803d' } : { bg: 'rgba(245,158,11,0.12)', fg: '#b45309' };
  const pair = (a: React.ReactNode, b: React.ReactNode) => (wide ? <View style={styles.row}><View style={styles.flex1}>{a}</View><View style={styles.flex1}>{b}</View></View> : <>{a}{b}</>);

  return (
    <View style={styles.gap}>
      <View>
        <ThemedText themeColor="textSecondary" style={styles.label}>Customer Type</ThemedText>
        <Seg value={state.customerType} onChange={(k) => set({ customerType: k, gstVerified: false, gstData: null })} />
      </View>

      {hasSaved ? (
        <View style={[styles.note, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
          <ThemedText style={[styles.noteText, { color: '#2563eb' }]}>Pre-filled from previous customer</ThemedText>
          <Pressable onPress={() => {
            setSaved(memoryKey, null); setHasSaved(false);
            set({ customerName: '', customerPhone: '', customerEmail: '', customerAddress: '', customerGSTIN: '', gstVerified: false, gstData: null });
          }} hitSlop={8}>
            <ThemedText style={[styles.noteLink, { color: '#2563eb' }]}>Different customer?</ThemedText>
          </Pressable>
        </View>
      ) : null}

      {state.customerType === 'BUSINESS' ? (
        <Panel>
          <View style={styles.gap}>
            <View style={styles.row}>
              <View style={styles.flex1}>
                <Input label="GSTIN" value={state.customerGSTIN} maxLength={15} placeholder="22AAAAA0000A1Z5" editable={!state.gstVerified} autoCapitalize="characters" autoCorrect={false}
                  onChangeText={(t) => set({ customerGSTIN: t.toUpperCase(), gstVerified: false, gstData: null })} />
              </View>
              <View style={styles.btnCol}>
                <Button variant="secondary" loading={gstLoading} disabled={state.customerGSTIN.length !== 15 || state.gstVerified} onPress={verifyGST}>Verify</Button>
              </View>
              {state.gstVerified ? <View style={styles.btnCol}><Button variant="ghost" onPress={() => set({ gstVerified: false, gstData: null })}>Edit</Button></View> : null}
            </View>
            {gstError ? <ThemedText themeColor="danger" style={styles.small}>{gstError}</ThemedText> : null}
            {gd ? (
              <View style={[styles.gstBox, { backgroundColor: box.bg }]}>
                {gd.gstinStatus ? (
                  <View style={styles.rowCenter}>
                    <View style={[styles.badge, { backgroundColor: bad ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)' }]}>
                      <ThemedText style={[styles.badgeText, { color: bad ? '#b91c1c' : '#15803d' }]}>{!bad ? '● Active' : `● ${gd.gstinStatus}`}</ThemedText>
                    </View>
                    {gd.taxPayerType ? <View style={[styles.badge, { borderWidth: 1, borderColor: theme.border }]}><ThemedText themeColor="textMuted" style={styles.badgeText}>{gd.taxPayerType}</ThemedText></View> : null}
                  </View>
                ) : null}
                {bad ? <ThemedText style={[styles.small, { color: '#b91c1c', fontFamily: FontWeights.semiBold }]}>⚠ This GSTIN is inactive — proceed with caution</ThemedText> : null}
                {gd.businessName
                  ? <ThemedText style={{ color: box.fg, fontFamily: FontWeights.semiBold, fontSize: 14 }}>{gd.businessName}</ThemedText>
                  : <ThemedText style={[styles.small, { color: box.fg, fontFamily: FontWeights.medium }]}>⚠ Company name not found in GST database — please type it in the Name field below</ThemedText>}
                {gd.legalName && gd.legalName !== gd.businessName ? <ThemedText themeColor="textMuted" style={styles.small}>Legal: {gd.legalName}</ThemedText> : null}
                {gd.address ? <ThemedText style={[styles.small, { color: box.fg }]}>{gd.address}</ThemedText> : null}
                {gd.stateName ? <ThemedText style={[styles.small, { color: box.fg }]}>{gd.stateName}</ThemedText> : null}
                {gd.dateOfRegistration ? <ThemedText themeColor="textMuted" style={styles.small}>Registered: {gd.dateOfRegistration}</ThemedText> : null}
              </View>
            ) : null}
          </View>
        </Panel>
      ) : !showGstin ? (
        <Pressable onPress={() => setShowGstin(true)} accessibilityRole="button" hitSlop={8}>
          <ThemedText style={{ color: '#2563eb', fontSize: 14 }}>+ Add GSTIN</ThemedText>
        </Pressable>
      ) : (
        <Panel>
          <View style={styles.row}>
            <View style={styles.flex1}>
              <Input label="GSTIN (optional)" value={state.customerGSTIN} maxLength={15} placeholder="22AAAAA0000A1Z5" autoCapitalize="characters" autoCorrect={false}
                onChangeText={(t) => set({ customerGSTIN: t.toUpperCase() })} />
            </View>
            <Pressable onPress={() => { setShowGstin(false); set({ customerGSTIN: '' }); }} hitSlop={10} accessibilityLabel="Remove GSTIN" style={styles.x}>
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </Pressable>
          </View>
        </Panel>
      )}

      {pair(
        <Input label="Name *" value={state.customerName} onChangeText={(t) => set({ customerName: t })} placeholder="Customer name" />,
        <Input label="Phone *" value={state.customerPhone} onChangeText={(t) => set({ customerPhone: t })} placeholder="9876543210" keyboardType="phone-pad" />,
      )}
      {pair(
        <Input label="Email (optional)" value={state.customerEmail} onChangeText={(t) => set({ customerEmail: t })} placeholder="customer@email.com" keyboardType="email-address" autoCapitalize="none" />,
        <Input label="Address" value={state.customerAddress} onChangeText={(t) => set({ customerAddress: t })} placeholder="Address" />,
      )}

      <View style={[styles.vehicle, { borderColor: theme.border }]}>
        <ThemedText style={styles.vehicleTitle}>Vehicle <ThemedText themeColor="textMuted" style={styles.small}>(optional)</ThemedText></ThemedText>
        <View style={styles.row}>
          <View style={styles.flex1}>
            <Input value={state.vehicleRegNo} placeholder="TS09AB1234" editable={!state.vehicleFetched} autoCapitalize="characters" autoCorrect={false}
              onChangeText={(t) => set({ vehicleRegNo: t.toUpperCase(), vehicleFetched: false })} />
          </View>
          <View style={styles.btnCol}><Button variant="secondary" loading={vehicleLoading} disabled={!state.vehicleRegNo || state.vehicleFetched} onPress={fetchVehicle}>Fetch</Button></View>
          {state.vehicleFetched ? (
            <View style={styles.btnCol}>
              <Button variant="ghost" onPress={() => set({ vehicleFetched: false, vehicleMake: '', vehicleModel: '', vehicleYear: '', vehicleColour: '', vehicleFuelType: '' })}>Edit</Button>
            </View>
          ) : null}
        </View>
        {vehicleError ? <ThemedText style={[styles.small, { color: '#f97316' }]}>{vehicleError}</ThemedText> : null}
        <View style={styles.row}>
          <View style={styles.flex1}><Input label="Brand" value={state.vehicleMake} editable={!state.vehicleFetched} onChangeText={(t) => set({ vehicleMake: t })} /></View>
          <View style={styles.flex1}><Input label="Model" value={state.vehicleModel} editable={!state.vehicleFetched} onChangeText={(t) => set({ vehicleModel: t })} /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.flex1}><Input label="Year" value={state.vehicleYear} editable={!state.vehicleFetched} keyboardType="number-pad" onChangeText={(t) => set({ vehicleYear: t })} /></View>
          <View style={styles.flex1}><Input label="Colour" value={state.vehicleColour} editable={!state.vehicleFetched} onChangeText={(t) => set({ vehicleColour: t })} /></View>
          <View style={styles.flex1}><Input label="Fuel" value={state.vehicleFuelType} editable={!state.vehicleFetched} onChangeText={(t) => set({ vehicleFuelType: t })} /></View>
        </View>
      </View>

      <View style={styles.endRow}>
        <Button disabled={!canNext} onPress={() => {
          setSaved(memoryKey, {
            customerType: state.customerType, customerName: state.customerName, customerPhone: state.customerPhone,
            customerEmail: state.customerEmail, customerAddress: state.customerAddress, customerGSTIN: state.customerGSTIN,
            gstVerified: state.gstVerified, gstData: state.gstData,
          });
          onNext();
        }}>Next →</Button>
      </View>
    </View>
  );
}

function Step2({ state, set, staff, onBack, onNext, wide }: {
  state: WizardState; set: (p: Partial<WizardState>) => void; staff: QuotationStaffOption[]; onBack: () => void; onNext: () => void; wide: boolean;
}) {
  const theme = useTheme();
  const totals = cartTotals(state.cartItems, state.serviceCharges, state.overallDiscountAmount, state.overallDiscountMode);
  const updateService = (id: string, patch: Partial<ServiceCharge>) => set({ serviceCharges: state.serviceCharges.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  return (
    <View style={styles.gap}>
      <LineItemPicker items={state.cartItems} onChange={(items) => set({ cartItems: items })} wide={wide} />

      <View style={styles.gap}>
        <View style={styles.between}>
          <ThemedText themeColor="textSecondary" style={styles.sectionLabel}>Service Charges</ThemedText>
          <Button variant="ghost" size="sm" onPress={() => set({ serviceCharges: [...state.serviceCharges, { id: Date.now().toString(), label: '', amount: 0 }] })}>+ Add</Button>
        </View>
        {state.serviceCharges.map((sc) => (
          <View key={sc.id} style={styles.rowCenter}>
            <View style={styles.flex1}><Input value={sc.label} placeholder="e.g. Labour charge" onChangeText={(t) => updateService(sc.id, { label: t })} /></View>
            <NumField value={sc.amount} onChange={(n) => updateService(sc.id, { amount: n })} placeholder="0.00" width={110} />
            <Pressable onPress={() => set({ serviceCharges: state.serviceCharges.filter((s) => s.id !== sc.id) })} hitSlop={10} accessibilityLabel="Remove service charge">
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </Pressable>
          </View>
        ))}
      </View>

      <SalespersonField staff={staff} value={state.salespersonId} onChange={(id) => set({ salespersonId: id })} />

      {state.cartItems.length > 0 ? (
        <Panel>
          <View style={styles.rowCenter}>
            <ThemedText themeColor="textSecondary" style={styles.small}>Overall Discount:</ThemedText>
            <Pressable onPress={() => set({ overallDiscountMode: state.overallDiscountMode === 'PERCENT' ? 'FIXED' : 'PERCENT', overallDiscountAmount: 0 })}
              accessibilityRole="button" accessibilityLabel="Toggle overall discount mode"
              style={[styles.modeBtn, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <ThemedText themeColor="textMuted" style={{ fontSize: 14 }}>{state.overallDiscountMode === 'PERCENT' ? '%' : '₹'}</ThemedText>
            </Pressable>
            <NumField value={state.overallDiscountAmount} onChange={(n) => set({ overallDiscountAmount: n })} placeholder="0" width={96} />
          </View>
          {state.overallDiscountAmount > 0 || totals.totalLineDiscounts > 0 ? (
            <ThemedText style={[styles.small, { color: '#16a34a', textAlign: 'right', marginTop: 4 }]}>Saving ₹{fmt(totals.totalLineDiscounts + totals.overallDiscAmt)}</ThemedText>
          ) : null}
        </Panel>
      ) : null}

      {state.cartItems.length > 0 ? <Totals totals={totals} /> : null}

      <View style={styles.between}>
        <Button variant="secondary" onPress={onBack}>← Back</Button>
        <Button disabled={state.cartItems.length === 0} onPress={onNext}>Review →</Button>
      </View>
    </View>
  );
}

export function Totals({ totals }: { totals: ReturnType<typeof cartTotals> }) {
  return (
    <Panel>
      <TotalRow label="Subtotal" value={`₹${fmt(totals.lineSubtotal)}`} />
      {totals.totalLineDiscounts > 0 ? <TotalRow label="Line discounts" value={`-₹${fmt(totals.totalLineDiscounts)}`} color="#ea580c" /> : null}
      {totals.overallDiscAmt > 0 ? <TotalRow label="Overall discount" value={`-₹${fmt(totals.overallDiscAmt)}`} color="#ea580c" /> : null}
      <TotalRow label="CGST" value={`₹${fmt(totals.cgst)}`} />
      <TotalRow label="SGST" value={`₹${fmt(totals.sgst)}`} />
      {totals.serviceTotal > 0 ? <TotalRow label="Service charges" value={`₹${fmt(totals.serviceTotal)}`} /> : null}
      <TotalRow label="Grand Total" value={`₹${fmt(totals.grandTotal)}`} bold top />
    </Panel>
  );
}

function Step3({ state, set, onBack, onCreated, wide }: {
  state: WizardState; set: (p: Partial<WizardState>) => void; onBack: () => void; onCreated: (q: { id: string; quotationNumber: string }) => void; wide: boolean;
}) {
  const theme = useTheme();
  const totals = cartTotals(state.cartItems, state.serviceCharges, state.overallDiscountAmount, state.overallDiscountMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const services = state.serviceCharges.filter((s) => s.label && s.amount > 0);

  const generate = async () => {
    setLoading(true); setError('');
    try {
      const lineItems = state.cartItems.map((item, i) => ({
        description: item.description,
        hsnSacCode: item.hsnSacCode || undefined,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        inventoryItemId: item.inventoryItemId || undefined,
        sku: item.sku || undefined,
        erpItemId: item.erpItemId || undefined,
        discountAmount: item.discountAmount || 0,
        discountMode: item.discountMode || 'PERCENT',
        gstPercent: item.gstPercent || 0,
        sortOrder: i,
      }));
      const serviceLines = services.map((s, i) => ({ description: s.label, quantity: 1, unitPrice: s.amount, sortOrder: state.cartItems.length + i }));
      const created = await createQuotationRaw({
        customerName: state.customerName, customerPhone: state.customerPhone,
        customerEmail: state.customerEmail, customerAddress: state.customerAddress,
        customerGSTIN: state.customerGSTIN || undefined,
        vehicleNumber: state.vehicleRegNo || undefined,
        vehicleBrand: state.vehicleMake || undefined,
        vehicleModel: state.vehicleModel || undefined,
        vehicleYear: state.vehicleYear || undefined,
        vehicleColour: state.vehicleColour || undefined,
        lineItems: [...lineItems, ...serviceLines],
        discountAmount: 0, gstRate: 0,
        overallDiscountAmount: state.overallDiscountAmount || 0,
        overallDiscountMode: state.overallDiscountMode || 'PERCENT',
        manualAmounts: { subtotal: totals.discountedSubtotal, cgst: totals.cgst, sgst: totals.sgst, grandTotal: totals.grandTotal },
        status: 'DRAFT',
        validUntil: state.validUntil || undefined,
        notes: state.notes || undefined,
        termsConditions: state.termsConditions || undefined,
        salespersonId: state.salespersonId || undefined,
      });
      setSaved('quotation', null);
      onCreated(created);
    } catch (e) { setError(getErrorMessage(e, 'Failed to create quotation')); }
    finally { setLoading(false); }
  };

  const hasVehicle = !!(state.vehicleRegNo || state.vehicleMake);
  return (
    <View style={styles.gap}>
      <View style={[styles.summary, { borderColor: theme.border }]}>
        <ThemedText style={styles.sumName}>{state.customerName}</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.sumText}>{[state.customerPhone, state.customerEmail].filter(Boolean).join(' · ') || '—'}</ThemedText>
        {state.customerAddress ? <ThemedText themeColor="textMuted" style={styles.sumText}>{state.customerAddress}</ThemedText> : null}
        {state.customerGSTIN ? <ThemedText themeColor="textMuted" style={styles.sumText}>GSTIN: {state.customerGSTIN}</ThemedText> : null}
        {hasVehicle ? (
          <ThemedText themeColor="textMuted" style={[styles.sumText, styles.sumRule, { borderTopColor: theme.border }]}>
            {[state.vehicleRegNo, state.vehicleMake, state.vehicleModel, state.vehicleColour].filter(Boolean).join(' · ')}
          </ThemedText>
        ) : null}
      </View>

      <View style={[styles.table, { borderColor: theme.border }]}>
        <View style={[styles.tr, { backgroundColor: theme.surface }]}>
          <ThemedText themeColor="textSecondary" style={[styles.th, styles.cItem]}>Item</ThemedText>
          <ThemedText themeColor="textSecondary" style={[styles.th, styles.cQty]}>Qty</ThemedText>
          {wide ? <ThemedText themeColor="textSecondary" style={[styles.th, styles.cRate]}>Rate</ThemedText> : null}
          {wide ? <ThemedText themeColor="textSecondary" style={[styles.th, styles.cGst]}>GST%</ThemedText> : null}
          <ThemedText themeColor="textSecondary" style={[styles.th, styles.cTotal]}>Total</ThemedText>
        </View>
        {state.cartItems.map((item, idx) => (
          <View key={idx} style={[styles.tr, { backgroundColor: idx % 2 === 0 ? theme.backgroundElement : theme.surface }]}>
            <ThemedText style={[styles.td, styles.cItem, styles.left]}>{item.description}</ThemedText>
            <ThemedText style={[styles.td, styles.cQty]}>{item.quantity}</ThemedText>
            {wide ? <ThemedText style={[styles.td, styles.cRate]}>₹{fmt(item.unitPrice)}</ThemedText> : null}
            {wide ? <ThemedText themeColor="textMuted" style={[styles.td, styles.cGst]}>{item.gstPercent != null ? `${item.gstPercent}%` : '—'}</ThemedText> : null}
            <ThemedText style={[styles.td, styles.cTotal, styles.bold]}>₹{fmt(calcLineAmount(item))}</ThemedText>
          </View>
        ))}
        {services.map((sc) => (
          <View key={sc.id} style={[styles.tr, { backgroundColor: theme.surface }]}>
            <ThemedText style={[styles.td, styles.cItem, styles.left]}>{sc.label}</ThemedText>
            <ThemedText style={[styles.td, styles.cTotal]}>₹{fmt(sc.amount)}</ThemedText>
          </View>
        ))}
      </View>

      <Totals totals={totals} />

      <DateField label="Valid Until (optional)" value={state.validUntil} onChange={(v) => set({ validUntil: v })} />
      <Input label="Notes" value={state.notes} onChangeText={(t) => set({ notes: t })} multiline />
      <Input label="Terms & Conditions" value={state.termsConditions} onChangeText={(t) => set({ termsConditions: t })} multiline />

      {error ? <View style={[styles.errBox, { backgroundColor: withAlpha('#dc2626', 0.1) }]}><ThemedText style={{ color: '#dc2626', fontSize: 14 }}>{error}</ThemedText></View> : null}

      <View style={styles.between}>
        <Button variant="secondary" onPress={onBack} disabled={loading}>← Back</Button>
        <Button loading={loading} onPress={generate}>Generate Quotation</Button>
      </View>
    </View>
  );
}

export function NewQuotationWizard({ userId, wide, onClose, onCreated }: {
  userId: string; wide: boolean; onClose: () => void; onCreated: (q: { id: string; quotationNumber: string }) => void;
}) {
  const theme = useTheme();
  // Pre-filled with whoever is running the wizard — editable, like the dashboard.
  const [state, setState] = useState<WizardState>(() => initialState(userId || null));
  const [staff, setStaff] = useState<QuotationStaffOption[]>([]);
  const set = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));

  useEffect(() => {
    let live = true;
    fetchQuotationStaff().then((s) => { if (live) setStaff(s); }).catch(() => { /* selector just shows empty — not fatal */ });
    return () => { live = false; };
  }, []);

  return (
    <View style={styles.gap}>
      <View style={styles.between}>
        <ThemedText style={styles.title}>New Quotation</ThemedText>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button"><ThemedText themeColor="textMuted" style={{ fontSize: 14 }}>← All Quotations</ThemedText></Pressable>
      </View>
      <StepIndicator step={state.step} wide={wide} onGoStep={(s) => { if (s < state.step && s < 4) set({ step: s as 1 | 2 | 3 }); }} />
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {state.step === 1 ? <Step1 state={state} set={set} wide={wide} onNext={() => set({ step: 2 })} /> : null}
        {state.step === 2 ? <Step2 state={state} set={set} staff={staff} wide={wide} onBack={() => set({ step: 1 })} onNext={() => set({ step: 3 })} /> : null}
        {state.step === 3 ? <Step3 state={state} set={set} wide={wide} onBack={() => set({ step: 2 })} onCreated={onCreated} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 16 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rowCenter: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  endRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  title: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 16 },
  label: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium, marginBottom: 8 },
  sectionLabel: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  small: { fontSize: 12, lineHeight: 16 },
  bold: { fontFamily: FontWeights.semiBold },
  left: { textAlign: 'left' },
  stepRow: { flexDirection: 'row', alignItems: 'center' },
  stepItem: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  stepCompact: { flexShrink: 0 },
  stepBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.sm, flexShrink: 1 },
  stepNum: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  stepLabel: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium, flexShrink: 1 },
  stepLine: { height: 2, minWidth: 12, flex: 1, marginHorizontal: 4 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: Radii.sm, overflow: 'hidden' },
  segBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  note: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  noteText: { fontSize: 14, flexShrink: 1 },
  noteLink: { fontSize: 12, textDecorationLine: 'underline' },
  btnCol: { paddingTop: 0 },
  x: { height: 44, width: 28, alignItems: 'center', justifyContent: 'center' },
  gstBox: { padding: 12, borderRadius: Radii.sm, gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  vehicle: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 12 },
  vehicleTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  modeBtn: { minWidth: 40, height: 36, borderWidth: 1, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center' },
  summary: { borderWidth: 1, borderRadius: Radii.md, padding: 16, gap: 4 },
  sumName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  sumText: { fontSize: 14, lineHeight: 20 },
  sumRule: { borderTopWidth: 1, paddingTop: 4, marginTop: 4 },
  table: { borderWidth: 1, borderRadius: Radii.md, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  th: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  td: { fontSize: 13, lineHeight: 18 },
  cItem: { flex: 1, minWidth: 0 },
  cQty: { width: 40, textAlign: 'center' },
  cRate: { width: 96, textAlign: 'right' },
  cGst: { width: 48, textAlign: 'right' },
  cTotal: { width: 96, textAlign: 'right' },
  errBox: { padding: 12, borderRadius: Radii.sm },
});
