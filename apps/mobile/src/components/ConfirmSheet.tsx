import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PendingConfirmation, toolLabel } from '../lib/agent';
import { colors, radius, space, type } from '../theme';

/** Bottom sheet for actions the agent may only take with the user's explicit approval. */
export function ConfirmSheet({ pending, onDecide }: { pending: PendingConfirmation | null; onDecide: (approve: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      await onDecide(approve);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={!!pending} transparent animationType="slide" onRequestClose={() => !busy && decide(false)}>
      <View style={s.scrim}>
        <View style={s.sheet}>
          <View style={s.grab} />
          <Text style={s.eyebrow}>APPROVE ACTION</Text>
          <Text style={s.title}>{pending ? toolLabel(pending.tool) : ''}</Text>
          <Text style={s.summary}>{pending?.summary}</Text>
          <ScrollView style={s.args} contentContainerStyle={{ padding: space(1.5) }}>
            {Object.entries(pending?.args ?? {}).map(([k, v]) => (
              <View key={k} style={s.argRow}>
                <Text style={s.argKey}>{k}</Text>
                <Text style={s.argVal} selectable>{typeof v === 'string' ? v : JSON.stringify(v, null, 2)}</Text>
              </View>
            ))}
          </ScrollView>
          <Text style={s.note}>TRILLION won't do this unless you approve.</Text>
          <View style={s.row}>
            <Pressable disabled={busy} onPress={() => decide(false)} style={[s.btn, s.decline]}>
              <Text style={s.declineText}>Decline</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => decide(true)} style={[s.btn, s.approve, busy && { opacity: 0.6 }]}>
              <Text style={s.approveText}>{busy ? 'Sending…' : 'Approve'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(6,42,30,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: space(2.5), paddingBottom: space(4), maxHeight: '85%' },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: space(2) },
  eyebrow: { ...type.caption, color: colors.primaryDark, fontWeight: '700', letterSpacing: 0.8 },
  title: { ...type.display, fontSize: 22, color: colors.text, marginTop: 4 },
  summary: { ...type.body, color: colors.text, marginTop: space(1) },
  args: { maxHeight: 260, marginTop: space(2), backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border },
  argRow: { marginBottom: space(1) },
  argKey: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase' },
  argVal: { ...type.secondary, color: colors.text, fontFamily: 'monospace' },
  note: { ...type.caption, color: colors.textMuted, marginTop: space(1.5) },
  row: { flexDirection: 'row', gap: space(1.5), marginTop: space(2) },
  btn: { flex: 1, height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  decline: { backgroundColor: colors.surfaceAlt },
  declineText: { ...type.body, fontWeight: '600', color: colors.text },
  approve: { backgroundColor: colors.primary },
  approveText: { ...type.body, fontWeight: '700', color: '#fff' },
});
