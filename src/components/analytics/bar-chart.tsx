import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChartDatum = {
  label: string;
  value: number;
  /** Tooltip lines shown when the bar is tapped (recharts-style: "Name: value"). */
  tip: string;
};

const TICK = 11; // the dashboard's axis tick font size
const DASH = '3 3'; // CartesianGrid strokeDasharray

// Smallest "nice" integer step that fits the data in about 4 intervals, like a
// recharts axis with allowDecimals={false}.
function niceStep(max: number) {
  const raw = Math.max(max, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) {
    const step = m * pow;
    if (step >= raw && Number.isInteger(step)) return step;
  }
  return Math.max(1, Math.ceil(raw));
}

function ticksFor(max: number, fixedTop?: number): number[] {
  if (fixedTop !== undefined) return [0, fixedTop / 4, fixedTop / 2, (fixedTop * 3) / 4, fixedTop];
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}

// Bar with only the leading corners rounded (radius r), like recharts' radius prop.
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}
function rightRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} L${x},${y + h} Z`;
}

function fit(label: string, px: number) {
  const max = Math.max(3, Math.floor(px / 6));
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

type TipProps = { x: number; y: number; width: number; label: string; tip: string };

// Dashboard tooltip: card background, 1px border, 8px radius, 12px text.
function Tooltip({ x, y, width, label, tip }: TipProps) {
  const theme = useTheme();
  const w = 170;
  const left = Math.min(Math.max(x - w / 2, 0), Math.max(0, width - w));
  return (
    <View pointerEvents="none" style={[styles.tip, { left, top: Math.max(0, y), width: w, backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ThemedText style={styles.tipTitle} numberOfLines={2}>{label}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.tipText}>{tip}</ThemedText>
    </View>
  );
}

type VerticalProps = {
  data: ChartDatum[];
  color: string;
  height?: number;
  /** Fixed y-axis top (e.g. 100 for scores); otherwise fitted to the data with integer ticks. */
  yMax?: number;
};

// Column chart (recharts <BarChart> with an XAxis category + YAxis number):
// dashed grid, 11px muted ticks, top-rounded bars, tap a column for the tooltip.
// Fills the width of its container and redraws when that changes.
export function VerticalBarChart({ data, color, height = 200, yMax }: VerticalProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const L = 32;
  const R = 10;
  const T = 8;
  const B = 24;
  const plotW = Math.max(0, width - L - R);
  const plotH = height - T - B;
  const dataMax = Math.max(...data.map((d) => d.value), 0);
  const ticks = ticksFor(dataMax, yMax);
  const top = ticks[ticks.length - 1] || 1;
  const slot = data.length ? plotW / data.length : 0;
  const barW = Math.min(slot * 0.6, 60);
  const yOf = (v: number) => T + plotH - (v / top) * plotH;

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            {ticks.map((t) => (
              <Line key={`g${t}`} x1={L} x2={L + plotW} y1={yOf(t)} y2={yOf(t)} stroke={theme.border} strokeDasharray={DASH} strokeWidth={1} />
            ))}
            {ticks.map((t) => (
              <SvgText key={`y${t}`} x={L - 6} y={yOf(t) + 4} fontSize={TICK} fill={theme.textMuted} textAnchor="end">{String(t)}</SvgText>
            ))}
            {data.map((d, i) => {
              const cx = L + slot * i + slot / 2;
              const h = (d.value / top) * plotH;
              return (
                <Path
                  key={d.label}
                  d={h > 0 ? topRounded(cx - barW / 2, yOf(d.value), barW, h, 4) : ''}
                  fill={color}
                  opacity={active === null || active === i ? 1 : 0.55}
                />
              );
            })}
            {data.map((d, i) => (
              <SvgText key={`x${d.label}`} x={L + slot * i + slot / 2} y={height - 6} fontSize={TICK} fill={theme.textMuted} textAnchor="middle">{fit(d.label, slot)}</SvgText>
            ))}
          </Svg>
          {data.map((d, i) => (
            <Pressable
              key={`hit${d.label}`}
              onPress={() => setActive((a) => (a === i ? null : i))}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}: ${d.tip}`}
              style={{ position: 'absolute', left: L + slot * i, width: slot, top: 0, height }}
            />
          ))}
          {active !== null && data[active] ? (
            <Tooltip x={L + slot * active + slot / 2} y={yOf(data[active].value) - 58} width={width} label={data[active].label} tip={data[active].tip} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

type HorizontalProps = {
  data: ChartDatum[];
  color: string;
  /** Height per category row; the chart is at least 140 tall, like the dashboard. */
  rowHeight?: number;
};

// Bar chart with layout="vertical": category labels down the left, bars to the
// right with the value at each bar's end, dashed vertical grid, number axis.
export function HorizontalBarChart({ data, color, rowHeight = 40 }: HorizontalProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const height = Math.max(140, data.length * rowHeight);
  const labelW = Math.min(140, Math.max(80, width * 0.38));
  const L = labelW + 10;
  const R = 36; // room for the value label at the end of the longest bar
  const T = 4;
  const B = 24;
  const plotW = Math.max(0, width - L - R);
  const plotH = height - T - B;
  const dataMax = Math.max(...data.map((d) => d.value), 0);
  const ticks = ticksFor(dataMax);
  const top = ticks[ticks.length - 1] || 1;
  const slot = data.length ? plotH / data.length : 0;
  const barH = Math.min(slot * 0.6, 24);
  const xOf = (v: number) => L + (v / top) * plotW;

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            {ticks.map((t) => (
              <Line key={`g${t}`} x1={xOf(t)} x2={xOf(t)} y1={T} y2={T + plotH} stroke={theme.border} strokeDasharray={DASH} strokeWidth={1} />
            ))}
            {ticks.map((t) => (
              <SvgText key={`x${t}`} x={xOf(t)} y={height - 6} fontSize={TICK} fill={theme.textMuted} textAnchor="middle">{String(t)}</SvgText>
            ))}
            {data.map((d, i) => {
              const cy = T + slot * i + slot / 2;
              const w = (d.value / top) * plotW;
              return (
                <G key={d.label}>
                  <SvgText x={L - 8} y={cy + 4} fontSize={TICK} fill={theme.textMuted} textAnchor="end">{fit(d.label, labelW)}</SvgText>
                  <Path d={w > 0 ? rightRounded(L, cy - barH / 2, w, barH, 4) : ''} fill={color} opacity={active === null || active === i ? 1 : 0.55} />
                  <SvgText x={L + w + 6} y={cy + 4} fontSize={TICK} fontWeight="bold" fill={theme.text}>{String(d.value)}</SvgText>
                </G>
              );
            })}
          </Svg>
          {data.map((d, i) => (
            <Pressable
              key={`hit${d.label}`}
              onPress={() => setActive((a) => (a === i ? null : i))}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}: ${d.tip}`}
              style={{ position: 'absolute', left: 0, width, top: T + slot * i, height: slot }}
            />
          ))}
          {active !== null && data[active] ? (
            <Tooltip x={xOf(data[active].value)} y={T + slot * active - 4} width={width} label={data[active].label} tip={data[active].tip} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tip: { position: 'absolute', borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  tipTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  tipText: { fontSize: 12, lineHeight: 16 },
});
