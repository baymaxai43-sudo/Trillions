import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Markdown, { RenderRules } from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassBackdrop } from './Glass';
import { mdBase, openLink } from './markdownStyles';
import { serif } from './SummaryCard';
import type { Summary } from '../lib/summary';
import { colors, mono, radius, space } from '../theme';

/** Reading styles: the chat's markdown, a little larger and airier. */
const mdLarge = StyleSheet.create({
  ...mdBase,
  body: { ...mdBase.body, fontSize: 16.5, lineHeight: 26, fontWeight: '400' },
  paragraph: { ...mdBase.paragraph, marginBottom: space(1.75) },
  heading1: { ...mdBase.heading1, fontFamily: serif, fontWeight: '400', fontSize: 26, lineHeight: 32, marginTop: space(2), marginBottom: space(1.25) },
  heading2: { ...mdBase.heading2, fontSize: 20, lineHeight: 27, marginTop: space(2.25), marginBottom: space(1) },
  heading3: { ...mdBase.heading3, fontSize: 17.5, lineHeight: 24, marginTop: space(1.75), marginBottom: space(0.75) },
  bullet_list: { marginBottom: space(1.75) },
  ordered_list: { marginBottom: space(1.75) },
  list_item: { ...mdBase.list_item, marginBottom: 8 },
  bullet_list_icon: { ...mdBase.bullet_list_icon, lineHeight: 26 },
  ordered_list_icon: { ...mdBase.ordered_list_icon, lineHeight: 26 },
  blockquote: { ...mdBase.blockquote, marginBottom: space(1.75) },
  code_inline: { ...mdBase.code_inline, fontSize: 14.5 },
});

/** Code blocks scroll sideways instead of wrapping. */
const rules: RenderRules = {
  fence: (node) => <CodeBlock key={node.key} code={node.content} />,
  code_block: (node) => <CodeBlock key={node.key} code={node.content} />,
};

function CodeBlock({ code }: { code: string }) {
  return (
    <ScrollView horizontal style={c.wrap} contentContainerStyle={c.inner} showsHorizontalScrollIndicator={false}>
      <Text style={c.code} selectable>{code.replace(/\n$/, '')}</Text>
    </ScrollView>
  );
}

const canCopy = () => Platform.OS === 'web' && typeof navigator !== 'undefined' && !!(navigator as any).clipboard?.writeText;

function RoundButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [b.btn, pressed && { opacity: 0.6 }]}>
      {Platform.OS === 'ios' && <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />}
      <Ionicons name={icon} size={19} color={colors.text} />
    </Pressable>
  );
}

/** Full-screen reader for a summary card, over a blurred, veiled sky. */
export function SummarySheet({ summary, onClose }: { summary: Summary | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [last, setLast] = useState<Summary | null>(summary);
  // Keep the content while the modal animates out.
  useEffect(() => {
    if (summary) setLast(summary);
    else setMenu(false);
  }, [summary]);
  const shown = summary ?? last;
  const body = useMemo(() => (shown ? shown.markdown : ''), [shown]);
  const text = shown ? `${shown.title}\n\n${shown.markdown}` : '';

  const share = async () => {
    setMenu(false);
    try {
      await Share.share(Platform.OS === 'ios' ? { message: text } : { title: shown?.title, message: text });
    } catch {
      /* dismissed */
    }
  };
  const copy = async () => {
    setMenu(false);
    try {
      await (navigator as any).clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      share();
    }
  };

  return (
    <Modal visible={!!summary} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={{ width, height }}>
        <GlassBackdrop style={{ width, height }}>
          {Platform.OS === 'ios' && <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />}
          <View style={[StyleSheet.absoluteFill, x.veil]} />
          <View style={[x.bar, { paddingTop: insets.top + space(1) }]}>
            <RoundButton icon="contract-outline" label="Minimize summary" onPress={onClose} />
            <Text style={x.barTitle}>{copied ? 'Copied' : 'Summary'}</Text>
            <RoundButton icon="ellipsis-horizontal" label="More" onPress={() => setMenu((v) => !v)} />
          </View>
          <ScrollView
            style={x.flex}
            contentContainerStyle={[x.scroll, { paddingBottom: insets.bottom + space(4) }]}
            showsVerticalScrollIndicator={false}
          >
            {!!shown && (
              <View style={x.card}>
                <Text style={x.headline} selectable>{shown.title}</Text>
                <Markdown style={mdLarge} rules={rules} onLinkPress={openLink}>
                  {body}
                </Markdown>
              </View>
            )}
          </ScrollView>
          {menu && (
            <>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} accessibilityLabel="Close menu" />
              <View style={[x.menu, { top: insets.top + space(1) + 52 }]}>
                {canCopy() && (
                  <Pressable onPress={copy} style={({ pressed }) => [x.item, pressed && x.itemPressed]} accessibilityRole="button">
                    <Ionicons name="copy-outline" size={18} color={colors.text} />
                    <Text style={x.itemText}>Copy</Text>
                  </Pressable>
                )}
                <Pressable onPress={share} style={({ pressed }) => [x.item, pressed && x.itemPressed]} accessibilityRole="button">
                  <Ionicons name="share-outline" size={18} color={colors.text} />
                  <Text style={x.itemText}>{canCopy() ? 'Share' : 'Share or copy'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </GlassBackdrop>
      </View>
    </Modal>
  );
}

const x = StyleSheet.create({
  flex: { flex: 1 },
  veil: { backgroundColor: 'rgba(255,255,255,0.62)' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(2), paddingBottom: space(1.5) },
  barTitle: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.text },
  scroll: { paddingHorizontal: space(1.5), paddingTop: space(0.5) },
  card: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: space(2.75),
    paddingTop: space(3),
    paddingBottom: space(1.5),
    shadowColor: '#1B2A44',
    shadowOpacity: 0.07,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
  },
  headline: { fontFamily: serif, fontSize: 30, lineHeight: 37, color: colors.text, letterSpacing: -0.3, marginBottom: space(2) },
  menu: {
    position: 'absolute',
    right: space(2),
    minWidth: 180,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 16,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#1B2A44',
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: space(1.25), paddingHorizontal: space(2), paddingVertical: space(1.5) },
  itemPressed: { backgroundColor: 'rgba(17,18,20,0.05)' },
  itemText: { fontSize: 15.5, color: colors.text, fontWeight: '500' },
});

const b = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
});

const c = StyleSheet.create({
  wrap: { backgroundColor: '#F5F6F8', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: space(1.75) },
  inner: { padding: space(1.5) },
  code: { fontFamily: mono, fontSize: 13.5, lineHeight: 20, color: colors.text },
});
