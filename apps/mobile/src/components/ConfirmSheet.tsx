import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PendingConfirmation, toolLabel } from '../lib/agent';
import { colors, mono, radius, sheetShadow, space, type } from '../theme';

/** Bottom sheet for actions the agent may only take with the user's explicit approval. */
export function ConfirmSheet({ pending, onDecide }: { pending: PendingConfirmation | null; onDecide: (approve: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      await onDecide(approve);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={!!pending} transparent animationType="slide" statusBarTranslucent onRequestClose={() => !busy && decide(false)}>
      <View style={s.scrim}>
        <View style={[s.sheet, { paddingBottom: space(2.5) + insets.bottom }]}>
          <View style={s.grab} />
          <Text style={s.eyebrow}>Approve action</Text>
          <Text style={s.title}>{pending ? toolLabel(pending.tool) : ''}</Text>
          <Text style={s.summary}>{pending?.summary}</Text>
          {Object.keys(pending?.args ?? {}).length > 0 && (
            <ScrollView style={s.args} contentContainerStyle={{ padding: space(1.5) }}>
              {Object.entries(pending?.args ?? {}).map(([k, v]) => (
                <View key={k} style={s.argRow}>
                  <Text style={s.argKey}>{k}</Text>
                  <Text style={s.argVal} selectable>{typeof v === 'string' ? v : JSON.stringify(v, null, 2)}</Text>
                </View>
              ))}
            </ScrollView>
          )}
          <Text style={s.note}>TRILLION won't do this unless you approve.</Text>
          <View style={s.row}>
            <Pressable disabled={busy} onPress={() => decide(false)} style={({ pressed }) => [s.btn, s.decline, pressed && s.pressed]}>
              <Text style={s.declineText}>Decline</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => decide(true)} style={({ pressed }) => [s.btn, s.approve, (busy || pressed) && s.pressed]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.approveText}>Approve</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space(2.5), maxHeight: '85%', ...sheetShadow },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: space(2) },
  eyebrow: { ...type.caption, color: colors.accentDark, fontWeight: '600' },
  title: { ...type.display, fontSize: 20, color: colors.text, marginTop: 2 },
  summary: { ...type.body, color: colors.text, marginTop: space(1) },
  args: { maxHeight: 260, marginTop: space(2), backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  argRow: { marginBottom: space(1) },
  argKey: { ...type.micro, color: colors.textMuted, textTransform: 'uppercase' },
  argVal: { ...type.caption, color: colors.text, fontFamily: mono },
  note: { ...type.caption, color: colors.textMuted, marginTop: space(1.5) },
  row: { flexDirection: 'row', gap: space(1.25), marginTop: space(2) },
  btn: { flex: 1, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  decline: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderStrong },
  declineText: { ...type.body, fontWeight: '500', color: colors.text },
  approve: { backgroundColor: colors.accentDark },
  approveText: { ...type.body, fontWeight: '600', color: '#fff' },
});
