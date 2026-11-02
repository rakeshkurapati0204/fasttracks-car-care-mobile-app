import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const CHART_COLORS = ['#6AA4CC', '#36C87E', '#E8A828', '#E06868', '#9070C8', '#38B4C0', '#D88840'];

// ₹1,200: Indian grouping, no decimals (the dashboard's formatCurrency).
export function formatCurrency(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const TICK = 10;
const DASH = '3 3';

// Dashboard CustomTooltip: card, 1px border, label, then "name: value" per
// series coloured by index; the value is money only when the name says revenue.
type TipLine = { name: string; value: number };
function Tip({ x, y, width, label, lines }: { x: number; y: number; width: number; label?: string; lines: TipLine[] }) {
  const theme = useTheme();
  const w = 180;
  const left = Math.min(Math.max(x - w / 2, 0), Math.max(0, width - w));
  return (
    <View pointerEvents="none" style={[styles.tip, { left, top: Math.max(0, y), width: w, backgroundColor: theme.surface, borderColor: theme.border }]}>
      {label ? <ThemedText style={styles.tipTitle}>{label}</ThemedText> : null}
      {lines.map((p, i) => (
        <ThemedText key={i} style={[styles.tipText, { color: CHART_COLORS[i] }]}>
          {`${p.name}: ${p.name.toLowerCase().includes('revenue') ? formatCurrency(p.value) : p.value}`}
        </ThemedText>
      ))}
    </View>
  );
}

function niceTicks(max: number) {
  const raw = Math.max(max, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  let step = pow;
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= raw) { step = m * pow; break; }
  }
  const top = Math.max(step, Math.ceil(max / step) * step);
  const out: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(v);
  return out;
}

