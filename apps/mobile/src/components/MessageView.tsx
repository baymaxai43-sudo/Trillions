import { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors, radius, space, type } from '../theme';
import { mdBase, openLink } from './markdownStyles';
import type { Msg } from '../lib/chat';
import { parseSummaries, Summary } from '../lib/summary';
import { SummaryCard } from './SummaryCard';
import { SummarySheet } from './SummarySheet';


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
  return <AssistantMessage content={m.content} />;
});

/** Short reply in the white card, then any summary cards; tapping one opens the full-screen sheet. */
function AssistantMessage({ content }: { content: string }) {
  const segments = useMemo(() => parseSummaries(content), [content]);
  const [open, setOpen] = useState<Summary | null>(null);
  if (!segments.length) return null;
  return (
    <View>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <View key={`t${i}`} style={s.assistantRow}>
            <View style={s.assistantCard}>
              <Markdown style={md} onLinkPress={openLink}>
                {seg.text}
              </Markdown>
            </View>
          </View>
        ) : (
          <SummaryCard key={`s${seg.summary.id}${i}`} summary={seg.summary} onOpen={setOpen} />
        ),
      )}
      <SummarySheet summary={open} onClose={() => setOpen(null)} />
    </View>
  );
}

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

const md = StyleSheet.create(mdBase);
