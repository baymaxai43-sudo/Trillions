import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, type } from '../theme';

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      {!!title && <Text style={s.sectionTitle}>{title}</Text>}
      <View style={s.group}>{children}</View>
    </View>
  );
}

export function Row({
  icon,
  label,
  value,
  onPress,
  locked,
  danger,
  last,
  right,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  locked?: boolean;
  danger?: boolean;
  last?: boolean;
  right?: ReactNode;
}) {
  const disabled = locked || !onPress;
  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [s.row, !last && s.divider, pressed && !disabled && s.pressed]}
      accessibilityState={{ disabled }}
    >
      {icon && <Ionicons name={icon} size={20} color={danger ? colors.danger : locked ? colors.textFaint : colors.text} style={s.icon} />}
      <Text style={[s.label, danger && s.danger, locked && s.lockedText]} numberOfLines={1}>{label}</Text>
      {right}
      {!!value && <Text style={s.value} numberOfLines={1}>{value}</Text>}
      {locked ? (
        <View style={s.lockPill}>
          <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
          <Text style={s.lockText}>Pro</Text>
        </View>
      ) : onPress && !danger ? (
        <Ionicons name="chevron-forward" size={17} color={colors.text} />
      ) : null}
    </Pressable>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <Text style={s.note}>{children}</Text>;
}

const s = StyleSheet.create({
  section: { marginTop: space(1.75) },
  sectionTitle: { ...type.caption, color: colors.textMuted, fontWeight: '500', marginBottom: space(1), marginLeft: space(1) },
  group: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.glassLine,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), minHeight: 58, paddingHorizontal: space(2), paddingVertical: space(1.25) },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(17,18,20,0.09)' },
  pressed: { backgroundColor: 'rgba(255,255,255,0.55)' },
  icon: { width: 22 },
  label: { flex: 1, fontSize: 15.5, fontWeight: '500', color: colors.text },
  danger: { color: colors.danger, fontWeight: '600' },
  lockedText: { color: colors.textFaint },
  value: { fontSize: 14.5, color: colors.textMuted, maxWidth: '45%' },
  lockPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.ink },
  lockText: { ...type.micro, color: '#fff', fontWeight: '700' },
  note: { ...type.caption, color: colors.textMuted, marginTop: space(1), marginHorizontal: space(1) },
});
