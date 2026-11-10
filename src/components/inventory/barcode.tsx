import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { FontWeights, Fonts, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getErrorMessage } from '@/lib/api';

import { code128Bars, code128Svg } from './code128';

export type PrintLabel = { barcode: string; product: string; category: string; storeLocation?: string };

// The bars themselves (white card, black bars), scaled to the available width.
export function BarcodeGraphic({ value, height = 52, width }: { value: string; height?: number; width?: number }) {
  const enc = code128Bars(value);
  if (!enc) return null;
  const w = width ?? Math.min(300, enc.width * 2);
  return (
    <Svg width={w} height={height} viewBox={`0 0 ${enc.width} 55`} preserveAspectRatio="none">
      {enc.bars.map((b, i) => <Rect key={i} x={b.x} y={0} width={b.w} height={55} fill="#000000" />)}
    </Svg>
  );
}

// Live preview under the barcode field in the forms.
export function BarcodePreview({ value }: { value: string }) {
  const theme = useTheme();
  if (!value.trim() || !code128Bars(value)) return null;
  return (
    <View style={[styles.preview, { borderColor: theme.border }]}>
      <BarcodeGraphic value={value} />
      <ThemedText style={styles.previewText}>{value}</ThemedText>
    </View>
  );
}

// The dashboard opens a print window of 80×20mm labels (two per row). The app
// builds the same label page and hands it to the share sheet, where it opens in
// a browser or print service with the same "Print" toolbar.
export async function printBarcodes(items: PrintLabel[], copies: number) {
  const expanded = items.flatMap((item) => Array.from({ length: copies }, () => item));
  const half = (item: PrintLabel) =>
    `<div class="label-half">${code128Svg(item.barcode, 'width:32mm;height:14mm')}<div class="product-name">${
      (item.product || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div>`;
  const labels = expanded.map((item) => `<div class="label-row">${half(item)}${half(item)}</div>`).join('');
  const css = [
    '*{margin:0;padding:0;box-sizing:border-box}',
    'body{margin:0;padding:0;background:#fff;color:#000}',
    '.toolbar{padding:10px 16px;background:#f3f4f6;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px}',
    '.toolbar button{padding:8px 20px;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer}',
    '.toolbar span{font-size:13px;color:#6b7280}',
    '.label-row{width:78mm;height:20mm;margin:0 1mm;gap:10mm;display:flex;flex-direction:row;overflow:hidden;page-break-after:always;page-break-inside:avoid}',
    '.label-half{width:34mm;height:20mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.5mm;padding:0.5mm}',
    '.product-name{font-size:6pt;line-height:1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:37mm}',
    '@page{size:80mm 20mm;margin:0}',
    '@media print{.toolbar{display:none!important}body{margin:0}}',
  ].join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Print Labels — 80×20mm</title><style>${css}</style></head><body>`
    + `<div class="toolbar"><button onclick="window.print()">Print</button><span>${expanded.length} label(s) · 80×20mm</span></div>${labels}</body></html>`;
  const uri = `${FileSystem.cacheDirectory}barcode-labels-${Date.now()}.html`;
  await FileSystem.writeAsStringAsync(uri, html, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'text/html', dialogTitle: 'Print Labels — 80×20mm', UTI: 'public.html' });
}

// Barcode view sheet with the copies picker (1–500).
export function BarcodeSheet({ barcode, label, onClose }: { barcode: string; label: string; storeLocation?: string; onClose: () => void }) {
  const theme = useTheme();
  const [copies, setCopies] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const n = Math.min(500, Math.max(1, parseInt(copies, 10) || 1));

  if (!barcode.trim()) {
    return (
      <Sheet visible onClose={onClose} title="Barcode" footer={<Button variant="ghost" onPress={onClose} style={styles.flex1}>Close</Button>}>
        <View style={styles.empty}>
          <ThemedText style={styles.emptyTitle}>No barcode assigned</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.small}>Add stock for this product to auto-assign a barcode.</ThemedText>
        </View>
      </Sheet>
    );
  }

  const print = async () => {
    setBusy(true);
    setError('');
    try {
      await printBarcodes([{ barcode, product: label, category: '' }], n);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not open the label page.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={busy}
      title={`Barcode — ${label}`}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} style={styles.flex1}>Close</Button>
          <Button onPress={print} loading={busy} style={styles.flex2}>{`Print ${n > 1 ? `${n} copies` : 'Barcode'}`}</Button>
        </>
      }>
      <View style={styles.center}>
        <View style={[styles.card, { borderColor: theme.border }]}><BarcodeGraphic value={barcode} height={70} /></View>
        <ThemedText style={styles.label}>{label}</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.code}>{barcode}</ThemedText>
      </View>
      <View style={styles.copies}>
        <ThemedText themeColor="textSecondary" style={styles.copiesLabel}>Copies:</ThemedText>
        <View style={styles.copiesInput}>
          <Input value={copies} onChangeText={(v) => setCopies(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" onBlur={() => setCopies(String(n))} />
        </View>
      </View>
      {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  flex2: { flex: 2, minWidth: 0 },
  small: { fontSize: 13, lineHeight: 18 },
  preview: { alignSelf: 'center', alignItems: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderRadius: Radii.sm, padding: 10, gap: 4 },
  previewText: { color: '#000000', fontFamily: Fonts?.mono, fontSize: 12, lineHeight: 16 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 28 },
  emptyTitle: { fontSize: 15, lineHeight: 22, fontFamily: FontWeights.semiBold },
  center: { alignItems: 'center', gap: 6 },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderRadius: Radii.md, paddingVertical: 16, paddingHorizontal: 20 },
  label: { marginTop: 8, fontSize: 17, lineHeight: 24, fontFamily: FontWeights.bold, textAlign: 'center' },
  code: { fontFamily: Fonts?.mono, fontSize: 14, lineHeight: 20, letterSpacing: 1.5 },
  copies: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  copiesLabel: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  copiesInput: { width: 90 },
});
