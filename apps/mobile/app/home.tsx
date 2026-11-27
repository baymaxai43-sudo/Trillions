import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, NativeScrollEvent, NativeSyntheticEvent, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '../src/components/TopBar';
import { Glass, GlassBackdrop } from '../src/components/Glass';
import { Sheet } from '../src/components/Sheet';
import { SkeletonBlock } from '../src/components/Skeleton';
import { apiFetch } from '../src/lib/api';
import { Conversation, greeting, latestMemories, listConversations, memoryCount, relativeTime } from '../src/lib/conversations';
import { openConversation } from '../src/lib/nav';
import { userInfo, useSession } from '../src/lib/session';
import { ALL_PANELS, getEnabledPanels, PanelId, setEnabledPanels } from '../src/lib/storage';
import { colors, space, type } from '../src/theme';

type Schedule = { id: string; title: string | null; prompt: string; kind: string; next_run_at: string | null; enabled: boolean };
type Provider = { id: string; label: string; connected: boolean };
type Data = {
  recent?: Conversation[] | null;
  schedules?: Schedule[] | null;
  providers?: Provider[] | null;
  memCount?: number | null;
  memories?: string[];
};
type Errors = Partial<Record<PanelId, string>>;

/** Home: glanceable glass panels over a soft emerald gradient. */
export default function Home() {
  const { session } = useSession();
  const me = userInfo(session?.user);
  const [panels, setPanels] = useState<PanelId[] | null>(null);
  const [data, setData] = useState<Data>({});
  const [errors, setErrors] = useState<Errors>({});
  const [refreshing, setRefreshing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const load = useCallback(async () => {
    const errs: Errors = {};
    const jobs: Promise<void>[] = [
      listConversations(4)
        .then((recent) => setData((d) => ({ ...d, recent })))
        .catch((e) => {
          errs.recent = (e as Error).message;
          setData((d) => ({ ...d, recent: null }));
        }),
      apiFetch<Schedule[]>('/v1/agent/schedules')
        .then((schedules) => setData((d) => ({ ...d, schedules })))
        .catch((e) => {
          errs.schedules = (e as Error).message;
          setData((d) => ({ ...d, schedules: null }));
        }),
      apiFetch<Provider[]>('/v1/connect/providers')
        .then((providers) => setData((d) => ({ ...d, providers })))
        .catch((e) => {
          errs.accounts = (e as Error).message;
          setData((d) => ({ ...d, providers: null }));
        }),
      Promise.all([memoryCount(), latestMemories(2)])
        .then(([memCount, memories]) => setData((d) => ({ ...d, memCount, memories })))
        .catch(() => setData((d) => ({ ...d, memCount: null, memories: [] }))),
    ];
    await Promise.all(jobs);
    setErrors(errs);
  }, []);

  useEffect(() => {
    getEnabledPanels().then(setPanels);
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggle = (id: PanelId, on: boolean) =>
    setPanels((cur) => {
      const next = on ? [...(cur ?? []), id] : (cur ?? []).filter((x) => x !== id);
      const ordered = ALL_PANELS.map((p) => p.id).filter((x) => next.includes(x));
      setEnabledPanels(ordered);
      return ordered;
    });

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y > 4;
    if (y !== scrolled) setScrolled(y);
  };

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const connectedCount = data.providers?.filter((p) => p.connected).length ?? 0;
  const activeSchedules = data.schedules?.filter((x) => x.enabled) ?? [];

  const render = (id: PanelId) => {
    switch (id) {
      case 'welcome':
        return (
          <Glass key={id} style={s.full}>
            <Text style={s.eyebrow}>{today}</Text>
            <Text style={s.greeting}>{greeting()}{me.firstName ? `, ${me.firstName}` : ''}</Text>
            <Pressable onPress={() => openConversation(null)} style={({ pressed }) => [s.cta, pressed && s.pressed]}>
              <Ionicons name="sparkles-outline" size={14} color={colors.accentDark} />
              <Text style={s.ctaText}>Ask TRILLION</Text>
            </Pressable>
          </Glass>
        );
      case 'recent':
        return (
          <Glass key={id} style={s.full}>
            <PanelHead icon="chatbubbles-outline" title="Recent chats" action="See all" onAction={() => router.push('/chats')} />
            {data.recent === undefined ? (
              <Lines n={3} />
            ) : errors.recent ? (
              <Text style={s.muted}>Couldn’t load chats.</Text>
            ) : !data.recent?.length ? (
              <Text style={s.muted}>No conversations yet.</Text>
            ) : (
              data.recent.map((c) => (
                <Pressable key={c.id} onPress={() => openConversation(c.id)} style={({ pressed }) => [s.listRow, pressed && s.pressed]}>
                  <Text style={s.listTitle} numberOfLines={1}>{c.title?.trim() || 'Untitled'}</Text>
                  <Text style={s.listMeta}>{relativeTime(c.updated_at)}</Text>
                </Pressable>
              ))
            )}
          </Glass>
        );
      case 'schedules':
        return (
          <Glass key={id} style={s.half}>
            <Pressable onPress={() => router.push('/settings/schedules')}>
              <PanelHead icon="time-outline" title="Scheduled" />
              {data.schedules === undefined ? (
                <SkeletonBlock style={{ width: 40, height: 26 }} />
              ) : (
                <>
                  <Text style={s.big}>{errors.schedules ? '—' : activeSchedules.length}</Text>
                  <Text style={s.muted} numberOfLines={2}>
                    {errors.schedules ? 'Unavailable' : activeSchedules[0]?.next_run_at ? `Next ${relativeFuture(activeSchedules[0].next_run_at)}` : 'No active tasks'}
                  </Text>
                </>
              )}
            </Pressable>
          </Glass>
        );
      case 'accounts':
        return (
          <Glass key={id} style={s.half}>
            <Pressable onPress={() => router.push('/connections')}>
              <PanelHead icon="link-outline" title="Accounts" />
              {data.providers === undefined ? (
                <SkeletonBlock style={{ width: 40, height: 26 }} />
              ) : (
                <>
                  <Text style={s.big}>{errors.accounts ? '—' : `${connectedCount}/${data.providers?.length ?? 0}`}</Text>
                  <Text style={s.muted} numberOfLines={2}>
                    {errors.accounts ? 'Unavailable' : connectedCount ? data.providers!.filter((p) => p.connected).map((p) => p.label).join(', ') : 'None connected'}
                  </Text>
                </>
              )}
            </Pressable>
          </Glass>
        );
      case 'memory':
        return (
          <Glass key={id} style={s.full}>
            <PanelHead icon="bulb-outline" title="What TRILLION knows" />
            {data.memCount === undefined ? (
              <Lines n={2} />
            ) : data.memCount === null ? (
              <Text style={s.muted}>Memory isn’t available right now.</Text>
            ) : (
              <>
                <Text style={s.bodyText}>
                  {data.memCount === 0 ? 'Nothing saved yet. Tell TRILLION “remember …” and it will keep it.' : `${data.memCount} saved ${data.memCount === 1 ? 'memory' : 'memories'}`}
                </Text>
                {data.memories?.map((m, i) => (
                  <Text key={i} style={s.memory} numberOfLines={2}>• {m}</Text>
                ))}
              </>
            )}
          </Glass>
        );
    }
  };

  return (
    <GlassBackdrop>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <TopBar active="home" scrolled={scrolled} transparent />
        <ScrollView
          contentContainerStyle={s.body}
          onScroll={onScroll}
          scrollEventThrottle={64}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
        >
          <View style={s.headRow}>
            <Text style={s.h1}>Home</Text>
            <Pressable onPress={() => setPicker(true)} style={({ pressed }) => [s.add, pressed && s.pressed]} accessibilityLabel="Add panel">
              <Ionicons name="add" size={20} color={colors.text} />
            </Pressable>
          </View>
          {panels === null ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: space(4) }} />
          ) : panels.length === 0 ? (
            <Glass style={s.full}>
              <Text style={s.bodyText}>No panels yet. Tap + to add some.</Text>
            </Glass>
          ) : (
            <View style={s.grid}>{panels.map(render)}</View>
          )}
        </ScrollView>
        <Sheet visible={picker} onClose={() => setPicker(false)} title="Panels">
          {ALL_PANELS.map((p) => (
            <View key={p.id} style={s.pickRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.pickTitle}>{p.label}</Text>
                <Text style={s.muted}>{p.description}</Text>
              </View>
              <Switch
                value={!!panels?.includes(p.id)}
                onValueChange={(v) => toggle(p.id, v)}
                trackColor={{ true: colors.accent, false: colors.borderStrong }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </Sheet>
      </SafeAreaView>
    </GlassBackdrop>
  );
}

function PanelHead({ icon, title, action, onAction }: { icon: keyof typeof Ionicons.glyphMap; title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.panelHead}>
      <Ionicons name={icon} size={15} color={colors.accentDark} />
      <Text style={s.panelTitle} numberOfLines={1}>{title}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={s.action}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Lines({ n }: { n: number }) {
  return (
    <View style={{ gap: 10, paddingVertical: 4 }}>
      {Array.from({ length: n }).map((_, i) => (
        <SkeletonBlock key={i} style={{ width: `${85 - i * 15}%`, height: 12 }} />
      ))}
    </View>
  );
}

function relativeFuture(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (!isFinite(ms)) return '';
  if (ms <= 60_000) return 'soon';
  const m = ms / 60_000;
  if (m < 60) return `in ${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `in ${Math.round(h)}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: space(2), paddingBottom: space(5) },
  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: space(2) },
  h1: { flex: 1, ...type.display, color: colors.text },
  add: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space(1.5) },
  full: { width: '100%' },
  half: { width: '48.5%' },
  pressed: { opacity: 0.65 },
  eyebrow: { ...type.caption, color: colors.textMuted },
  greeting: { ...type.greeting, fontSize: 24, lineHeight: 30, color: colors.text, marginTop: 2 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: space(1.5), paddingHorizontal: space(1.25), paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#BFEBD8', backgroundColor: 'rgba(236,253,245,0.8)' },
  ctaText: { ...type.caption, color: colors.accentDark, fontWeight: '600' },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: space(1) },
  panelTitle: { flex: 1, ...type.caption, color: colors.text, fontWeight: '600' },
  action: { ...type.caption, color: colors.accentDark, fontWeight: '500' },
  big: { fontSize: 26, lineHeight: 32, fontWeight: '600', color: colors.text },
  muted: { ...type.caption, color: colors.textMuted },
  bodyText: { ...type.secondary, color: colors.text },
  memory: { ...type.caption, color: colors.textMuted, marginTop: 6 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space(1), paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(11,31,23,0.08)' },
  listTitle: { flex: 1, ...type.secondary, color: colors.text },
  listMeta: { ...type.caption, color: colors.textFaint },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingVertical: space(1.25), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pickTitle: { ...type.secondary, color: colors.text, fontWeight: '500' },
});
