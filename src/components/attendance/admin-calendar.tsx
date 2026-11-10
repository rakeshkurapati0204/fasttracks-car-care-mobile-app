import { Pressable, StyleSheet, View } from 'react-native';

import { DAY_SHORT, MONTH_NAMES } from '@/components/attendance/attendance-format';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  month: number;
  year: number;
  isCurrentMonth: boolean;
  onOpenDay: (date: string) => void;
};

// Dashboard admin calendar: "<Month> <year> — tap any day", a 7-column grid
// (today filled primary, future days disabled), and the hint line. A past day
// opens that day's DayModal.
export function AdminCalendar({ month, year, isCurrentMonth, onOpenDay }: Props) {
  const theme = useTheme();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const todayDate = new Date().getDate();
  const mm = String(month + 1).padStart(2, '0');

  const cells: (number | null)[] = [...Array.from({ length: firstDow }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View>
      <ThemedText style={styles.h2}>{`${MONTH_NAMES[month]} ${year} — tap any day`}</ThemedText>
      <Card padding="md">
        <View style={styles.row}>
          {DAY_SHORT.map((d) => <ThemedText key={d} themeColor="textMuted" style={styles.dow}>{d}</ThemedText>)}
        </View>
        <View style={styles.grid}>
          {weeks.map((week, w) => (
            <View key={w} style={styles.row}>
              {week.map((day, i) => {
                if (day === null) return <View key={`e${i}`} style={styles.cellWrap} />;
                const isToday = isCurrentMonth && day === todayDate;
                const isFuture = isCurrentMonth && day > todayDate;
                const dateStr = `${year}-${mm}-${String(day).padStart(2, '0')}`;
                const dow = new Date(year, month, day).getDay();
                return (
                  <View key={day} style={styles.cellWrap}>
                    <Pressable
                      disabled={isFuture}
                      onPress={() => onOpenDay(dateStr)}
                      accessibilityRole="button"
                      accessibilityLabel={dateStr}
                      style={[styles.cell, { backgroundColor: isToday ? theme.primary : isFuture ? 'transparent' : theme.backgroundElement }]}>
                      <ThemedText style={[styles.day, { color: isToday ? '#fff' : isFuture ? theme.border : theme.text }]}>{day}</ThemedText>
                      <ThemedText style={[styles.dayDow, { color: isToday ? '#fff' : isFuture ? theme.border : theme.textMuted }]}>{DAY_SHORT[dow]}</ThemedText>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <ThemedText themeColor="textMuted" style={styles.hint}>{"Tap any past date to see that day's absentees and punch log"}</ThemedText>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  h2: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.bold, marginBottom: 12 },
  row: { flexDirection: 'row' },
  grid: { gap: 4 },
  dow: { flex: 1, textAlign: 'center', fontSize: 11, lineHeight: 16, fontFamily: FontWeights.semiBold, paddingVertical: 4 },
  cellWrap: { flex: 1, padding: 2 },
  cell: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: 14, lineHeight: 16, fontFamily: FontWeights.bold },
  dayDow: { fontSize: 9, lineHeight: 12, fontFamily: FontWeights.medium, marginTop: 2, opacity: 0.6 },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
});
