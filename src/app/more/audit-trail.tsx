import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ACCESS_ACTION_LABELS, ACTION_LOG_LABELS, CellText, FilterCard, LogCard, TableHeader, TableMessage, TableRow, fmtWhen, type Column,
} from '@/components/audit-trail/audit-ui';
import { DateField } from '@/components/call-tracker/date-field';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchActionLog, fetchDocumentAccessLog, fetchEmployees, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { ActionLogEntry, DocumentAccessEntry } from '@/types/api';

// 4 roles only — no hr_module override: this page carries ID-number and
// approval data (same rule as the dashboard).
const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'];
const WIDE_MIN = 560;
// The server caps both logs at 200 rows, newest first.
const SERVER_CAP = 200;

type TabKey = 'documents' | 'actions';
type Person = { id: string; name: string };

const ACCESS_COLUMNS: Column[] = [
  { title: 'Employee', flex: 1.2 }, { title: 'Document', flex: 1.2 }, { title: 'Action', flex: 1 }, { title: 'Viewed By', flex: 1 }, { title: 'When', flex: 1.2 },
];
const ACTION_COLUMNS: Column[] = [
  { title: 'Action', flex: 1.1 }, { title: 'Subject', flex: 1.1 }, { title: 'Detail', flex: 1.6 }, { title: 'Actor', flex: 1 }, { title: 'When', flex: 1.1 },
];

