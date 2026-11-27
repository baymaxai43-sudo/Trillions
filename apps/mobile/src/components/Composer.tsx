import { Ref, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space, type } from '../theme';

const LINE = 21;
const MAX_LINES = 6;

/**
 * Hark-style floating composer: one frosted pill with the input, a + (attach / agent mode)
 * and a mic that turns into a black send button once there is text.
 */
export function Composer({
  busy,
  onSend,
  onStop,
  agentMode,
  onToggleAgent,
  value,
  onChangeValue,
  placeholder = 'Message TRILLION',
  inputRef,
}: {
  busy: boolean;
  onSend: (t: string) => void;
  onStop: () => void;
  agentMode?: boolean;
  onToggleAgent?: () => void;
  value?: string;
  onChangeValue?: (t: string) => void;
  placeholder?: string;
  /** Lets the screen focus the input (e.g. after Reply on a summary). */
  inputRef?: Ref<TextInput>;
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

  const plus = () => {
    const opts: { text: string; onPress?: () => void; style?: 'cancel' }[] = [
      { text: 'Attach a file', onPress: () => Alert.alert('Attachments', 'Attaching files is coming soon.') },
    ];
    if (onToggleAgent) opts.push({ text: agentMode ? 'Turn agent mode off' : 'Turn agent mode on', onPress: onToggleAgent });
    opts.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Add to message', undefined, opts);
  };

  const inputH = Math.min(Math.max(LINE, height), LINE * MAX_LINES);

  return (
    <View style={s.outer}>
      <View style={[s.pill, inputH > LINE + 2 && s.pillTall]}>
        <TextInput
          ref={inputRef}
          style={[s.input, { height: inputH + 16 }]}
          placeholder={agentMode ? 'Give TRILLION a task' : placeholder}
          placeholderTextColor="rgba(17,18,20,0.45)"
          value={text}
          onChangeText={setText}
          onContentSizeChange={(e) => Platform.OS !== 'web' && setHeight(e.nativeEvent.contentSize.height)}
          multiline
          scrollEnabled={height > LINE * MAX_LINES}
          textAlignVertical="center"
        />
        <View style={s.actions}>
          {agentMode && <View style={s.agentDot} accessibilityLabel="Agent mode on" />}
          <Pressable onPress={plus} hitSlop={8} style={({ pressed }) => [s.icon, pressed && s.pressed]} accessibilityLabel="Add">
            <Ionicons name="add" size={24} color="rgba(17,18,20,0.6)" />
          </Pressable>
          {busy ? (
            <Pressable onPress={onStop} style={({ pressed }) => [s.send, pressed && s.pressed]} accessibilityLabel="Stop">
              <View style={s.stopSquare} />
            </Pressable>
          ) : canSend ? (
            <Pressable onPress={send} style={({ pressed }) => [s.send, pressed && s.pressed]} accessibilityLabel="Send">
              <Ionicons name="arrow-up" size={19} color="#fff" />
            </Pressable>
          ) : (
            <Pressable onPress={() => Alert.alert('Voice', 'Voice input is coming soon.')} hitSlop={8} style={({ pressed }) => [s.icon, pressed && s.pressed]} accessibilityLabel="Voice">
              <Ionicons name="mic-outline" size={21} color="rgba(17,18,20,0.6)" />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  outer: { paddingHorizontal: space(2), paddingTop: space(0.75), paddingBottom: space(1.25) },
  pill: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 54,
    borderRadius: 27,
    paddingLeft: space(2.25),
    paddingRight: space(0.75),
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#1B2A44',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  pillTall: { borderRadius: 24 },
  input: { flex: 1, ...type.body, fontSize: 16, lineHeight: LINE, color: colors.text, paddingVertical: 8, marginBottom: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 52 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  stopSquare: { width: 12, height: 12, borderRadius: 3, backgroundColor: '#fff' },
  agentDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success, marginRight: 4 },
  pressed: { opacity: 0.55 },
});
