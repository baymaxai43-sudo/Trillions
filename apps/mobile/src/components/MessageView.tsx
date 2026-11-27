import { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors, radius, space, type } from '../theme';
import { mdBase, openLink } from './markdownStyles';
import type { Msg } from '../lib/chat';
import { parseSummaries, Summary } from '../lib/summary';
import { stripReaction } from '../lib/reaction';
import { SummaryCard } from './SummaryCard';
import { SummarySheet } from './SummarySheet';
import { markdownRules } from './CodeBlock';
import { ReactionBadge } from './ReactionBadge';

const ANSWER_KEYS = ['reply', 'response', 'content', 'text', 'message', 'answer', 'output', 'result'];

/**
 * Never render raw JSON as prose: a reply that is only a JSON object/array either carries its answer in a
 * string field (render that) or gets shown pretty-printed in a ```json block.
 */
export function unwrapJsonReply(text: string): string {
  let t = text.trim();
  const fenced = t.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/);
  if (fenced && !/^```json/.test(t)) t = fenced[1].trim(); // a bare ``` fence around JSON
  if (!/^[[{]/.test(t) || !/[\]}]$/.test(t)) return text;
  let v: unknown;
  try {
    v = JSON.parse(t);
  } catch {
    return text;
  }
  if (!v || typeof v !== 'object') return text;
  if (!Array.isArray(v)) {
    for (const k of ANSWER_KEYS) {
      const f = (v as Record<string, unknown>)[k];
      if (typeof f === 'string' && f.trim()) return f;
    }
  }
  return '```json\n' + JSON.stringify(v, null, 2) + '\n```';
}


/** Hark-style: user = frosted pill on the right; assistant = solid white rounded card on the left. */
export const MessageView = memo(function MessageView({
  m,
  showMark = true,
  reaction,
  reactionLive,
}: {
  m: Msg;
  showMark?: boolean;
  /** Agent tapback on this user message. */
  reaction?: string | null;
  /** Arrived live: pop it in. */
  reactionLive?: boolean;
}) {
  if (m.role === 'user') {
    return (
      <View style={[s.userRow, !!reaction && s.userRowReacted]}>
        <View style={s.userBubble}>
          <Text style={s.userText} selectable>{m.content}</Text>
          {!!reaction && <ReactionBadge emoji={reaction} animate={reactionLive} />}
        </View>
      </View>
    );
  }
  return <AssistantMessage content={m.content} />;
});

/** Short reply in the white card, then any summary cards; tapping one opens the full-screen sheet. */
function AssistantMessage({ content }: { content: string }) {
  const segments = useMemo(() => {
    // A text part that is only JSON (some models do this): unwrap it instead of showing raw JSON.
    return parseSummaries(stripReaction(content)).map((seg) => (seg.kind === 'text' ? { ...seg, text: unwrapJsonReply(seg.text) } : seg));
  }, [content]);
  const { width } = useWindowDimensions();
  // Card inner width: list padding, the 8% right gutter, card padding.
  const rules = useMemo(() => markdownRules(Math.min(width, 760) * 0.92 - 32 - 32), [width]);
  const [open, setOpen] = useState<Summary | null>(null);
  if (!segments.length) return null;
  return (
    <View>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <View key={`t${i}`} style={s.assistantRow}>
            <View style={s.assistantCard}>
              <Markdown style={md} rules={rules} onLinkPress={openLink}>
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
  userRowReacted: { marginBottom: space(2) },
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
