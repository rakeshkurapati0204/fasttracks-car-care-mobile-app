import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/overview/parts';
import { SuccessBanner } from '@/components/onboarding/form-parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { cancelDebitNote, cancelPaymentVoucher, cancelPurchaseVoucher, fetchLedgers, fetchPurchaseLedgerDetail, getErrorMessage } from '@/lib/api';
import type { PaymentVoucherRow, PurchaseDebitNoteRow, PurchaseLedgerDetail, PurchaseVoucherRow } from '@/types/api';

import { fmtDate, money, shareCsv } from './helpers';
import { DeactivateReactivateSheet, DeleteLedgerSheet, EditLedgerSheet } from './ledger-sheets';
import { DebitNoteSheet, EditDebitNoteSheet } from './debit-sheets';
import { Column, DataTable, LinkButton, Mono } from './parts';
import { AllocateAdvanceSheet, EditPaymentVoucherSheet, NewPaymentVoucherSheet } from './payment-sheets';
import { CancelSheet, EditPurchaseVoucherSheet, NewPurchaseVoucherSheet } from './voucher-sheets';

type CancelTarget = { type: 'purchase' | 'payment' | 'debitNote'; id: string; label: string };

// "Superseded by …" / "Replaces …" sub-lines under a voucher number.
function VoucherCell({ number, notes }: { number: string; notes: string[] }) {
  return (
    <View>
      <ThemedText style={styles.cell}>{number}</ThemedText>
      {notes.map((n) => (
        <ThemedText key={n} themeColor="textMuted" style={styles.note}>{n}</ThemedText>
      ))}
    </View>
  );
}

// An edit leaves the old row behind as EDITED (superseded), not CANCELLED.
function StatusBadge({ status, supersededBy }: { status: string; supersededBy?: unknown }) {
  if (status === 'ACTIVE') return <Badge variant="success" size="sm">ACTIVE</Badge>;
  if (supersededBy) return <Badge variant="warning" size="sm">EDITED</Badge>;
  return <Badge variant="danger" size="sm">CANCELLED</Badge>;
}

