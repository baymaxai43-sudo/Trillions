import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type } from '../theme';
import type { Msg } from '../lib/chat';

/** Assistant text sits on the page; the user's message is an emerald-tinted bubble on the right. */
export function MessageView({ m }: { m: Msg }) {
  if (m.role === 'user') {
    return (
      <View style={s.userRow}>
        <View style={s.userBubble}><Text style={s.userText}>{m.content}</Text></View>
      </View>
    );
  }
  return <Text style={s.assistant}>{m.content}</Text>;
}

const s = StyleSheet.create({
  userRow: { alignItems: 'flex-end', marginVertical: space(1) },
  userBubble: { maxWidth: '82%', backgroundColor: colors.surfaceAlt, borderRadius: radius.bubble, paddingVertical: space(1.25), paddingHorizontal: space(2) },
  userText: { ...type.body, color: colors.text },
  assistant: { ...type.body, color: colors.text, marginVertical: space(1) },
});