type LogListProps<T extends { id: string }> = {
  header: ReactNode;
  wide: boolean;
  rows: T[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  columns: Column[];
  cells: (r: T) => ReactNode[];
  fields: (r: T) => { label: string; primary: string; sub?: string | null; muted?: boolean }[];
  empty: string;
  capLabel: string;
  refreshing: boolean;
  onRefresh: () => void;
  pad: number;
  bottom: number;
};

// FlatList of log rows: the page header + filters are its header; a bordered
// table on wide screens (rows carry side borders so the list reads as one card),
// stacked cards on a phone.
function LogList<T extends { id: string }>({ header, wide, rows, loading, error, onRetry, columns, cells, fields, empty, capLabel, refreshing, onRefresh, pad, bottom }: LogListProps<T>) {
  const data = !loading && rows ? rows : [];
  const message = loading || rows === null
    ? <><Skeleton height={16} width="60%" /><Skeleton height={16} width="80%" /><Skeleton height={16} width="50%" /></>
    : rows.length === 0
      ? <ThemedText themeColor="textMuted" style={styles.body}>{empty}</ThemedText>
      : null;

  return (
    <FlatList
      data={data}
      keyExtractor={(r) => r.id}
      renderItem={({ item, index }) => (wide
        ? <TableRow columns={columns} cells={cells(item)} last={index === data.length - 1} />
        : <LogCard fields={fields(item)} />)}
      ItemSeparatorComponent={wide ? undefined : Gap}
      ListHeaderComponent={<View style={styles.header}>{header}{error ? <ErrorBanner message={error} onRetry={onRetry} /> : null}{wide ? <TableHeader columns={columns} /> : null}</View>}
      ListEmptyComponent={error ? null : wide
        ? <TableMessage>{message}</TableMessage>
        : <Card padding="md"><View style={styles.phoneMessage}>{message}</View></Card>}
      ListFooterComponent={!loading && rows && rows.length >= SERVER_CAP
        ? <ThemedText themeColor="textMuted" style={[styles.small, styles.cap]}>{`Showing the most recent ${SERVER_CAP} matching ${capLabel} — narrow the filters to see older ones.`}</ThemedText>
        : null}
      refreshing={refreshing}
      onRefresh={onRefresh}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={15}
      windowSize={7}
      contentContainerStyle={{ padding: pad, paddingBottom: bottom }}
    />
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

type TabProps = { header: ReactNode; wide: boolean; employees: Person[]; pad: number; bottom: number };

// "Document Access Log": every document view / reveal.
function DocumentAccessLog({ header, wide, employees, pad, bottom }: TabProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState('');
  const [rows, setRows] = useState<DocumentAccessEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchDocumentAccessLog({ employeeId: employeeId || undefined, from: from || undefined, to: to || undefined, action: action || undefined }));
    } catch (err: unknown) {
      setRows([]);
      setError(getErrorMessage(err, 'Failed to fetch audit log.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId, from, to, action]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
    load();
  }, [load]);

  const people = useMemo(() => [{ value: '', label: 'All employees' }, ...employees.map((e) => ({ value: e.id, label: e.name }))], [employees]);
  const actions = useMemo(() => [{ value: '', label: 'All actions' }, ...Object.entries(ACCESS_ACTION_LABELS).map(([value, label]) => ({ value, label }))], []);
  const filtersOn = !!(employeeId || from || to || action);

  return (
    <LogList<DocumentAccessEntry>
      header={
        <>
          {header}
          <FilterCard showClear={filtersOn} onClear={() => { setEmployeeId(''); setFrom(''); setTo(''); setAction(''); }}>
            <Select label="Employee" options={people} value={employeeId} onChange={setEmployeeId} />
            <DateField label="From" value={from} onChange={setFrom} />
            <DateField label="To" value={to} onChange={setTo} />
            <Select label="Action" options={actions} value={action} onChange={setAction} />
          </FilterCard>
        </>
      }
      wide={wide}
      rows={rows}
      loading={loading}
      error={error}
      onRetry={load}
      columns={ACCESS_COLUMNS}
      cells={(r) => [
        <CellText key="e" primary={r.document.user.name} sub={r.document.user.employeeId} />,
        <CellText key="d" primary={r.document.label || r.document.type.replace(/_/g, ' ')} />,
        <CellText key="a" primary={ACCESS_ACTION_LABELS[r.action] ?? r.action} />,
        <CellText key="v" primary={r.viewedBy.name} />,
        <CellText key="w" primary={fmtWhen(r.createdAt)} muted />,
      ]}
      fields={(r) => [
        { label: 'Employee', primary: r.document.user.name, sub: r.document.user.employeeId },
        { label: 'Document', primary: r.document.label || r.document.type.replace(/_/g, ' ') },
        { label: 'Action', primary: ACCESS_ACTION_LABELS[r.action] ?? r.action },
        { label: 'Viewed By', primary: r.viewedBy.name },
        { label: 'When', primary: fmtWhen(r.createdAt), muted: true },
      ]}
      empty="No document access events match these filters."
      capLabel="events"
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      pad={pad}
      bottom={bottom}
    />
  );
}

// "Action Log": every hiring / discipline / letter decision HR made.
function ActionLog({ header, wide, employees, pad, bottom }: TabProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actionType, setActionType] = useState('');
  const [rows, setRows] = useState<ActionLogEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchActionLog({
        employeeId: employeeId || undefined, actorId: actorId || undefined, from: from || undefined, to: to || undefined, actionType: actionType || undefined,
      }));
    } catch (err: unknown) {
      setRows([]);
      setError(getErrorMessage(err, 'Failed to fetch action log.'));
    } finally {
      setLoading(false);
    }
  }, [employeeId, actorId, from, to, actionType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
    load();
  }, [load]);

  const everyone = useMemo(() => [{ value: '', label: 'Everyone' }, ...employees.map((e) => ({ value: e.id, label: e.name }))], [employees]);
  const anyone = useMemo(() => [{ value: '', label: 'Anyone' }, ...employees.map((e) => ({ value: e.id, label: e.name }))], [employees]);
  const types = useMemo(() => [{ value: '', label: 'All actions' }, ...Object.entries(ACTION_LOG_LABELS).map(([value, label]) => ({ value, label }))], []);
  const filtersOn = !!(employeeId || actorId || from || to || actionType);

  return (
    <LogList<ActionLogEntry>
      header={
        <>
          {header}
          <FilterCard showClear={filtersOn} onClear={() => { setEmployeeId(''); setActorId(''); setFrom(''); setTo(''); setActionType(''); }}>
            <Select label="Employee / Candidate" options={everyone} value={employeeId} onChange={setEmployeeId} />
            <Select label="Actor (HR staff)" options={anyone} value={actorId} onChange={setActorId} />
            <DateField label="From" value={from} onChange={setFrom} />
            <DateField label="To" value={to} onChange={setTo} />
            <Select label="Action type" options={types} value={actionType} onChange={setActionType} />
          </FilterCard>
        </>
      }
      wide={wide}
      rows={rows}
      loading={loading}
      error={error}
      onRetry={load}
      columns={ACTION_COLUMNS}
      cells={(r) => [
        <CellText key="a" primary={ACTION_LOG_LABELS[r.actionType] ?? r.actionType} />,
        <CellText key="s" primary={r.subjectName ?? '—'} sub={r.subjectEmployeeId} />,
        <CellText key="d" primary={r.detail} />,
        <CellText key="c" primary={r.actorName} />,
        <CellText key="w" primary={fmtWhen(r.timestamp)} muted />,
      ]}
      fields={(r) => [
        { label: 'Action', primary: ACTION_LOG_LABELS[r.actionType] ?? r.actionType },
        { label: 'Subject', primary: r.subjectName ?? '—', sub: r.subjectEmployeeId },
        { label: 'Detail', primary: r.detail },
        { label: 'Actor', primary: r.actorName },
        { label: 'When', primary: fmtWhen(r.timestamp), muted: true },
      ]}
      empty="No HR actions match these filters."
      capLabel="actions"
      refreshing={refreshing}
      onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
      pad={pad}
      bottom={bottom}
    />
  );
}

