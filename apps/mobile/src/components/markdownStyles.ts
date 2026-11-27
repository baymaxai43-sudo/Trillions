import { Linking } from 'react-native';
import { colors, mono, radius, space, type } from '../theme';

/** Opens markdown links externally (returning false stops the default handler). */
export const openLink = (url: string) => {
  Linking.openURL(url).catch(() => {});
  return false;
};

/** Markdown styles shared by chat replies and the summary sheet. */
export const mdBase = {
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
} as const;
