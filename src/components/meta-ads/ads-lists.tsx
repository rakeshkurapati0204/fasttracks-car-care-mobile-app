import { ScrollView, StyleSheet, View } from 'react-native';

import { clock, dayLabel, DrillLink, dur, Empty, inr, num, SourceChip, TierChip } from '@/components/meta-ads/ads-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AdLead, AdsDayRow, AdsOwnerRow, AdsRunningRow } from '@/types/api';

export type Drill = (f: {
  owner?: string; ad?: { id: string; name: string }; date?: string; tier?: string; paid?: string; waiting?: boolean;
}) => void;

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.metric}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.metricLabel}>{label}</ThemedText>
      {children}
    </View>
  );
}

// The dashboard's AdsTable, one card per ad: Ad / campaign, Spend, Clicks,
// Leads, Cost / lead. An ad that ran before lead capture shows — and "ran
// before lead capture", never a made-up zero.
const ADS_COLS = [
  { label: 'Ad / campaign', flex: 4 }, { label: 'Spend', flex: 1.4, right: true }, { label: 'Clicks', flex: 1.2, right: true },
  { label: 'Leads', flex: 1.2, right: true }, { label: 'Cost / lead', flex: 2, right: true },
];

function WideHead({ cols }: { cols: { label: string; flex: number; right?: boolean }[] }) {
  const theme = useTheme();
  return (
    <View style={[styles.wtr, { borderBottomColor: theme.border }]}>
      {cols.map((c) => (
        <ThemedText key={c.label} themeColor="textMuted" style={[styles.wth, { flex: c.flex }, c.right && styles.wright]}>{c.label.toUpperCase()}</ThemedText>
      ))}
    </View>
  );
}

