import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BackHeader } from '../src/components/TopBar';
import { ListSkeleton } from '../src/components/Skeleton';
import { Conversation, deleteConversation, listConversations, relativeTime } from '../src/lib/conversations';
import { openConversation } from '../src/lib/nav';
import { colors, radius, space, type } from '../src/theme';

/** All chats: recent conversations, search, new chat. */
export default function Chats() {
  const params = useLocalSearchParams<{ focus?: string }>();
  const [list, setList] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await listConversations());
    } catch (e) {
      setError((e as Error).message);
      setList((l) => l ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (params.focus === 'search') {
      const t = setTimeout(() => searchRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [params.focus]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!list) return [];
    return term ? list.filter((c) => (c.title ?? 'Untitled').toLowerCase().includes(term)) : list;
  }, [list, q]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmDelete = (c: Conversation) =>
    Alert.alert('Delete conversation?', c.title ?? 'Untitled', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteConversation(c.id);
            setList((l) => l?.filter((x) => x.id !== c.id) ?? l);
          } catch (e) {
            Alert.alert('Could not delete', (e as Error).message);
          }
        },
      },
    ]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <BackHeader title="All chats" />
      <View style={s.head}>
        <View style={s.search}>
          <Ionicons name="search-outline" size={16} color={colors.textFaint} />
          <TextInput
            ref={searchRef}
            style={s.searchInput}
            placeholder="Search conversations"
            placeholderTextColor={colors.textFaint}
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
            autoCorrect={false}
          />
          {!!q && (
            <Pressable onPress={() => setQ('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textFaint} />
            </Pressable>
          )}
        </View>
        <Pressable style={({ pressed }) => [s.newBtn, pressed && s.pressed]} onPress={() => openConversation(null)}>
          <Ionicons name="create-outline" size={17} color="#fff" />
          <Text style={s.newText}>New chat</Text>
        </Pressable>
      </View>

      <Text style={s.section}>Recent</Text>
      {list === null ? (
        <ListSkeleton rows={7} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />}
          contentContainerStyle={filtered.length === 0 ? s.emptyWrap : undefined}
          renderItem={({ item }) => (
            <Pressable onPress={() => openConversation(item.id)} onLongPress={() => confirmDelete(item)} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
              <Text style={s.rowTitle} numberOfLines={1}>{item.title?.trim() || 'Untitled'}</Text>
              <Text style={s.rowTime}>{relativeTime(item.updated_at)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name={error ? 'cloud-offline-outline' : 'chatbubbles-outline'} size={26} color={colors.textFaint} />
              <Text style={s.emptyTitle}>{error ? 'Couldn\u2019t load conversations' : q ? 'No matches' : 'No conversations yet'}</Text>
              <Text style={s.emptySub}>{error ?? (q ? 'Try a different search.' : 'Start a new chat and it will show up here.')}</Text>
              {error && (
                <Pressable onPress={() => { setList(null); load(); }} style={({ pressed }) => [s.retry, pressed && s.pressed]}>
                  <Text style={s.retryText}>Retry</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(1), paddingHorizontal: space(2), paddingTop: space(1.5), paddingBottom: space(1) },
  search: { flex: 1, height: 40, flexDirection: 'row', alignItems: 'center', gap: space(1), paddingHorizontal: space(1.25), borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  searchInput: { flex: 1, ...type.secondary, color: colors.text, paddingVertical: 0 },
  newBtn: { height: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space(1.5), borderRadius: radius.md, backgroundColor: colors.accentDark },
  newText: { ...type.secondary, color: '#fff', fontWeight: '500' },
  pressed: { opacity: 0.7 },
  section: { ...type.micro, color: colors.textFaint, textTransform: 'uppercase', paddingHorizontal: space(2), marginTop: space(1.5), marginBottom: space(0.5) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingHorizontal: space(2), paddingVertical: space(1.75), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.surface },
  rowTitle: { flex: 1, ...type.body, fontSize: 15, color: colors.text },
  rowTime: { ...type.caption, color: colors.textFaint },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(4), gap: space(0.75), marginTop: space(6) },
  emptyTitle: { ...type.title, fontSize: 16, color: colors.text, marginTop: space(0.5) },
  emptySub: { ...type.secondary, color: colors.textMuted, textAlign: 'center' },
  retry: { marginTop: space(1.5), borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingHorizontal: space(2), paddingVertical: space(0.75) },
  retryText: { ...type.secondary, color: colors.text, fontWeight: '500' },
});