// ─── Revenue Trend: line chart, x = date, y = revenue in k ──────────────────
export function RevenueLineChart({ data, height = 240 }: { data: { date: string; revenue: number }[]; height?: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const L = 36, R = 10, T = 8, B = 24;
  const plotW = Math.max(0, width - L - R);
  const plotH = height - T - B;
  const ticks = niceTicks(Math.max(...data.map((d) => d.revenue), 0));
  const top = ticks[ticks.length - 1] || 1;
  const xOf = (i: number) => (data.length <= 1 ? L + plotW / 2 : L + (plotW * i) / (data.length - 1));
  const yOf = (v: number) => T + plotH - (v / top) * plotH;
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(d.revenue)}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 78))));

  const pick = (locX: number) => {
    if (!data.length || plotW <= 0) return;
    const i = Math.round(((locX - L) / plotW) * (data.length - 1));
    const idx = Math.min(data.length - 1, Math.max(0, i));
    setActive((a) => (a === idx ? null : idx));
  };

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            {ticks.map((t) => <Line key={`g${t}`} x1={L} x2={L + plotW} y1={yOf(t)} y2={yOf(t)} stroke={theme.border} strokeDasharray={DASH} strokeWidth={1} />)}
            {ticks.map((t) => (
              <SvgText key={`y${t}`} x={L - 6} y={yOf(t) + 3} fontSize={TICK} fill={theme.textMuted} textAnchor="end">{`${Math.round(t / 1000)}k`}</SvgText>
            ))}
            <Path d={path} stroke={CHART_COLORS[0]} strokeWidth={2} fill="none" />
            {data.map((d, i) =>
              i % labelEvery === 0 ? (
                <SvgText key={`x${i}`} x={xOf(i)} y={height - 6} fontSize={TICK} fill={theme.textMuted} textAnchor="middle">{formatDate(d.date)}</SvgText>
              ) : null,
            )}
            {active !== null ? <Circle cx={xOf(active)} cy={yOf(data[active].revenue)} r={4} fill={CHART_COLORS[0]} /> : null}
          </Svg>
          <Pressable
            onPress={(e) => pick(e.nativeEvent.locationX)}
            accessibilityRole="button"
            accessibilityLabel="Revenue trend"
            style={StyleSheet.absoluteFill}
          />
          {active !== null ? (
            <Tip x={xOf(active)} y={yOf(data[active].revenue) - 64} width={width} label={formatDate(data[active].date)} lines={[{ name: 'revenue', value: data[active].revenue }]} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// ─── Growth (MoM): vertical bars, x = month, no y axis ──────────────────────
export function GrowthBarChart({ data, height = 140 }: { data: { month: string; revenue: number }[]; height?: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const T = 8, B = 22;
  const plotH = height - T - B;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const slot = data.length ? width / data.length : 0;
  const barW = Math.min(slot * 0.7, 60);
  const bar = (x: number, y: number, w: number, h: number) => {
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
  };
  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            {data.map((d, i) => {
              const h = (d.revenue / max) * plotH;
              const cx = slot * i + slot / 2;
              return (
                <G key={`${d.month}${i}`}>
                  <Path d={h > 0 ? bar(cx - barW / 2, T + plotH - h, barW, h) : ''} fill={CHART_COLORS[1]} opacity={active === null || active === i ? 1 : 0.6} />
                  <SvgText x={cx} y={height - 6} fontSize={TICK} fill={theme.textMuted} textAnchor="middle">{d.month}</SvgText>
                </G>
              );
            })}
          </Svg>
          {data.map((d, i) => (
            <Pressable
              key={`hit${i}`}
              onPress={() => setActive((a) => (a === i ? null : i))}
              accessibilityRole="button"
              accessibilityLabel={`${d.month}: ${formatCurrency(d.revenue)}`}
              style={{ position: 'absolute', left: slot * i, width: slot, top: 0, height }}
            />
          ))}
          {active !== null ? (
            <Tip x={slot * active + slot / 2} y={Math.max(0, T + plotH - (data[active].revenue / max) * plotH - 62)} width={width} label={data[active].month} lines={[{ name: 'revenue', value: data[active].revenue }]} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// ─── Spend Slab Distribution: horizontal bars with "n customers (x%)" ───────
export type SlabDatum = { slab: string; label: string; count: number; pct: number; labelText: string };

export function SlabBarChart({ data, colors, height = 180 }: { data: SlabDatum[]; colors: string[]; height?: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const L = 90, R = Math.min(120, Math.max(70, width * 0.4)), T = 5, B = 5;
  const plotW = Math.max(0, width - L - R);
  const plotH = height - T - B;
  const max = Math.max(...data.map((d) => d.count), 1);
  const slot = data.length ? plotH / data.length : 0;
  const barH = Math.min(28, slot * 0.8);
  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            {data.map((d, i) => {
              const cy = T + slot * i + slot / 2;
              // minPointSize 2, like the dashboard, so an empty slab still shows a sliver.
              const w = Math.max(2, (d.count / max) * plotW);
              return (
                <G key={d.slab}>
                  <SvgText x={L - 6} y={cy + 4} fontSize={11} fill={theme.textSecondary} textAnchor="end">{d.label}</SvgText>
                  <Path d={`M${L},${cy - barH / 2} L${L + w - 4},${cy - barH / 2} Q${L + w},${cy - barH / 2} ${L + w},${cy - barH / 2 + 4} L${L + w},${cy + barH / 2 - 4} Q${L + w},${cy + barH / 2} ${L + w - 4},${cy + barH / 2} L${L},${cy + barH / 2} Z`} fill={colors[i]} opacity={active === null || active === i ? 1 : 0.6} />
                  <SvgText x={L + w + 6} y={cy + 4} fontSize={11} fontWeight="bold" fill={theme.text}>{d.labelText}</SvgText>
                </G>
              );
            })}
          </Svg>
          {data.map((d, i) => (
            <Pressable
              key={`hit${d.slab}`}
              onPress={() => setActive((a) => (a === i ? null : i))}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}: ${d.labelText}`}
              style={{ position: 'absolute', left: 0, width, top: T + slot * i, height: slot }}
            />
          ))}
          {active !== null ? (
            <View
              pointerEvents="none"
              style={[styles.tip, { left: Math.min(L + 20, Math.max(0, width - 190)), top: Math.max(0, T + slot * active - 40), width: 180, backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ThemedText style={styles.tipTitle}>{data[active].label}</ThemedText>
              <ThemedText style={styles.tipText}>{`${data[active].count} customer${data[active].count === 1 ? '' : 's'} (${data[active].pct}%)`}</ThemedText>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

// ─── Pie (breakdown): recharts starts at 3 o'clock and runs anticlockwise ───
export function BreakdownPie({ data, height = 260 }: { data: { service: string; revenue: number }[]; height?: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.revenue, 0) || 1;
  const legendH = 34;
  const cx = width / 2;
  const cy = (height - legendH) / 2;
  const r = 90;
  const pt = (deg: number) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];

  const slices = data.map((d, i) => {
    const before = data.slice(0, i).reduce((sum, x) => sum + x.revenue, 0);
    const s = (before / total) * 360;
    return { i, s, e: s + (d.revenue / total) * 360, d };
  });

  const pick = (x: number, y: number) => {
    const dx = x - cx;
    const dy = cy - y;
    if (Math.hypot(dx, dy) > r) { setActive(null); return; }
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (a < 0) a += 360;
    const hit = slices.find((sl) => a >= sl.s && a < sl.e) ?? null;
    setActive(hit && hit.i !== active ? hit.i : null);
  };

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <>
          <Pressable onPress={(e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY)} accessibilityRole="button" accessibilityLabel="Revenue breakdown">
            <Svg width={width} height={height - legendH}>
              {slices.map((sl) => {
                const [x0, y0] = pt(sl.s);
                const [x1, y1] = pt(sl.e);
                const large = sl.e - sl.s > 180 ? 1 : 0;
                const full = sl.e - sl.s >= 359.99;
                const d = full
                  ? `M${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy} Z`
                  : `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 0 ${x1},${y1} Z`;
                return <Path key={sl.i} d={d} fill={CHART_COLORS[sl.i % CHART_COLORS.length]} opacity={active === null || active === sl.i ? 1 : 0.6} stroke={theme.surface} strokeWidth={1} />;
              })}
            </Svg>
          </Pressable>
          <View style={styles.legend}>
            {data.map((d, i) => (
              <View key={`${d.service}${i}`} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                <ThemedText style={styles.legendText}>{d.service}</ThemedText>
              </View>
            ))}
          </View>
          {active !== null ? (
            <Tip x={cx} y={8} width={width} lines={[{ name: data[active].service, value: data[active].revenue }]} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tip: { position: 'absolute', borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  tipTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  tipText: { fontSize: 12, lineHeight: 16 },
  legend: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10 },
  legendText: { fontSize: 11, lineHeight: 14 },
});
