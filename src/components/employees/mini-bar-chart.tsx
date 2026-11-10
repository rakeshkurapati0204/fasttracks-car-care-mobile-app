import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Datum = { label: string; value: number };

type Props = {
  data: Datum[];
  color: string;
  /** Axis tick text. */
  tick: (v: number) => string;
  /** Tooltip value text. */
  tip: (v: number) => string;
  name: string;
};

const HEIGHT = 140;
const TOP = 8;
const BOTTOM = 22;
const LEFT = 36;

// Smallest "nice" step that fits the data in 4 intervals (like a recharts axis).
function niceStep(max: number) {
  const raw = Math.max(max, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

// The dashboard's per-month recharts bars (Jobs / Revenue Per Month), drawn
// with react-native-svg. Tap a bar for its value (recharts shows it on hover).
export function MiniBarChart({ data, color, tick, tip, name }: Props) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const step = niceStep(Math.max(...data.map((d) => d.value), 1));
  const yMax = step * 4;
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
  const plotH = HEIGHT - TOP - BOTTOM;
  const plotW = Math.max(width - LEFT - 8, 0);
  const slot = data.length > 0 ? plotW / data.length : 0;
  const barW = Math.min(slot * 0.6, 36);
  const y = (v: number) => TOP + plotH - (v / yMax) * plotH;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.tipRow}>
        <ThemedText themeColor="textMuted" style={styles.tipText}>
          {active !== null && data[active] ? `${data[active].label} · ${name}: ${tip(data[active].value)}` : ' '}
        </ThemedText>
      </View>
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          {ticks.map((t) => (
            <G key={t}>
              <Line x1={LEFT} x2={LEFT + plotW} y1={y(t)} y2={y(t)} stroke={theme.border} strokeDasharray="3 3" />
              <SvgText x={LEFT - 6} y={y(t) + 3} fill={theme.textMuted} fontSize={10} textAnchor="end">{tick(t)}</SvgText>
            </G>
          ))}
          {data.map((d, i) => {
            const h = (d.value / yMax) * plotH;
            const x = LEFT + slot * i + (slot - barW) / 2;
            return (
              <Rect
                key={d.label}
                x={x}
                y={y(d.value)}
                width={barW}
                height={Math.max(h, 0)}
                rx={4}
                fill={color}
                opacity={active === null || active === i ? 1 : 0.55}
                onPress={() => setActive(active === i ? null : i)}
              />
            );
          })}
          {data.map((d, i) => (
            <SvgText key={`l-${d.label}`} x={LEFT + slot * i + slot / 2} y={HEIGHT - 6} fill={theme.textMuted} fontSize={10} textAnchor="middle">
              {d.label}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tipRow: { minHeight: 18, marginBottom: 4 },
  tipText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
});
