import { memo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors, mono, radius, space, type } from '../theme';
import type { Msg } from '../lib/chat';

/** Hark-style: user = frosted pill on the right; assistant = solid white rounded card on the left. */
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
      <View style={s.assistantCard}>
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
  userRow: { flexDirection: 'row', justifyContent: 'flex-end', marginVertical: space(0.75), paddingLeft: '18%' },
  userBubble: {
    flexShrink: 1,
    maxWidth: '100%',
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: radius.bubble,
    paddingVertical: space(1.25),
    paddingHorizontal: space(2),
  },
  userText: { ...type.body, fontSize: 15.5, lineHeight: 22, color: colors.text, fontWeight: '500', flexShrink: 1 },
  assistantRow: { flexDirection: 'row', justifyContent: 'flex-start', marginVertical: space(0.75), paddingRight: '8%' },
  assistantCard: {
    flexShrink: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.bubble,
    paddingTop: space(1.5),
    paddingBottom: space(0.25),
    paddingHorizontal: space(2),
    shadowColor: '#1B2A44',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
  },
});

const md = StyleSheet.create({
  body: { ...type.body, fontSize: 15.5, lineHeight: 22, color: colors.text, fontWeight: '500', flexShrink: 1 },
  text: { flexShrink: 1 },
  paragraph: { marginTop: 0, marginBottom: space(1.25), flexWrap: 'wrap', flexDirection: 'row', alignItems: 'flex-start', width: '100%' },
  heading1: { fontSize: 22, lineHeight: 28, fontWeight: '600', marginTop: space(1), marginBottom: space(1), color: colors.text },
  heading2: { fontSize: 19, lineHeight: 25, fontWeight: '600', marginTop: space(1), marginBottom: space(0.75), color: colors.text },
  heading3: { fontSize: 17, lineHeight: 23, fontWeight: '600', marginTop: space(0.75), marginBottom: space(0.5), color: colors.text },
  heading4: { fontSize: 16, fontWeight: '600', marginBottom: space(0.5) },
  strong: { fontWeight: '600' },
  em: { fontStyle: 'italic' },
  link: { color: colors.link, textDecorationLine: 'underline' },
  blockquote: { backgroundColor: '#F3F5F8', borderLeftWidth: 3, borderLeftColor: colors.borderStrong, paddingHorizontal: space(1.5), paddingVertical: space(0.5), marginBottom: space(1.25), marginLeft: 0 },
  bullet_list: { marginBottom: space(1) },
  ordered_list: { marginBottom: space(1) },
  list_item: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 4 },
  bullet_list_icon: { color: colors.text, marginLeft: 2, marginRight: 8, lineHeight: 23 },
  ordered_list_icon: { color: colors.textMuted, marginLeft: 2, marginRight: 8, lineHeight: 23 },
  bullet_list_content: { flex: 1, flexShrink: 1 },
  ordered_list_content: { flex: 1, flexShrink: 1 },
  code_inline: { fontFamily: mono, fontSize: 14, backgroundColor: '#F1F3F6', color: colors.text, borderRadius: 4, paddingHorizontal: 4, borderWidth: 0 },
  code_block: { fontFamily: mono, fontSize: 13, lineHeight: 19, backgroundColor: '#F5F6F8', color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space(1.5), marginBottom: space(1.25) },
  fence: { fontFamily: mono, fontSize: 13, lineHeight: 19, backgroundColor: '#F5F6F8', color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space(1.5), marginBottom: space(1.25) },
  hr: { backgroundColor: colors.border, height: 1, marginVertical: space(1.5) },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: space(1.25) },
  thead: { backgroundColor: '#F5F6F8' },
  th: { padding: 6, fontWeight: '600' },
  tr: { borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row' },
  td: { padding: 6, flex: 1 },
  image: { borderRadius: radius.md },
});
