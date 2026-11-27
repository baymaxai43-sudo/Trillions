import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BackHeader } from '../../src/components/TopBar';
import { ListSkeleton } from '../../src/components/Skeleton';
import { apiFetch } from '../../src/lib/api';
import { colors, space, type } from '../../src/theme';

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
  enabled: boolean;
};

const cadence = (t: Schedule) =>
  t.kind === 'daily'
    ? `Daily at ${t.time_of_day ?? '—'} (${t.timezone})`
    : t.kind === 'interval'
      ? `Every ${t.every_minutes && t.every_minutes % 60 === 0 ? `${t.every_minutes / 60}h` : `${t.every_minutes}m`}`
      : `Once${t.run_at ? `, ${new Date(t.run_at).toLocaleString()}` : ''}`;

export default function Schedules() {
  const [list, setList] = useState<Schedule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await apiFetch<Schedule[]>('/v1/agent/schedules'));
    } catch (e) {
      setError((e as Error).message);
      setList((l) => l ?? []);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const remove = (t: Schedule) =>
    Alert.alert('Delete scheduled task?', t.title ?? t.prompt.slice(0, 80), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(t.id);
          try {
            await apiFetch(`/v1/agent/schedules/${t.id}`, { method: 'DELETE' });
            setList((l) => l?.filter((x) => x.id !== t.id) ?? l);
          } catch (e) {
            Alert.alert('Could not delete', (e as Error).message);
          } finally {
            setDeleting(null);
          }
        },
      },
    ]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <BackHeader title="Scheduled tasks" />
      {list === null ? (
        <ListSkeleton rows={4} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(t) => t.id}
          contentContainerStyle={list.length === 0 ? { flexGrow: 1 } : undefined}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} colors={[colors.accent]} />}
          renderItem={({ item }) => (
            <View style={s.row}>
              <View style={[s.dot, { backgroundColor: item.enabled ? colors.accent : colors.borderStrong }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={2}>{item.title || item.prompt}</Text>
                <Text style={s.meta}>{cadence(item)}</Text>
                {item.next_run_at && item.enabled && <Text style={s.meta}>Next: {new Date(item.next_run_at).toLocaleString()}</Text>}
              </View>
              {deleting === item.id ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Pressable onPress={() => remove(item)} hitSlop={10} accessibilityLabel="Delete">
                  <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name={error ? 'cloud-offline-outline' : 'time-outline'} size={28} color={colors.textFaint} />
              <Text style={s.emptyTitle}>{error ? 'Couldn\u2019t load tasks' : 'No scheduled tasks'}</Text>
              <Text style={s.emptySub}>{error ?? 'Ask TRILLION in Agent mode, e.g. \u201cevery morning at 8, summarize the news\u201d.'}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingHorizontal: space(2), paddingVertical: space(1.75), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { ...type.secondary, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(4), gap: space(0.75) },
  emptyTitle: { ...type.title, fontSize: 16, color: colors.text },
  emptySub: { ...type.secondary, color: colors.textMuted, textAlign: 'center' },
});
