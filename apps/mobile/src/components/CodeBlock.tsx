import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import type { RenderRules } from 'react-native-markdown-display';
import { mono, radius, space } from '../theme';

/** First word of a fence's info string ("ts", "sql"); falls back to "code". */
export const fenceLang = (info?: string) => (info ?? '').trim().split(/\s+/)[0]?.replace(/[^A-Za-z0-9+#._-]/g, '').slice(0, 16).toLowerCase() || 'code';

/** Copies text; true when it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}

/** Dark code block with a language label and a Copy button; long lines scroll sideways. */
export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => timer.current && clearTimeout(timer.current), []);
  const body = code.replace(/\n+$/, '');
  const copy = async () => {
    if (!(await copyText(body))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return (
    <View style={c.wrap}>
      <View style={c.head}>
        <Text style={c.lang}>{fenceLang(lang)}</Text>
        <Pressable onPress={copy} hitSlop={8} accessibilityRole="button" accessibilityLabel="Copy code" style={({ pressed }) => [c.copy, pressed && { opacity: 0.6 }]}>
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color="#AEB4BD" />
          <Text style={c.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={c.inner}>
        <Text style={c.code} selectable>{body}</Text>
      </ScrollView>
    </View>
  );
}

/** Wide tables scroll sideways; cells get a fixed width so columns line up. */
function cellWidth(node: any, avail: number) {
  const firstRow = node?.children?.[0]?.children?.[0];
  const cols = Math.max(1, firstRow?.children?.length ?? 1);
  return Math.max(112, Math.floor(avail / cols));
}

/**
 * Render rules shared by chat replies and the summary sheet: code blocks with a Copy header, scrollable tables.
 * `avail` is roughly the width the markdown has, for sizing table columns.
 */
export function markdownRules(avail: number): RenderRules {
  return {
    fence: (node: any) => <CodeBlock key={node.key} code={node.content} lang={node.sourceInfo} />,
    code_block: (node: any) => <CodeBlock key={node.key} code={node.content} />,
    table: (node: any, children, _parent, styles) => {
      const w = cellWidth(node, avail);
      return (
        <ScrollView key={node.key} horizontal showsHorizontalScrollIndicator={false} style={c.tableScroll}>
          <View style={[styles._VIEW_SAFE_table, { width: Math.max(avail, w * Math.max(1, node?.children?.[0]?.children?.[0]?.children?.length ?? 1)) }]}>{children}</View>
        </ScrollView>
      );
    },
  };
}

const c = StyleSheet.create({
  wrap: { backgroundColor: '#0F1115', borderRadius: radius.md - 2, marginBottom: space(1.25), overflow: 'hidden', alignSelf: 'stretch' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space(1.5),
    paddingRight: space(1),
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#161920',
  },
  lang: { fontFamily: mono, fontSize: 12, lineHeight: 16, color: '#8B929C', letterSpacing: 0.3 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  copyText: { fontSize: 12, lineHeight: 16, color: '#AEB4BD', fontWeight: '600' },
  inner: { paddingHorizontal: space(1.5), paddingVertical: space(1.25) },
  code: { fontFamily: mono, fontSize: 13, lineHeight: 19, color: '#E6E8EB' },
  tableScroll: { marginBottom: space(1.25), flexGrow: 0 },
});
