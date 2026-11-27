import { memo } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors, mono, radius, space, type } from '../theme';
import type { Msg } from '../lib/chat';

/** User: right-aligned soft-emerald bubble. Assistant: no bubble, full-width markdown with a small logo mark. */
export const MessageView = memo(function MessageView({ m, showMark = true }: { m: Msg; showMark?: boolean }) {
  if (m.role === 'user') {
    return (
      <View style={s.userRow}>
        <View style={s.userBubble}>
          <Text style={s.userText} selectable>{m.content}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={s.assistantRow}>
      {showMark ? <Image source={require('../../assets/logo-mark.png')} style={s.mark} /> : <View style={s.markSpacer} />}
      <View style={s.assistantBody}>
        <Markdown
          style={md}
          onLinkPress={(url) => {
            Linking.openURL(url).catch(() => {});
            return false;
          }}
        >
          {m.content}
        </Markdown>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginVertical: space(1), paddingLeft: '15%' },
  userBubble: {
    flexShrink: 1,
    maxWidth: '100%',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.bubble,
    borderBottomRightRadius: 6,
    paddingVertical: space(1.25),
    paddingHorizontal: space(1.75),
  },
  userText: { ...type.body, color: colors.text, flexShrink: 1 },
  assistantRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space(1.25), marginVertical: space(1), width: '100%' },
  mark: { width: 22, height: 22, borderRadius: 6, marginTop: 1 },
  markSpacer: { width: 22 },
  assistantBody: { flex: 1, flexShrink: 1, minWidth: 0 },
});

const md = StyleSheet.create({
  body: { ...type.body, color: colors.text, flexShrink: 1 },
  text: { flexShrink: 1 },
  paragraph: { marginTop: 0, marginBottom: space(1.25), flexWrap: 'wrap', flexDirection: 'row', alignItems: 'flex-start', width: '100%' },
  heading1: { fontSize: 22, lineHeight: 28, fontWeight: '600', marginTop: space(1), marginBottom: space(1), color: colors.text },
  heading2: { fontSize: 19, lineHeight: 25, fontWeight: '600', marginTop: space(1), marginBottom: space(0.75), color: colors.text },
  heading3: { fontSize: 17, lineHeight: 23, fontWeight: '600', marginTop: space(0.75), marginBottom: space(0.5), color: colors.text },
  heading4: { fontSize: 16, fontWeight: '600', marginBottom: space(0.5) },
  strong: { fontWeight: '600' },
  em: { fontStyle: 'italic' },
  link: { color: colors.accentDark, textDecorationLine: 'underline' },
  blockquote: { backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.accent, paddingHorizontal: space(1.5), paddingVertical: space(0.5), marginBottom: space(1.25), marginLeft: 0 },
  bullet_list: { marginBottom: space(1) },
  ordered_list: { marginBottom: space(1) },
  list_item: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 4 },
  bullet_list_icon: { color: colors.accentDark, marginLeft: 2, marginRight: 8, lineHeight: 23 },
  ordered_list_icon: { color: colors.textMuted, marginLeft: 2, marginRight: 8, lineHeight: 23 },
  bullet_list_content: { flex: 1, flexShrink: 1 },
  ordered_list_content: { flex: 1, flexShrink: 1 },
  code_inline: { fontFamily: mono, fontSize: 14, backgroundColor: colors.surface, color: colors.accentDark, borderRadius: 4, paddingHorizontal: 4, borderWidth: 0 },
  code_block: { fontFamily: mono, fontSize: 13, lineHeight: 19, backgroundColor: colors.surface, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space(1.5), marginBottom: space(1.25) },
  fence: { fontFamily: mono, fontSize: 13, lineHeight: 19, backgroundColor: colors.surface, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space(1.5), marginBottom: space(1.25) },
  hr: { backgroundColor: colors.border, height: 1, marginVertical: space(1.5) },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: space(1.25) },
  thead: { backgroundColor: colors.surface },
  th: { padding: 6, fontWeight: '600' },
  tr: { borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row' },
  td: { padding: 6, flex: 1 },
  image: { borderRadius: radius.md },
});
