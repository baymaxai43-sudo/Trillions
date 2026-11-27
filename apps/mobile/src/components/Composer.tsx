import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, type } from '../theme';

const LINE = 22;
const MAX_LINES = 6;

export function Composer({
  busy,
  onSend,
  onStop,
  agentMode,
  onToggleAgent,
  value,
  onChangeValue,
}: {
  busy: boolean;
  onSend: (t: string) => void;
  onStop: () => void;
  agentMode?: boolean;
  onToggleAgent?: () => void;
  value?: string;
  onChangeValue?: (t: string) => void;
}) {
  const [own, setOwn] = useState('');
  const text = value ?? own;
  const setText = onChangeValue ?? setOwn;
  const [height, setHeight] = useState(LINE);
  const canSend = text.trim().length > 0;

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    setHeight(LINE);
    onSend(t);
  };

  return (
    <View style={s.shadow}>
    <View style={s.wrap}>
      <BlurView intensity={40} tint="light" experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, s.veil]} />
      <TextInput
        style={[s.input, { height: Math.min(Math.max(LINE, height), LINE * MAX_LINES) + 12 }]}
        placeholder="Ask TRILLION anything"
        placeholderTextColor={colors.textFaint}
        value={text}
        onChangeText={setText}
        onContentSizeChange={(e) => setHeight(e.nativeEvent.contentSize.height)}
        multiline
        scrollEnabled={height > LINE * MAX_LINES}
        textAlignVertical="top"
      />
      <View style={s.row}>
        <Pressable
          style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
          hitSlop={8}
          accessibilityLabel="Attach"
          onPress={() => Alert.alert('Attachments', 'Attaching files is coming soon.')}
        >
          <Ionicons name="add" size={20} color={colors.textMuted} />
        </Pressable>
        {onToggleAgent && (
          <Pressable
            onPress={onToggleAgent}
            style={({ pressed }) => [s.chip, agentMode && s.chipOn, pressed && s.pressed]}
            hitSlop={6}
            accessibilityRole="switch"
            accessibilityState={{ checked: !!agentMode }}
          >
            <Ionicons name="sparkles-outline" size={13} color={agentMode ? colors.accentDark : colors.textMuted} />
            <Text style={[s.chipText, agentMode && s.chipTextOn]}>Agent</Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={busy ? onStop : send}
          disabled={!busy && !canSend}
          style={({ pressed }) => [s.send, !busy && !canSend && s.sendOff, pressed && s.pressed]}
          accessibilityLabel={busy ? 'Stop' : 'Send'}
        >
          {busy ? <View style={s.stopSquare} /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
        </Pressable>
      </View>
    </View>
    </View>
  );
}

const s = StyleSheet.create({
  shadow: {
    marginHorizontal: space(1.5),
    marginBottom: space(1),
    marginTop: space(0.5),
    borderRadius: radius.xl,
    backgroundColor: colors.bg,
    shadowColor: '#0B3B2A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  veil: { backgroundColor: 'rgba(255,255,255,0.82)' },
  wrap: {
    overflow: 'hidden',
    paddingHorizontal: space(1.25),
    paddingTop: space(1),
    paddingBottom: space(1),
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
  },
  input: { ...type.body, lineHeight: LINE, color: colors.text, paddingHorizontal: space(0.5), paddingTop: 6, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1), marginTop: space(0.5) },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: space(1.25), borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.accentSoft, borderColor: '#BFEBD8' },
  chipText: { ...type.caption, fontWeight: '500', color: colors.textMuted },
  chipTextOn: { color: colors.accentDark },
  send: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: '#A7E3CC' },
  stopSquare: { width: 11, height: 11, borderRadius: 2, backgroundColor: '#fff' },
});