function Actions({ children }: { children: React.ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

export function LedgerDetailView({
  ledgerId, wide, onBack,
}: { ledgerId: string; wide: boolean; onBack: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<PurchaseLedgerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [showNewPurchase, setShowNewPurchase] = useState(false);
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [allocateTarget, setAllocateTarget] = useState<PurchaseVoucherRow | null>(null);
  const [debitNoteTarget, setDebitNoteTarget] = useState<PurchaseVoucherRow | null>(null);
  const [editPurchaseTarget, setEditPurchaseTarget] = useState<PurchaseVoucherRow | null>(null);
  const [editPaymentTarget, setEditPaymentTarget] = useState<PaymentVoucherRow | null>(null);
  const [editDebitNoteTarget, setEditDebitNoteTarget] = useState<PurchaseDebitNoteRow | null>(null);
  const [ledgers, setLedgers] = useState<{ id: string; name: string }[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setDetail(await fetchPurchaseLedgerDetail(ledgerId));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to load ledger.'));
    } finally {
      setLoading(false);
    }
  }, [ledgerId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Close the sheet, show the dashboard's toast text, and reload.
  const done = (message: string, close: () => void) => {
    close();
    setNotice(message);
    load();
  };

  // A party picker is the only thing the payment edit sheet needs that the
  // detail response doesn't carry, so it loads on the first Edit click.
  const ensureLedgersLoaded = async () => {
    if (ledgers.length > 0) return true;
    try {
      setLedgers((await fetchLedgers()).map((l) => ({ id: l.id, name: l.name })));
      return true;
    } catch {
      setError('Failed to load parties.');
      return false;
    }
  };

  const back = <LinkButton onPress={onBack}>← All Ledgers</LinkButton>;

  if (loading || !detail) {
    return (
      <ScrollView contentContainerStyle={[styles.content, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}>
        {back}
        {error ? <ErrorBanner message={error} onRetry={() => { setLoading(true); load(); }} /> : (
          <>
            <Skeleton width={200} height={24} />
            <Skeleton width={160} height={16} />
            <Skeleton height={120} />
          </>
        )}
      </ScrollView>
    );
  }

  const { ledger } = detail;
  const isTransporter = ledger.partyType === 'TRANSPORTER';
  const balanceNum = Number(detail.balance);
  const balanceLabel =
    balanceNum > 0 ? `They owe us ${money(balanceNum)} (advance)` : balanceNum < 0 ? `We owe them ${money(Math.abs(balanceNum))}` : 'Settled — ₹0.00';

  const purchaseVoucherNumbers = detail.purchaseVouchers.map((pv) => pv.voucherNumber);
  const activePurchases = detail.purchaseVouchers.filter((pv) => pv.status === 'ACTIVE');
  const hasTransactions = detail.purchaseVouchers.length > 0 || detail.paymentVouchers.length > 0;

  const purchaseColumns: Column<PurchaseVoucherRow>[] = [
    {
      key: 'no', header: 'Voucher #', width: 170, render: (r) => {
        // A debit note naming a REPLACEMENT voucher leaves this bill's own
        // Outstanding unchanged — say where the credit went.
        const elsewhere = r.debitNotesAsSource.filter((dn) => dn.replacementPurchaseVoucherId);
        const credited = elsewhere.reduce((s, dn) => s + Number(dn.totalAmount), 0);
        const notes: string[] = [];
        if (elsewhere.length > 0) {
          const isFully = credited >= Number(r.totalAmount) - 0.01;
          notes.push(`${isFully ? 'Fully returned' : 'Partially returned'} — credit applied to ${elsewhere.map((dn) => dn.replacementPurchaseVoucher?.voucherNumber).join(', ')}`);
        }
        if (r.supersededBy) notes.push(`Superseded by ${r.supersededBy.voucherNumber}`);
        if (r.supersedes) notes.push(`Replaces ${r.supersedes.voucherNumber}`);
        return <VoucherCell number={r.voucherNumber} notes={notes} />;
      },
    },
    { key: 'date', header: 'Date', width: 100, render: (r) => fmtDate(r.voucherDate) },
    { key: 'amount', header: 'Amount', width: 110, render: (r) => <Mono>{money(r.totalAmount)}</Mono> },
    {
      // Only meaningful while ACTIVE (cancelling voids allocations, which would
      // otherwise recompute back to the full amount). Can be negative once debit
      // notes exceed the bill, shown as a credit rather than a bare negative.
      key: 'out', header: 'Outstanding', width: 130, render: (r) => {
        if (r.status !== 'ACTIVE') return '—';
        const n = Number(r.outstanding);
        return n < 0 ? <Mono style={{ color: theme.success }}>{`Over-credited by ${money(Math.abs(n))}`}</Mono> : <Mono>{money(n)}</Mono>;
      },
    },
    { key: 'status', header: 'Status', width: 96, render: (r) => <StatusBadge status={r.status} supersededBy={r.supersededBy} /> },
    // "Who carried the goods" means nothing on a transporter's own ledger.
    ...(isTransporter ? [] : [{ key: 'transporter', header: 'Transporter', width: 120, render: (r: PurchaseVoucherRow) => r.transporterName || '—' }]),
    { key: 'po', header: 'Linked Purchase', width: 120, render: (r) => (r.purchaseOrder ? `PO ${r.purchaseOrder.id.slice(-6).toUpperCase()}` : '—') },
    { key: 'settled', header: 'Settled Via', width: 130, render: (r) => (r.allocations.length ? r.allocations.map((a) => a.paymentVoucher.voucherNumber).join(', ') : '—') },
    {
      key: 'actions', header: '', width: 340, action: true, render: (r) =>
        r.status === 'ACTIVE' ? (
          <Actions>
            {Number(r.outstanding) > 0 ? <Button variant="outline" size="sm" onPress={() => setAllocateTarget(r)}>Allocate advance</Button> : null}
            <Button variant="outline" size="sm" onPress={() => setDebitNoteTarget(r)}>Debit Note</Button>
            <Button variant="outline" size="sm" onPress={() => setEditPurchaseTarget(r)}>Edit</Button>
            <Button variant="outline" size="sm" onPress={() => setCancelTarget({ type: 'purchase', id: r.id, label: r.voucherNumber })}>Cancel</Button>
          </Actions>
        ) : null,
    },
  ];

  const paymentColumns: Column<PaymentVoucherRow>[] = [
    {
      key: 'no', header: 'Voucher #', width: 170, render: (r) => (
        <VoucherCell
          number={r.voucherNumber}
          notes={[...(r.supersededBy ? [`Superseded by ${r.supersededBy.voucherNumber}`] : []), ...(r.supersedes ? [`Replaces ${r.supersedes.voucherNumber}`] : [])]}
        />
      ),
    },
    { key: 'type', header: 'Type', width: 96, render: (r) => <Badge variant={r.voucherType === 'PAYMENT' ? 'secondary' : 'success'} size="sm">{r.voucherType}</Badge> },
    { key: 'date', header: 'Date', width: 100, render: (r) => fmtDate(r.voucherDate) },
    { key: 'amount', header: 'Amount', width: 110, render: (r) => <Mono>{money(r.totalAmount)}</Mono> },
    {
      // A RECEIPT can never be allocated, and a cancelled PAYMENT recomputes
      // back to its full amount, so only an ACTIVE PAYMENT has a real figure.
      key: 'unalloc', header: 'Unallocated', width: 120,
      render: (r) => (r.voucherType === 'PAYMENT' && r.status === 'ACTIVE' ? <Mono>{money(r.available)}</Mono> : '—'),
    },
    { key: 'status', header: 'Status', width: 96, render: (r) => <StatusBadge status={r.status} supersededBy={r.supersededBy} /> },
    {
      key: 'actions', header: '', width: 160, action: true, render: (r) =>
        r.status === 'ACTIVE' ? (
          <Actions>
            <Button variant="outline" size="sm" onPress={async () => { if (await ensureLedgersLoaded()) setEditPaymentTarget(r); }}>Edit</Button>
            <Button variant="outline" size="sm" onPress={() => setCancelTarget({ type: 'payment', id: r.id, label: r.voucherNumber })}>Cancel</Button>
          </Actions>
        ) : null,
    },
  ];

  const debitNoteRows = detail.debitNotes;
  const debitColumns: Column<PurchaseDebitNoteRow>[] = [
    {
      key: 'no', header: 'Voucher #', width: 170, render: (r) => (
        <VoucherCell
          number={r.voucherNumber}
          notes={[...(r.supersededBy ? [`Superseded by ${r.supersededBy.voucherNumber}`] : []), ...(r.supersedes ? [`Replaces ${r.supersedes.voucherNumber}`] : [])]}
        />
      ),
    },
    { key: 'date', header: 'Date', width: 100, render: (r) => fmtDate(r.voucherDate) },
    { key: 'amount', header: 'Amount', width: 110, render: (r) => <Mono>{money(r.totalAmount)}</Mono> },
    { key: 'against', header: 'Against', width: 120, render: (r) => r.purchaseVoucher?.voucherNumber ?? '—' },
    { key: 'credit', header: 'Credit applied to', width: 150, render: (r) => r.replacementPurchaseVoucher?.voucherNumber ?? '— (same bill)' },
    { key: 'status', header: 'Status', width: 96, render: (r) => <StatusBadge status={r.status} supersededBy={r.supersededBy} /> },
    {
      key: 'actions', header: '', width: 160, action: true, render: (r) =>
        r.status === 'ACTIVE' ? (
          <Actions>
            <Button variant="outline" size="sm" onPress={() => setEditDebitNoteTarget(r)}>Edit</Button>
            <Button variant="outline" size="sm" onPress={() => setCancelTarget({ type: 'debitNote', id: r.id, label: r.voucherNumber })}>Cancel</Button>
          </Actions>
        ) : null,
    },
  ];

  // Exactly what's on screen: every purchase and payment/receipt voucher.
  const exportCsv = async () => {
    const rows: (string | number)[][] = [
      ['Ledger', ledger.name],
      ['Balance', balanceLabel],
      [],
      ['Type', 'Voucher #', 'Date', 'Amount', 'Outstanding / Unallocated', 'Status', 'Transporter'],
      ...detail.purchaseVouchers.map((pv) => [
        'PURCHASE', pv.voucherNumber, fmtDate(pv.voucherDate), Number(pv.totalAmount).toFixed(2),
        pv.status === 'ACTIVE' ? Number(pv.outstanding).toFixed(2) : '', pv.status, pv.transporterName || '',
      ]),
      ...detail.paymentVouchers.map((p) => [
        p.voucherType, p.voucherNumber, fmtDate(p.voucherDate), Number(p.totalAmount).toFixed(2),
        p.voucherType === 'PAYMENT' && p.status === 'ACTIVE' ? Number(p.available).toFixed(2) : '', p.status, '',
      ]),
    ];
    const safe = ledger.name.replace(/[^a-z0-9]+/gi, '-');
    try {
      if (!(await shareCsv(`ledger-${safe}-${new Date().toISOString().slice(0, 10)}.csv`, rows))) setError('Sharing isn’t available on this device.');
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : 'Failed to export CSV.');
    }
  };

  const cancelLabel = cancelTarget
    ? `${cancelTarget.type === 'purchase' ? 'Purchase Voucher' : cancelTarget.type === 'payment' ? 'Payment Voucher' : 'Debit Note'} ${cancelTarget.label}`
    : '';

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.content, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled">
        {back}
        <View style={[styles.head, wide && styles.headWide]}>
          <View style={styles.flex1}>
            <View style={styles.titleRow}>
              <ThemedText style={styles.h1}>{ledger.name}</ThemedText>
              {!ledger.isActive ? <Badge variant="danger" size="sm">Inactive</Badge> : null}
            </View>
            <ThemedText themeColor={balanceNum < 0 ? 'danger' : 'textMuted'} style={styles.balance}>{balanceLabel}</ThemedText>
          </View>
          <View style={[styles.btns, wide && styles.btnsWide]}>
            <Button variant="outline" size="sm" onPress={exportCsv}>Download CSV</Button>
            <Button variant="outline" size="sm" onPress={() => setShowEdit(true)}>Edit</Button>
            <Button variant="outline" size="sm" onPress={() => setShowDeactivate(true)}>{ledger.isActive ? 'Deactivate' : 'Reactivate'}</Button>
            <Button variant="danger" size="sm" onPress={() => setShowDelete(true)}>Delete</Button>
            {ledger.isActive ? (
              <>
                <Button variant="outline" size="sm" onPress={() => setShowNewPayment(true)}>+ Payment / Receipt</Button>
                {/* Freight already has its own entry point (+ Transporter
                    Payment on the ledger list), so the goods-purchase form is
                    hidden on a transporter's own ledger. */}
                {!isTransporter ? <Button size="sm" onPress={() => setShowNewPurchase(true)}>+ Purchase Voucher</Button> : null}
              </>
            ) : null}
          </View>
        </View>

        {notice ? <SuccessBanner message={notice} /> : null}
        {error ? <ErrorBanner message={error} onRetry={load} /> : null}

        <Card padding="md">
          <ThemedText style={styles.h2}>Purchase Vouchers</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.sub}>
            Outstanding here is per bill — it can differ from the party balance above when a return&apos;s credit was applied to a different bill instead of this one.
          </ThemedText>
          <DataTable columns={purchaseColumns} rows={detail.purchaseVouchers} keyOf={(r) => r.id} wide={wide} empty="No purchase vouchers yet." />
        </Card>

        <Card padding="md">
          <ThemedText style={[styles.h2, { marginBottom: 8 }]}>Payment / Receipt Vouchers</ThemedText>
          <DataTable columns={paymentColumns} rows={detail.paymentVouchers} keyOf={(r) => r.id} wide={wide} empty="No payment/receipt vouchers yet." />
        </Card>

        {debitNoteRows.length > 0 ? (
          <Card padding="md">
            <ThemedText style={[styles.h2, { marginBottom: 8 }]}>Debit Notes</ThemedText>
            <DataTable columns={debitColumns} rows={debitNoteRows} keyOf={(r) => r.id} wide={wide} empty="No debit notes yet." />
          </Card>
        ) : null}
      </ScrollView>

      {showNewPurchase ? (
        <NewPurchaseVoucherSheet ledgerId={ledgerId} onClose={() => setShowNewPurchase(false)} onDone={() => done('Purchase voucher posted.', () => setShowNewPurchase(false))} />
      ) : null}
      {showNewPayment ? (
        <NewPaymentVoucherSheet
          ledgerId={ledgerId}
          purchaseVouchers={activePurchases}
          onClose={() => setShowNewPayment(false)}
          onDone={() => done('Payment posted.', () => setShowNewPayment(false))}
        />
      ) : null}
      {cancelTarget ? (
        <CancelSheet
          label={cancelLabel}
          onClose={() => setCancelTarget(null)}
          onConfirm={async (reason) => {
            // A purchase voucher with an active debit note refuses to cancel;
            // that error surfaces through the sheet like any other.
            if (cancelTarget.type === 'purchase') await cancelPurchaseVoucher(cancelTarget.id, reason);
            else if (cancelTarget.type === 'payment') await cancelPaymentVoucher(cancelTarget.id, reason);
            else await cancelDebitNote(cancelTarget.id, reason);
            done('Cancelled.', () => setCancelTarget(null));
          }}
        />
      ) : null}
      {allocateTarget ? (
        <AllocateAdvanceSheet
          purchaseVoucherId={allocateTarget.id}
          outstanding={allocateTarget.outstanding}
          availablePayments={detail.paymentVouchers.filter((p) => p.status === 'ACTIVE' && p.voucherType === 'PAYMENT' && Number(p.available) > 0)}
          onClose={() => setAllocateTarget(null)}
          onDone={() => done('Advance allocated.', () => setAllocateTarget(null))}
        />
      ) : null}
      {debitNoteTarget ? (
        <DebitNoteSheet
          sourceVoucher={debitNoteTarget}
          replacementOptions={activePurchases.filter((pv) => pv.id !== debitNoteTarget.id)}
          onClose={() => setDebitNoteTarget(null)}
          onDone={() => done('Debit note posted.', () => setDebitNoteTarget(null))}
        />
      ) : null}
      {editPaymentTarget ? (
        <EditPaymentVoucherSheet
          voucher={editPaymentTarget}
          ledgers={ledgers}
          purchaseVouchers={activePurchases}
          existingVoucherNumbers={detail.paymentVouchers.map((p) => p.voucherNumber)}
          onClose={() => setEditPaymentTarget(null)}
          onDone={() => done('Payment voucher updated.', () => setEditPaymentTarget(null))}
        />
      ) : null}
      {editDebitNoteTarget ? (
        <EditDebitNoteSheet
          debitNote={editDebitNoteTarget}
          sourceVoucherOptions={activePurchases}
          existingVoucherNumbers={debitNoteRows.map((dn) => dn.voucherNumber)}
          onClose={() => setEditDebitNoteTarget(null)}
          onDone={() => done('Debit note updated.', () => setEditDebitNoteTarget(null))}
        />
      ) : null}
      {editPurchaseTarget ? (
        <EditPurchaseVoucherSheet
          voucher={editPurchaseTarget}
          existingVoucherNumbers={purchaseVoucherNumbers}
          onClose={() => setEditPurchaseTarget(null)}
          onDone={() => done('Purchase voucher updated.', () => setEditPurchaseTarget(null))}
        />
      ) : null}
      {showEdit ? (
        <EditLedgerSheet ledger={ledger} onClose={() => setShowEdit(false)} onSaved={() => done('Ledger updated.', () => setShowEdit(false))} />
      ) : null}
      {showDeactivate ? (
        <DeactivateReactivateSheet
          ledgerId={ledgerId}
          ledgerName={ledger.name}
          isActive={ledger.isActive}
          onClose={() => setShowDeactivate(false)}
          onDone={() => done(ledger.isActive ? 'Ledger deactivated.' : 'Ledger reactivated.', () => setShowDeactivate(false))}
        />
      ) : null}
      {showDelete ? (
        <DeleteLedgerSheet
          ledgerId={ledgerId}
          ledgerName={ledger.name}
          hasTransactions={hasTransactions}
          onClose={() => setShowDelete(false)}
          onDeleted={() => { setShowDelete(false); onBack(); }}
          onDeactivateInstead={() => { setShowDelete(false); setShowDeactivate(true); }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { gap: 16, width: '100%', maxWidth: 896, alignSelf: 'center' },
  head: { gap: 12 },
  headWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  h1: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold, flexShrink: 1 },
  balance: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btnsWide: { flex: 1, justifyContent: 'flex-end' },
  h2: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  sub: { fontSize: 12, lineHeight: 16, marginBottom: 8 },
  cell: { fontSize: 14, lineHeight: 20 },
  note: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
