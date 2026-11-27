import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, space, type } from '../theme';

export function Composer({
  busy,
  onSend,
  onStop,
  agentMode,
  onToggleAgent,
}: {
  busy: boolean;
  onSend: (t: string) => void;
  onStop: () => void;
  agentMode?: boolean;
  onToggleAgent?: () => void;
}) {
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    onSend(t);
  };
  return (
    <View style={s.wrap}>
      <TextInput
        style={s.input}
        placeholder={agentMode ? 'Give TRILLION a task' : 'Ask TRILLION anything'}
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        multiline
      />
      <View style={s.row}>
        <Pressable style={s.attach} hitSlop={8}><Text style={s.plus}>＋</Text></Pressable>
        {onToggleAgent && (
          <Pressable onPress={onToggleAgent} style={[s.chip, agentMode && s.chipOn]} hitSlop={6} accessibilityRole="switch" accessibilityState={{ checked: !!agentMode }}>
            <Text style={[s.chipGlyph, agentMode && s.chipTextOn]}>✦</Text>
            <Text style={[s.chipText, agentMode && s.chipTextOn]}>Agent</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable onPress={busy ? onStop : send} style={[s.send, busy && s.stop]}>
          <Text style={s.sendGlyph}>{busy ? '■' : '↑'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { margin: space(1.5), padding: space(1), backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 26 },
  input: { maxHeight: 140, minHeight: 40, paddingVertical: space(0.75), paddingHorizontal: space(1), color: colors.text, ...type.body },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  attach: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: colors.border },
  plus: { fontSize: 20, color: colors.textMuted },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: space(1.5), borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipGlyph: { fontSize: 13, color: colors.textMuted },
  chipText: { ...type.secondary, fontWeight: '600', color: colors.textMuted },
  chipTextOn: { color: colors.primaryDark },
  send: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stop: { backgroundColor: colors.primaryDark },
  sendGlyph: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
