import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, space, type } from '../theme';

export function Composer({ busy, onSend, onStop }: { busy: boolean; onSend: (t: string) => void; onStop: () => void }) {
  const [text, setText] = useState('');
  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    onSend(t);
  };
  return (
    <View style={s.wrap}>
      <Pressable style={s.attach} hitSlop={8}><Text style={s.plus}>＋</Text></Pressable>
      <TextInput
        style={s.input}
        placeholder="Ask TRILLION anything"
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        multiline
      />
      <Pressable onPress={busy ? onStop : send} style={[s.send, busy && s.stop]}>
        <Text style={s.sendGlyph}>{busy ? '■' : '↑'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', margin: space(1.5), padding: space(0.75), backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 28 },
  attach: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  plus: { fontSize: 22, color: colors.textMuted },
  input: { flex: 1, maxHeight: 140, paddingVertical: space(1), paddingHorizontal: space(0.5), color: colors.text, ...type.body },
  send: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stop: { backgroundColor: colors.primaryDark },
  sendGlyph: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
