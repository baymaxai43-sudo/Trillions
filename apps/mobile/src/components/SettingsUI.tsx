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
      {icon && <Ionicons name={icon} size={18} color={danger ? colors.danger : locked ? colors.textFaint : colors.textMuted} style={s.icon} />}
      <Text style={[s.label, danger && s.danger, locked && s.lockedText]} numberOfLines={1}>{label}</Text>
      {right}
      {!!value && <Text style={s.value} numberOfLines={1}>{value}</Text>}
      {locked ? (
        <View style={s.lockPill}>
          <Ionicons name="lock-closed" size={11} color={colors.textMuted} />
          <Text style={s.lockText}>Pro</Text>
        </View>
      ) : onPress && !danger ? (
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      ) : null}
    </Pressable>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <Text style={s.note}>{children}</Text>;
}

const s = StyleSheet.create({
  section: { marginTop: space(3) },
  sectionTitle: { ...type.micro, color: colors.textFaint, textTransform: 'uppercase', marginBottom: space(1), marginLeft: space(0.5) },
  group: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.bg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.25), minHeight: 50, paddingHorizontal: space(1.75), paddingVertical: space(1.25) },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.surface },
  icon: { width: 20 },
  label: { flex: 1, ...type.secondary, color: colors.text },
  danger: { color: colors.danger, fontWeight: '500' },
  lockedText: { color: colors.textFaint },
  value: { ...type.caption, fontSize: 14, color: colors.textMuted, maxWidth: '45%' },
  lockPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  lockText: { ...type.micro, color: colors.textMuted, fontWeight: '600' },
  note: { ...type.caption, color: colors.textMuted, marginTop: space(1), marginHorizontal: space(0.5) },
});
