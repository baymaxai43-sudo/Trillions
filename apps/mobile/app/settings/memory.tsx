import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassBackdrop } from '../../src/components/Glass';
import { BackHeader } from '../../src/components/TopBar';
import { ListSkeleton } from '../../src/components/Skeleton';
import { apiFetch } from '../../src/lib/api';
import { useSync } from '../../src/lib/sync';
import { colors, radius, space, type } from '../../src/theme';

type Memory = { id: string; content: string; confirmed: boolean; source: string; created_at: string };

const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));

/** "What TRILLION knows": confirmed memories (used in every chat) and pending ones awaiting review. */
export default function MemoryScreen() {
  const [list, setList] = useState<Memory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await apiFetch<Memory[]>('/v1/memories'));
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
  useSync(['memories'], load);

  const sections = useMemo(() => {
    const pending = (list ?? []).filter((m) => !m.confirmed);
    const known = (list ?? []).filter((m) => m.confirmed);
    return [
      ...(pending.length ? [{ key: 'pending', title: 'Needs your review', hint: 'Saved while TRILLION was reading web pages or your accounts. Used only after you confirm.', data: pending }] : []),
      { key: 'known', title: 'Remembered', hint: 'Used to personalise every conversation.', data: known },
    ];
  }, [list]);

  const confirm = async (m: Memory) => {
    setBusy(m.id);
    try {
      await apiFetch(`/v1/memories/${m.id}/confirm`, { method: 'POST' });
      setList((l) => l?.map((x) => (x.id === m.id ? { ...x, confirmed: true } : x)) ?? l);
    } catch (e) {
      Alert.alert('Could not confirm', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = (m: Memory) =>
    Alert.alert('Forget this?', m.content.slice(0, 140), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: async () => {
          setBusy(m.id);
          try {
            await apiFetch(`/v1/memories/${m.id}`, { method: 'DELETE' });
            setList((l) => l?.filter((x) => x.id !== m.id) ?? l);
          } catch (e) {
            Alert.alert('Could not delete', (e as Error).message);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  const empty = (list?.length ?? 0) === 0;

  return (
    <GlassBackdrop>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <BackHeader title="What TRILLION knows" />
        {list === null ? (
          <ListSkeleton rows={5} />
        ) : empty ? (
          <View style={s.empty}>
            <Ionicons name={error ? 'cloud-offline-outline' : 'sparkles-outline'} size={28} color={colors.textFaint} />
            <Text style={s.emptyTitle}>{error ? 'Couldn’t load memories' : 'Nothing remembered yet'}</Text>
            <Text style={s.emptySub}>{error ?? 'Tell TRILLION things like “remember I deploy on Render” and they show up here.'}</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(m) => m.id}
            contentContainerStyle={s.list}
            stickySectionHeadersEnabled={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.ink} colors={[colors.ink]} />}
            renderSectionHeader={({ section }) => (
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>{section.title}</Text>
                <Text style={s.sectionHint}>{section.hint}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <View style={[s.card, !item.confirmed && s.cardPending]}>
                <Text style={s.content}>{item.content}</Text>
                <View style={s.row}>
                  <Text style={s.meta}>{day(item.created_at)}</Text>
                  {busy === item.id ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : (
                    <View style={s.actions}>
                      {!item.confirmed && (
                        <Pressable onPress={() => confirm(item)} style={({ pressed }) => [s.confirm, pressed && s.pressed]} accessibilityLabel="Confirm memory">
                          <Ionicons name="checkmark" size={15} color="#fff" />
                          <Text style={s.confirmText}>Confirm</Text>
                        </Pressable>
                      )}
                      <Pressable onPress={() => remove(item)} hitSlop={10} accessibilityLabel="Delete memory" style={({ pressed }) => pressed && s.pressed}>
                        <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            )}
            renderSectionFooter={({ section }) => (section.key === 'known' && section.data.length === 0 ? <Text style={s.none}>Nothing confirmed yet.</Text> : null)}
          />
        )}
      </SafeAreaView>
    </GlassBackdrop>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  list: { paddingHorizontal: space(2), paddingBottom: space(5) },
  sectionHead: { marginTop: space(1.5), marginBottom: space(1), marginHorizontal: space(0.5) },
  sectionTitle: { ...type.title, fontSize: 15, color: colors.text },
  sectionHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  card: { borderRadius: radius.card, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.glassLine, padding: space(2), gap: space(1), marginBottom: space(1) },
  cardPending: { backgroundColor: colors.cardStrong, borderColor: colors.borderStrong },
  content: { ...type.secondary, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  meta: { ...type.caption, color: colors.textFaint },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: space(1.5), borderRadius: 999, backgroundColor: colors.ink },
  confirmText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  none: { ...type.caption, color: colors.textFaint, marginHorizontal: space(0.5) },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(4), gap: space(0.75) },
  emptyTitle: { ...type.title, fontSize: 16, color: colors.text },
  emptySub: { ...type.secondary, color: colors.textMuted, textAlign: 'center' },
});
