import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { argHint, ChatItem, PlanStep, toolLabel } from '../lib/agent';
import { colors, radius, space, type } from '../theme';

const STEP_GLYPH: Record<PlanStep['status'], string> = { pending: '○', running: '◐', done: '✓', failed: '✕', skipped: '–' };

export function PlanCard({ steps }: { steps: PlanStep[] }) {
  const done = steps.filter((s) => s.status === 'done').length;
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.eyebrow}>PLAN</Text>
        <Text style={s.meta}>{done}/{steps.length}</Text>
      </View>
      {steps.map((st, i) => (
        <View key={i} style={s.stepRow}>
          <Text style={[s.stepGlyph, st.status === 'done' && s.ok, st.status === 'failed' && s.bad, st.status === 'running' && s.ok]}>
            {STEP_GLYPH[st.status]}
          </Text>
          <Text style={[s.stepText, (st.status === 'done' || st.status === 'skipped') && s.muted]}>{st.title}</Text>
        </View>
      ))}
    </View>
  );
}

export function ToolCard({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const hint = argHint(item.args);
  return (
    <View style={[s.tool, item.depth > 0 && s.nested]}>
      <View style={[s.dot, item.status === 'ok' && s.dotOk, item.status === 'error' && s.dotBad]}>
        {item.status === 'running' ? <ActivityIndicator size="small" color={colors.primaryDark} /> : <Text style={s.dotGlyph}>{item.status === 'ok' ? '✓' : '!'}</Text>}
      </View>
      <View style={s.flex}>
        <Text style={s.toolTitle} numberOfLines={1}>
          {item.depth > 0 ? 'Subtask · ' : ''}{toolLabel(item.name)}
        </Text>
        {!!(item.summary || hint) && (
          <Text style={[s.toolSub, item.status === 'error' && s.bad]} numberOfLines={2}>
            {item.summary ?? hint}
          </Text>
        )}
      </View>
    </View>
  );
}

export function ArtifactCard({ item }: { item: Extract<ChatItem, { kind: 'artifact' }> }) {
  const ext = item.name.split('.').pop()?.toUpperCase() ?? 'FILE';
  return (
    <Pressable style={s.artifact} onPress={() => item.url && Linking.openURL(item.url)}>
      <View style={s.fileIcon}><Text style={s.fileExt}>{ext.slice(0, 4)}</Text></View>
      <View style={s.flex}>
        <Text style={s.toolTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={s.toolSub}>{(item.size / 1024).toFixed(1)} KB · Tap to open</Text>
      </View>
      <Text style={s.chev}>↗</Text>
    </Pressable>
  );
}

export function ConfirmCard({ item, onReview }: { item: Extract<ChatItem, { kind: 'confirm' }>; onReview: () => void }) {
  const pending = item.state === 'pending';
  return (
    <Pressable disabled={!pending} onPress={onReview} style={[s.card, pending && s.cardPending]}>
      <Text style={s.eyebrow}>{pending ? 'NEEDS YOUR APPROVAL' : item.state === 'approved' ? 'APPROVED' : 'DECLINED'}</Text>
      <Text style={s.stepText}>{item.summary}</Text>
      {pending && <Text style={[s.meta, s.ok]}>Review →</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: space(1.75), marginVertical: space(0.75), gap: 6 },
  cardPending: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  head: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  eyebrow: { ...type.caption, color: colors.primaryDark, fontWeight: '700', letterSpacing: 0.8 },
  meta: { ...type.caption, color: colors.textMuted },
  stepRow: { flexDirection: 'row', gap: space(1), alignItems: 'flex-start' },
  stepGlyph: { width: 16, ...type.secondary, color: colors.textMuted, textAlign: 'center' },
  stepText: { flex: 1, ...type.secondary, color: colors.text },
  muted: { color: colors.textMuted },
  ok: { color: colors.primaryDark },
  bad: { color: colors.danger },
  tool: { flexDirection: 'row', alignItems: 'center', gap: space(1.25), paddingVertical: space(1), paddingHorizontal: space(1.25), marginVertical: 3, borderRadius: 14, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  nested: { marginLeft: space(2.5) },
  dot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  dotOk: { backgroundColor: colors.primarySoft },
  dotBad: { backgroundColor: '#FDE2E2' },
  dotGlyph: { fontSize: 13, fontWeight: '700', color: colors.primaryDark },
  toolTitle: { ...type.secondary, fontWeight: '600', color: colors.text },
  toolSub: { ...type.caption, color: colors.textMuted },
  artifact: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), padding: space(1.5), marginVertical: space(0.75), borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  fileIcon: { width: 40, height: 46, borderRadius: 8, backgroundColor: colors.brandDeep, alignItems: 'center', justifyContent: 'center' },
  fileExt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  chev: { fontSize: 18, color: colors.primaryDark },
});