export function AdsList({ rows, onDrill, wide }: { rows: AdsRunningRow[]; onDrill?: Drill; wide?: boolean }) {
  const theme = useTheme();
  if (!rows.length) return <Empty />;
  if (wide) {
    return (
      <View>
        <WideHead cols={ADS_COLS} />
        {rows.map((r, i) => {
          const drillAd = r.adId ? () => onDrill?.({ ad: { id: r.adId!, name: r.adName ?? r.adId! } }) : undefined;
          return (
            <View key={r.adId ?? i} style={[styles.wtr, { borderBottomColor: theme.border }]}>
              <View style={{ flex: 4, paddingHorizontal: 12, paddingVertical: 10 }}>
                {onDrill && drillAd && (r.leads ?? 0) > 0 ? <DrillLink onPress={drillAd} bold>{r.adName ?? 'Unnamed ad'}</DrillLink> : <ThemedText style={styles.wbold}>{r.adName ?? 'Unnamed ad'}</ThemedText>}
                <ThemedText themeColor="textMuted" style={styles.wsub}>{r.campaignName ?? '—'}</ThemedText>
              </View>
              <ThemedText style={[styles.wtd, styles.wcell, { flex: 1.4 }, styles.wright]}>{inr(r.spend)}</ThemedText>
              <ThemedText style={[styles.wtd, styles.wcell, { flex: 1.2 }, styles.wright]}>{num(r.clicks)}</ThemedText>
              <View style={[styles.wtd, { flex: 1.2, alignItems: 'flex-end' }]}>
                {r.comparable ? (onDrill && drillAd ? <DrillLink onPress={drillAd} disabled={!r.leads}>{num(r.leads)}</DrillLink> : <ThemedText style={styles.wcell}>{num(r.leads)}</ThemedText>) : <ThemedText style={styles.wcell}>—</ThemedText>}
              </View>
              <View style={[styles.wtd, { flex: 2, alignItems: 'flex-end' }]}>
                {r.comparable ? <ThemedText style={[styles.wcell, styles.wbold]}>{inr(r.costPerLead)}</ThemedText> : <ThemedText themeColor="textMuted" style={styles.wsub}>ran before lead capture</ThemedText>}
              </View>
            </View>
          );
        })}
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {rows.map((r, i) => {
        const drillAd = r.adId ? () => onDrill?.({ ad: { id: r.adId!, name: r.adName ?? r.adId! } }) : undefined;
        return (
          <ThemedView key={r.adId ?? i} type="backgroundElement" style={styles.card}>
            {onDrill && drillAd && (r.leads ?? 0) > 0 ? (
              <DrillLink onPress={drillAd} bold>{r.adName ?? 'Unnamed ad'}</DrillLink>
            ) : (
              <ThemedText type="smallBold">{r.adName ?? 'Unnamed ad'}</ThemedText>
            )}
            <ThemedText type="small" themeColor="textSecondary">{r.campaignName ?? '—'}</ThemedText>
            <View style={styles.metrics}>
              <Metric label="SPEND"><ThemedText type="small">{inr(r.spend)}</ThemedText></Metric>
              <Metric label="CLICKS"><ThemedText type="small">{num(r.clicks)}</ThemedText></Metric>
              <Metric label="LEADS">
                {r.comparable ? (
                  onDrill && drillAd ? <DrillLink onPress={drillAd} disabled={!r.leads}>{num(r.leads)}</DrillLink> : <ThemedText type="small">{num(r.leads)}</ThemedText>
                ) : <ThemedText type="small">—</ThemedText>}
              </Metric>
              <Metric label="COST / LEAD">
                {r.comparable ? (
                  <ThemedText type="smallBold">{inr(r.costPerLead)}</ThemedText>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">ran before lead capture</ThemedText>
                )}
              </Metric>
            </View>
          </ThemedView>
        );
      })}
    </View>
  );
}

// The dashboard's LeadTable, one card per lead: Lead / vehicle (+ grade), Source,
// Received · IST, Accepted by, Latest recorded remark.
const LEAD_COLS = [
  { label: 'Lead / vehicle', flex: 3.2 }, { label: 'Source', flex: 1.6 }, { label: 'Received · IST', flex: 1.6 },
  { label: 'Accepted by', flex: 2.2 }, { label: 'Latest recorded remark', flex: 3 },
];

export function LeadList({ rows, wide }: { rows: AdLead[]; wide?: boolean }) {
  const theme = useTheme();
  if (!rows.length) return <Empty />;
  if (wide) {
    return (
      <View>
        <WideHead cols={LEAD_COLS} />
        {rows.map((l) => (
          <View key={l.id} style={[styles.wtr, { borderBottomColor: theme.border, alignItems: 'flex-start' }]}>
            <View style={{ flex: 3.2, paddingHorizontal: 12, paddingVertical: 10, gap: 2 }}>
              <View style={styles.leadHead}>
                <ThemedText numberOfLines={1} style={[styles.wbold, styles.flex1]}>{l.name?.trim() || 'Not recorded'}</ThemedText>
                <TierChip tier={l.tier} />
              </View>
              <ThemedText themeColor="textMuted" style={styles.wsub}>{[l.vehicle, l.service].filter(Boolean).join(' · ') || 'Not recorded'}</ThemedText>
            </View>
            <View style={[styles.wtd, { flex: 1.6 }]}><SourceChip paid={l.isPaid} /></View>
            <View style={[styles.wtd, { flex: 1.6 }]}>
              <ThemedText style={styles.wcell}>{dayLabel(l.arrivedAt.slice(0, 10))}</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.wsub}>{clock(l.arrivedAt)}</ThemedText>
            </View>
            <View style={[styles.wtd, { flex: 2.2 }]}>
              {l.seenBy ? (
                <>
                  <ThemedText style={styles.wbold}>{l.seenBy}</ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.wsub}>{(l.seenAt ? 'Accepted at ' + clock(l.seenAt) : 'Time not recorded') + (l.responseSec != null ? ' · ' + dur(l.responseSec) : '')}</ThemedText>
                </>
              ) : <ThemedText themeColor="textMuted" style={styles.wsub}>Not accepted</ThemedText>}
            </View>
            <View style={[styles.wtd, { flex: 3 }]}>
              {l.remark ? <ThemedText style={styles.wcell}>{l.remark}</ThemedText> : <ThemedText themeColor="textMuted" style={styles.wcell}>No remark recorded</ThemedText>}
            </View>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {rows.map((l) => (
        <ThemedView key={l.id} type="backgroundElement" style={styles.card}>
          <View style={styles.leadHead}>
            <ThemedText type="smallBold" style={styles.flex1} numberOfLines={1}>{l.name?.trim() || 'Not recorded'}</ThemedText>
            <TierChip tier={l.tier} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {[l.vehicle, l.service].filter(Boolean).join(' · ') || 'Not recorded'}
          </ThemedText>
          <View style={styles.leadMeta}>
            <SourceChip paid={l.isPaid} />
            <ThemedText type="small" themeColor="textSecondary">
              {dayLabel(l.arrivedAt.slice(0, 10))} · {clock(l.arrivedAt)} IST
            </ThemedText>
          </View>
          {l.seenBy ? (
            <View>
              <ThemedText type="small"><ThemedText type="smallBold">{l.seenBy}</ThemedText></ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {l.seenAt ? `Accepted at ${clock(l.seenAt)}` : 'Time not recorded'}
                {l.responseSec != null ? ` · ${dur(l.responseSec)}` : ''}
              </ThemedText>
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">Not accepted</ThemedText>
          )}
          {l.remark ? (
            <ThemedText type="small">{l.remark}</ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">No remark recorded</ThemedText>
          )}
        </ThemedView>
      ))}
    </View>
  );
}

function TableHead({ cols }: { cols: { label: string; w: number; right?: boolean }[] }) {
  const theme = useTheme();
  return (
    <View style={[styles.tr, { borderBottomColor: theme.backgroundElement }]}>
      {cols.map((c) => (
        <ThemedText key={c.label} type="small" themeColor="textSecondary" style={[styles.th, { width: c.w }, c.right && styles.right]}>
          {c.label.toUpperCase()}
        </ThemedText>
      ))}
    </View>
  );
}

// "Day by day" — every column of the dashboard's Daily report, horizontally
// scrollable on a phone. Counts open the leads behind them.
const DAILY_COLS = [
  { label: 'Date', w: 76 }, { label: 'Leads', w: 56, right: true }, { label: 'Paid', w: 52, right: true },
  { label: 'Direct', w: 58, right: true }, { label: 'Premium', w: 70, right: true }, { label: 'Waiting', w: 66, right: true },
  { label: 'Spend', w: 80, right: true }, { label: 'Cost / lead', w: 90, right: true },
];

export function DailyTable({ rows, onDrill }: { rows: AdsDayRow[]; onDrill: Drill }) {
  const theme = useTheme();
  if (!rows.length) return <Empty />;
  const cell = (w: number, right = true) => [styles.td, { width: w }, right && styles.right];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <TableHead cols={DAILY_COLS} />
        {rows.map((r) => (
          <View key={r.date} style={[styles.tr, { borderBottomColor: theme.backgroundElement }]}>
            <View style={cell(76, false)}><DrillLink onPress={() => onDrill({ date: r.date })} bold>{dayLabel(r.date)}</DrillLink></View>
            <View style={cell(56)}><DrillLink onPress={() => onDrill({ date: r.date })} disabled={!r.leads} bold>{num(r.leads)}</DrillLink></View>
            <View style={cell(52)}><DrillLink onPress={() => onDrill({ date: r.date, paid: '1' })} disabled={!r.paid}>{num(r.paid)}</DrillLink></View>
            <View style={cell(58)}><DrillLink onPress={() => onDrill({ date: r.date, paid: '0' })} disabled={!r.organic}>{num(r.organic)}</DrillLink></View>
            <View style={cell(70)}><DrillLink onPress={() => onDrill({ date: r.date, tier: 'premium,mid' })} disabled={!r.premium}>{num(r.premium)}</DrillLink></View>
            <View style={cell(66)}><DrillLink onPress={() => onDrill({ date: r.date, waiting: true })} disabled={!r.waiting}>{num(r.waiting)}</DrillLink></View>
            <View style={cell(80)}><ThemedText type="small" style={styles.right}>{inr(r.spend)}</ThemedText></View>
            <View style={cell(90)}><ThemedText type="small" style={styles.right}>{r.spend > 0 ? inr(r.costPerLead) : '—'}</ThemedText></View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// "Who picked up what" — Team member, Leads accepted, Median response, Share.
const TEAM_COLS = [
  { label: 'Team member', w: 130 }, { label: 'Leads accepted', w: 104, right: true },
  { label: 'Median response', w: 112, right: true }, { label: 'Share', w: 60, right: true },
];

export function TeamTable({ owners, accepted, onDrill }: { owners: AdsOwnerRow[]; accepted: number; onDrill: Drill }) {
  const theme = useTheme();
  if (!owners.length) return <Empty />;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <TableHead cols={TEAM_COLS} />
        {owners.map((o) => (
          <View key={o.name} style={[styles.tr, { borderBottomColor: theme.backgroundElement }]}>
            <View style={[styles.td, { width: 130 }]}><DrillLink onPress={() => onDrill({ owner: o.name })} bold>{o.name}</DrillLink></View>
            <View style={[styles.td, styles.right, { width: 104 }]}><DrillLink onPress={() => onDrill({ owner: o.name })}>{num(o.leads)}</DrillLink></View>
            <View style={[styles.td, { width: 112 }]}><ThemedText type="small" style={styles.right}>{dur(o.medianSec)}</ThemedText></View>
            <View style={[styles.td, { width: 60 }]}>
              <ThemedText type="small" style={styles.right}>{accepted > 0 ? `${Math.round((o.leads / accepted) * 100)}%` : '—'}</ThemedText>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wtr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  wth: { paddingHorizontal: 12, paddingVertical: 8, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  wtd: { paddingHorizontal: 12, paddingVertical: 10, minWidth: 0 },
  wcell: { fontSize: 13, lineHeight: 18 },
  wbold: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  wsub: { fontSize: 11.5, lineHeight: 16 },
  wright: { textAlign: 'right' },
  flex1: { flex: 1 },
  list: { gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, marginTop: Spacing.one },
  metric: { gap: 2, minWidth: 64 },
  metricLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  leadHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  leadMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 40 },
  th: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8 },
  td: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, justifyContent: 'center' },
  right: { textAlign: 'right', alignItems: 'flex-end' },
});
