import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassBackdrop } from '../../src/components/Glass';
import { BackHeader } from '../../src/components/TopBar';
import { ListSkeleton } from '../../src/components/Skeleton';
import { apiFetch } from '../../src/lib/api';
import { useSync } from '../../src/lib/sync';
import { colors, radius, space, type } from '../../src/theme';

type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
type Schedule = {
  id: string;
  title: string | null;
  prompt: string;
  kind: 'once' | 'interval' | 'daily';
  run_at: string | null;
  every_minutes: number | null;
  time_of_day: string | null;
  timezone: string;
  next_run_at: string | null;
  last_run_at: string | null;
  enabled: boolean;
  last_run?: { status: RunStatus; finished_at: string | null; error: string | null } | null;
};

const TZ = 'Africa/Lagos';
const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function every(min: number): string {
  if (min % 1440 === 0) return min === 1440 ? 'Every day' : `Every ${min / 1440} days`;
  if (min % 60 === 0) return min === 60 ? 'Every hour' : `Every ${min / 60} hours`;
  return `Every ${min} minutes`;
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function cadence(t: Schedule): string {
  if (t.kind === 'daily') return `Every day at ${t.time_of_day ? to12h(t.time_of_day) : '—'}${t.timezone && t.timezone !== TZ ? ` (${t.timezone})` : ''}`;
  if (t.kind === 'interval') return every(t.every_minutes ?? 60);
  return t.run_at ? `Once, ${when(t.run_at)}` : 'Once';
}

const LAST: Record<RunStatus, { label: string; color: string }> = {
  completed: { label: 'Last run succeeded', color: colors.success },
  failed: { label: 'Last run failed', color: colors.danger },
  cancelled: { label: 'Last run cancelled', color: colors.textMuted },
  running: { label: 'Running now', color: colors.ink },
  queued: { label: 'Starting', color: colors.ink },
  waiting_approval: { label: 'Waiting for approval', color: colors.ink },
};

export default function Schedules() {
  const [list, setList] = useState<Schedule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await apiFetch<Schedule[]>('/v1/agent/schedules'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setList((l) => l ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useSync(['schedules'], load);

  const setEnabled = async (t: Schedule, enabled: boolean) => {
    setBusy(t.id);
    setList((l) => l?.map((x) => (x.id === t.id ? { ...x, enabled } : x)) ?? l); // optimistic
    try {
      const updated = await apiFetch<Schedule>(`/v1/agent/schedules/${t.id}`, { method: 'PATCH', body: { enabled } });
      setList((l) => l?.map((x) => (x.id === t.id ? { ...x, ...updated, last_run: x.last_run } : x)) ?? l);
    } catch (e) {
      setList((l) => l?.map((x) => (x.id === t.id ? { ...x, enabled: !enabled } : x)) ?? l);
      Alert.alert(enabled ? 'Could not resume' : 'Could not pause', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = (t: Schedule) =>
    Alert.alert('Delete scheduled task?', t.title ?? t.prompt.slice(0, 80), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(t.id);
          try {
            await apiFetch(`/v1/agent/schedules/${t.id}`, { method: 'DELETE' });
            setList((l) => l?.filter((x) => x.id !== t.id) ?? l);
          } catch (e) {
            Alert.alert('Could not delete', (e as Error).message);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const render = ({ item }: { item: Schedule }) => {
    const last = item.last_run?.status ? LAST[item.last_run.status] : null;
    return (
      <View style={s.card}>
        <View style={s.top}>
          <View style={s.flex}>
            <Text style={s.title} numberOfLines={2}>{item.title || item.prompt}</Text>
            {!!item.title && <Text style={s.prompt} numberOfLines={2}>{item.prompt}</Text>}
          </View>
          {busy === item.id ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <Switch
              value={item.enabled}
              onValueChange={(v) => setEnabled(item, v)}
              trackColor={{ true: colors.ink, false: 'rgba(17,18,20,0.15)' }}
              thumbColor="#fff"
              accessibilityLabel={item.enabled ? 'Pause task' : 'Resume task'}
            />
          )}
        </View>
        <View style={s.metaRow}>
          <Ionicons name="repeat" size={14} color={colors.textMuted} />
          <Text style={s.meta}>{cadence(item)}</Text>
        </View>
        <View style={s.metaRow}>
          <Ionicons name="time-outline" size={14} color={colors.textMuted} />
          <Text style={s.meta}>{item.enabled ? (item.next_run_at ? `Next: ${when(item.next_run_at)} (Lagos)` : 'No upcoming run') : 'Paused'}</Text>
        </View>
        <View style={s.bottom}>
          {last ? (
            <View style={s.metaRow}>
              <View style={[s.dot, { backgroundColor: last.color }]} />
              <Text style={s.meta}>
                {last.label}
                {item.last_run_at ? ` · ${when(item.last_run_at)}` : ''}
              </Text>
            </View>
          ) : (
            <Text style={s.meta}>Hasn’t run yet</Text>
          )}
          <Pressable onPress={() => remove(item)} hitSlop={10} accessibilityLabel="Delete task" style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <GlassBackdrop>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <BackHeader title="Scheduled tasks" />
        {list === null ? (
          <ListSkeleton rows={4} />
        ) : (
          <FlatList
            data={list}
            keyExtractor={(t) => t.id}
            renderItem={render}
            contentContainerStyle={[s.list, list.length === 0 && { flexGrow: 1 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.ink} colors={[colors.ink]} />}
            ListHeaderComponent={list.length ? <Text style={s.lead}>Tasks TRILLION runs for you in the background. Unattended runs never take actions that need your approval.</Text> : null}
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name={error ? 'cloud-offline-outline' : 'time-outline'} size={28} color={colors.textFaint} />
                <Text style={s.emptyTitle}>{error ? 'Couldn’t load tasks' : 'No scheduled tasks'}</Text>
                <Text style={s.emptySub}>{error ?? 'Ask TRILLION in Agent mode, e.g. “every morning at 8, check my CI and summarise failures”.'}</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </GlassBackdrop>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  list: { paddingHorizontal: space(2), paddingBottom: space(5), gap: space(1.25) },
  lead: { ...type.caption, color: colors.textMuted, marginHorizontal: space(0.5), marginBottom: space(0.5) },
  card: { borderRadius: radius.card, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.glassLine, padding: space(2), gap: 6 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: space(1.5), marginBottom: 2 },
  title: { ...type.secondary, fontWeight: '600', color: colors.text },
  prompt: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...type.caption, color: colors.textMuted },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(4), gap: space(0.75) },
  emptyTitle: { ...type.title, fontSize: 16, color: colors.text },
  emptySub: { ...type.secondary, color: colors.textMuted, textAlign: 'center' },
});
