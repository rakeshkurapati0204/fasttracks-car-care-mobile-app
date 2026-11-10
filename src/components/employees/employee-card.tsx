import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getAvatarColor, getInitials, inr, roleLabel, roleVariant } from '@/components/employees/employee-format';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import type { EmployeeCardItem } from '@/types/api';

export type CardFlags = { isOwner: boolean; isStoreManager: boolean; hasEmployeesPerm: boolean };

type Props = {
  emp: EmployeeCardItem;
  flags: CardFlags;
  onEdit: (e: EmployeeCardItem) => void;
  onDetails: (e: EmployeeCardItem) => void;
  onRemark: (e: EmployeeCardItem) => void;
  onReset: (e: EmployeeCardItem) => void;
  onDeactivate: (e: EmployeeCardItem) => void;
  onDelete: (e: EmployeeCardItem) => void;
};

// Dashboard Team card. Every button's visibility is the dashboard's own rule.
function EmployeeCardBase({ emp, flags, onEdit, onDetails, onRemark, onReset, onDeactivate, onDelete }: Props) {
  const { isOwner, isStoreManager, hasEmployeesPerm } = flags;
  // A store manager cannot touch the Founder or a peer store manager.
  const managerLocked = isStoreManager && (emp.role === 'OWNER' || emp.role === 'STORE_MANAGER');

  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.top}>
        <View style={styles.who}>
          <View style={[styles.avatar, { backgroundColor: getAvatarColor(emp.name) }]}>
            <ThemedText style={styles.avatarText}>{getInitials(emp.name)}</ThemedText>
          </View>
          <View style={styles.flex1}>
            <ThemedText style={styles.name} numberOfLines={1}>{emp.name}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small} numberOfLines={1}>@{emp.username}</ThemedText>
            {emp.designation ? <ThemedText themeColor="textSecondary" style={[styles.small, styles.designation]} numberOfLines={1}>{emp.designation}</ThemedText> : null}
          </View>
        </View>
        <View style={styles.badges}>
          <Badge size="sm" variant={roleVariant(emp.role)}>{roleLabel(emp.role)}</Badge>
          <Badge size="sm" variant={emp.isActive ? 'success' : 'danger'} dot>{emp.isActive ? 'Active' : 'Inactive'}</Badge>
        </View>
      </View>

      <View style={styles.between}>
        {emp.phone ? <ThemedText themeColor="textMuted" style={styles.mono}>{emp.phone}</ThemedText> : <View />}
        {emp.monthlySalary ? (
          <View style={styles.salary}>
            <ThemedText style={styles.salaryText}>{inr(emp.monthlySalary)}/mo</ThemedText>
          </View>
        ) : null}
      </View>

      {emp.branch ? (
        <View style={styles.branch}>
          <ThemedText style={styles.branchText}>{emp.branch}</ThemedText>
        </View>
      ) : null}

      <View style={styles.actions}>
        {!managerLocked ? <Button size="sm" onPress={() => onEdit(emp)}>Edit</Button> : null}
        <Button size="sm" variant="outline" onPress={() => onDetails(emp)}>View Details</Button>
        {isOwner && emp.role !== 'OWNER' ? (
          <Pressable
            onPress={() => onRemark(emp)}
            accessibilityRole="button"
            accessibilityLabel={`Add remark for ${emp.name}`}
            style={({ pressed }) => [styles.remark, pressed && { opacity: 0.6 }]}>
            <Ionicons name="document-text-outline" size={14} color="#4f46e5" />
            <ThemedText style={styles.remarkText}>Add Remark</ThemedText>
          </Pressable>
        ) : null}
        {!hasEmployeesPerm && !managerLocked ? <Button size="sm" variant="secondary" onPress={() => onReset(emp)}>Reset Password</Button> : null}
        {!hasEmployeesPerm && emp.isActive && emp.role !== 'OWNER' && !(isStoreManager && emp.role === 'STORE_MANAGER') ? (
          <Button size="sm" variant="ghost" onPress={() => onDeactivate(emp)}>Deactivate</Button>
        ) : null}
        {isOwner && emp.role !== 'OWNER' ? <Button size="sm" variant="danger" onPress={() => onDelete(emp)}>Delete</Button> : null}
      </View>
    </Card>
  );
}

// Memoised: the list passes stable callbacks, so only a changed employee re-renders.
export const EmployeeCard = memo(EmployeeCardBase);

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  card: { gap: 16 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  name: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.semiBold },
  small: { fontSize: 12, lineHeight: 16 },
  designation: { marginTop: 2, fontFamily: FontWeights.medium },
  badges: { alignItems: 'flex-end', gap: 4 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mono: { fontSize: 12, lineHeight: 16, fontFamily: Fonts?.mono },
  salary: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radii.pill, backgroundColor: 'rgba(34,197,94,0.12)' },
  salaryText: { fontSize: 12, lineHeight: 18, fontFamily: Fonts?.mono, fontWeight: '600', color: '#15803d' },
  branch: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radii.pill, backgroundColor: 'rgba(99,102,241,0.1)' },
  branchText: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.medium, color: '#6366f1' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  remark: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, borderRadius: Radii.sm, borderWidth: 1, backgroundColor: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.35)' },
  remarkText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium, color: '#4f46e5' },
});
