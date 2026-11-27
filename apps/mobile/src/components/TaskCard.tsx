import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type } from '../theme';

const LABEL: Record<string, string> = {
  queued: 'Queued', running: 'Working', waiting_approval: 'Needs you', completed: 'Done', failed: 'Failed', cancelled: 'Stopped',
};

/** Live card for an agent task the user can watch, stop, or approve. */
export function TaskCard({ title, step, status, onStop, onApprove }: { title: string; step?: string; status: string; onStop?: () => void; onApprove?: () => void }) {
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        <View style={s.pill}><Text style={s.pillText}>{LABEL[status] ?? status}</Text></View>
      </View>
      {step ? <Text style={s.step}>{step}</Text> : null}
      <View style={s.actions}>
        {status === 'waiting_approval' && onApprove ? (
          <Pressable style={s.primary} onPress={onApprove}><Text style={s.primaryText}>Approve</Text></Pressable>
        ) : null}
        {(status === 'running' || status === 'queued') && onStop ? (
          <Pressable style={s.ghost} onPress={onStop}><Text style={s.ghostText}>Stop</Text></Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: space(2), marginVertical: space(1) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  title: { flex: 1, ...type.body, fontWeight: '600', color: colors.text },
  pill: { backgroundColor: colors.primarySoft, borderRadius: radius.pill, paddingHorizontal: space(1.25), paddingVertical: 4 },
  pillText: { ...type.caption, color: colors.primaryDark, fontWeight: '600' },
  step: { ...type.secondary, color: colors.textMuted, marginTop: space(1) },
  actions: { flexDirection: 'row', gap: space(1), marginTop: space(1.5) },
  primary: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
  primaryText: { color: '#fff', fontWeight: '700' },
  ghost: { borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
  ghostText: { color: colors.text, fontWeight: '600' },
});