export default function AuditTrailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const allowed = ADMIN_ROLES.includes(user?.role ?? '');

  const [width, setWidth] = useState(0);
  const [tab, setTab] = useState<TabKey>('documents');
  const [employees, setEmployees] = useState<Person[]>([]);

  useEffect(() => {
    if (!allowed) return;
    // The pickers are a convenience: if the list can't load they stay empty (as
    // on the dashboard) and the logs still work unfiltered.
    fetchEmployees()
      .then((list) => setEmployees(list.filter((e) => e.isActive).map((e) => ({ id: e.id, name: e.name }))))
      .catch(() => setEmployees([]));
  }, [allowed]);

  if (!allowed) {
    return (
      <ThemedView style={styles.denied}>
        <Stack.Screen options={{ title: 'Audit Trail' }} />
        <ThemedText themeColor="textMuted" style={styles.body}>Audit Trail is available to Owner, Store Manager, HR and Accounting roles only.</ThemedText>
      </ThemedView>
    );
  }

  const wide = width >= WIDE_MIN;
  const pad = wide ? 24 : 16;

  const header = (
    <View style={styles.headerStack}>
      <View>
        <ThemedText style={styles.h1}>Audit Trail</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.subtitle}>
          Document Access Log — every document view/reveal — and the HR Action Log — every hiring/discipline/letter decision HR made.
        </ThemedText>
      </View>
      <View style={[styles.switcher, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {([['documents', 'Document Access Log'], ['actions', 'Action Log']] as [TabKey, string][]).map(([key, label]) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.pill, { backgroundColor: active ? theme.primary : 'transparent' }]}>
              <ThemedText style={[styles.pillText, { color: active ? '#fff' : theme.textMuted }]}>{label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const common = { header, wide, employees, pad, bottom: insets.bottom + 40 };

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Audit Trail' }} />
      {tab === 'documents' ? <DocumentAccessLog key="documents" {...common} /> : <ActionLog key="actions" {...common} />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  denied: { flex: 1, padding: 24 },
  header: { gap: 16, marginBottom: 16 },
  headerStack: { gap: 16 },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  switcher: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'flex-start', gap: 4, padding: 4, borderRadius: Radii.sm, borderWidth: 1 },
  pill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, minHeight: 36, justifyContent: 'center' },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  gap: { height: 8 },
  phoneMessage: { gap: 8, alignItems: 'center' },
  cap: { marginTop: 12 },
});
