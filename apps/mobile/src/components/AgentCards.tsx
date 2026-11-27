import { useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Linking, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { argHint, ChatItem, PlanStep, toolLabel } from '../lib/agent';
import { colors, radius, space, type } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true);
const toggle = (set: (f: (v: boolean) => boolean) => void) => {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  set((v) => !v);
};

function Dot({ status, onDark }: { status: 'running' | 'ok' | 'error' | 'pending' | 'skipped'; onDark?: boolean }) {
  if (status === 'running') return <ActivityIndicator size="small" color={onDark ? '#fff' : colors.accent} style={s.spinner} />;
  if (onDark && status === 'ok') return <Ionicons name="checkmark" size={17} color="#3DDC84" />;
  if (onDark && status === 'error') return <Ionicons name="close" size={17} color="#FF7A6E" />;
  const color = status === 'ok' ? colors.accent : status === 'error' ? colors.danger : colors.borderStrong;
  return <View style={[s.dot, { backgroundColor: color }]} />;
}

const stepDot = (st: PlanStep['status']) => (st === 'done' ? 'ok' : st === 'failed' ? 'error' : st === 'running' ? 'running' : st === 'skipped' ? 'skipped' : 'pending');

export function PlanCard({ steps }: { steps: PlanStep[] }) {
  const done = steps.filter((x) => x.status === 'done').length;
  const running = steps.find((x) => x.status === 'running');
  const allDone = done === steps.length && steps.length > 0;
  const [open, setOpen] = useState(!allDone);
  return (
    <View style={s.card}>
      <Pressable onPress={() => toggle(setOpen)} style={s.head} hitSlop={4}>
        <Dot status={allDone ? 'ok' : running ? 'running' : 'pending'} />
        <Text style={s.label} numberOfLines={1}>{allDone ? 'Plan complete' : running ? running.title : 'Plan'}</Text>
        <Text style={s.meta}>{done}/{steps.length}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textFaint} />
      </Pressable>
      {open && (
        <View style={s.body}>
          {steps.map((st, i) => (
            <View key={i} style={s.stepRow}>
              <Dot status={stepDot(st.status)} />
              <Text style={[s.stepText, (st.status === 'done' || st.status === 'skipped') && s.muted]}>{st.title}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function ToolCard({ item }: { item: Extract<ChatItem, { kind: 'tool' }> }) {
  const [open, setOpen] = useState(false);
  const hint = argHint(item.args);
  const detail = item.summary ?? hint;
  return (
    <View style={[s.chipWrap, item.depth > 0 && s.nested]}>
      <Pressable onPress={() => detail && toggle(setOpen)} style={({ pressed }) => [s.chip, pressed && s.pressed]} hitSlop={4}>
        <Dot status={item.status} onDark />
        <Text style={s.chipLabel} numberOfLines={1}>
          {item.depth > 0 ? 'Subtask · ' : ''}{toolLabel(item.name)}
        </Text>
        {!!detail && <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color="rgba(255,255,255,0.6)" />}
      </Pressable>
      {open && !!detail && (
        <Text style={[s.detail, s.detailOpen, item.status === 'error' && s.bad]} selectable>{detail}</Text>
      )}
    </View>
  );
}

export function ArtifactCard({ item }: { item: Extract<ChatItem, { kind: 'artifact' }> }) {
  const ext = item.name.split('.').pop()?.toUpperCase() ?? 'FILE';
  return (
    <Pressable style={({ pressed }) => [s.card, s.artifact, pressed && s.pressed]} onPress={() => item.url && Linking.openURL(item.url).catch(() => {})}>
      <View style={s.fileIcon}><Text style={s.fileExt}>{ext.slice(0, 4)}</Text></View>
      <View style={s.flex}>
        <Text style={s.label} numberOfLines={1}>{item.name}</Text>
        <Text style={s.meta}>{(item.size / 1024).toFixed(1)} KB</Text>
      </View>
      <Ionicons name="open-outline" size={17} color={colors.accentDark} />
    </Pressable>
  );
}

export function ConfirmCard({ item, onReview }: { item: Extract<ChatItem, { kind: 'confirm' }>; onReview: () => void }) {
  const pending = item.state === 'pending';
  return (
    <Pressable disabled={!pending} onPress={onReview} style={({ pressed }) => [s.card, pending && s.cardPending, pressed && s.pressed]}>
      <View style={s.head}>
        <Dot status={pending ? 'running' : item.state === 'approved' ? 'ok' : 'error'} />
        <Text style={s.label}>{pending ? 'Needs your approval' : item.state === 'approved' ? 'Approved' : 'Declined'}</Text>
        {pending && <Text style={s.review}>Review</Text>}
      </View>
      <Text style={s.detail}>{item.summary}</Text>
    </Pressable>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[s.card, s.errorCard]}>
      <View style={s.head}>
        <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
        <Text style={[s.label, { color: colors.danger }]} numberOfLines={3}>{message}</Text>
      </View>
      {onRetry && (
        <Pressable onPress={onRetry} style={({ pressed }) => [s.retry, pressed && s.pressed]} hitSlop={6}>
          <Ionicons name="refresh" size={14} color={colors.text} />
          <Text style={s.retryText}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.glassLine, borderRadius: radius.card, backgroundColor: colors.cardStrong, paddingHorizontal: space(2), paddingVertical: space(1.5), marginVertical: 5, marginRight: '8%' },
  nested: { marginLeft: space(2) },
  chipWrap: { alignSelf: 'flex-start', maxWidth: '92%', marginVertical: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space(1), alignSelf: 'flex-start', maxWidth: '100%', minHeight: 44, paddingLeft: space(1.75), paddingRight: space(2), borderRadius: 999, backgroundColor: colors.ink },
  chipLabel: { flexShrink: 1, fontSize: 14, color: '#fff', fontWeight: '600' },
  detailOpen: { backgroundColor: colors.cardStrong, borderRadius: 16, padding: space(1.5), marginTop: 6, overflow: 'hidden' },
  cardPending: { borderColor: colors.accent },
  errorCard: { borderColor: '#F5D0D0', backgroundColor: colors.dangerSoft, gap: space(1) },
  pressed: { opacity: 0.7 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  label: { flex: 1, ...type.secondary, fontSize: 14, color: colors.text, fontWeight: '500' },
  meta: { ...type.caption, color: colors.textMuted },
  review: { ...type.caption, color: colors.accentDark, fontWeight: '600' },
  body: { marginTop: space(1), gap: 6 },
  stepRow: { flexDirection: 'row', gap: space(1), alignItems: 'center' },
  stepText: { flex: 1, ...type.caption, fontSize: 14, color: colors.text },
  muted: { color: colors.textMuted },
  bad: { color: colors.danger },
  detail: { ...type.caption, color: colors.textMuted, marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 4 },
  spinner: { transform: [{ scale: 0.7 }], width: 16, height: 16 },
  artifact: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  fileIcon: { width: 34, height: 40, borderRadius: 8, backgroundColor: '#EEF1F5', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  fileExt: { color: colors.text, fontSize: 10, fontWeight: '700' },
  retry: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: space(1.5), paddingVertical: 7 },
  retryText: { ...type.caption, color: colors.text, fontWeight: '600' },
});
