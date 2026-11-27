import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassBackdrop } from '../../src/components/Glass';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BackHeader } from '../../src/components/TopBar';
import { ListSkeleton } from '../../src/components/Skeleton';
import { Conversation, relativeTime } from '../../src/lib/conversations';
import { openConversation } from '../../src/lib/nav';
import { archiveProject, createProjectConversation, getProject, Project, projectConversations } from '../../src/lib/projects';
import { colors, radius, space, type } from '../../src/theme';

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [p, c] = await Promise.all([getProject(id), projectConversations(id)]);
      setProject(p);
      setConvs(c);
    } catch (e) {
      setError((e as Error).message);
      setProject((p) => (p === undefined ? null : p));
      setConvs((c) => c ?? []);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const newChat = async () => {
    if (!id) return;
    setStarting(true);
    try {
      const convId = await createProjectConversation(id);
      openConversation(convId);
    } catch (e) {
      Alert.alert('Could not start a chat', (e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const archive = () =>
    Alert.alert('Archive project?', 'Its chats stay available in All chats.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: async () => {
          try {
            await archiveProject(id!);
            router.back();
          } catch (e) {
            Alert.alert('Could not archive', (e as Error).message);
          }
        },
      },
    ]);

  return (
    <GlassBackdrop>

    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <BackHeader
        title={project?.title ?? 'Project'}
        right={
          <Pressable onPress={archive} hitSlop={10} style={s.iconBtn} accessibilityLabel="Archive project">
            <Ionicons name="archive-outline" size={19} color={colors.textMuted} />
          </Pressable>
        }
      />
      {project === undefined ? (
        <ListSkeleton rows={4} />
      ) : (
        <FlatList
          data={convs ?? []}
          keyExtractor={(c) => c.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} colors={[colors.accent]} />}
          ListHeaderComponent={
            <View style={s.header}>
              <View style={s.bigIcon}><Ionicons name="folder-outline" size={22} color={colors.accentDark} /></View>
              <Text style={s.h1}>{project?.title ?? 'Project not found'}</Text>
              {!!project?.description && <Text style={s.desc}>{project.description}</Text>}
              {error && <Text style={s.err}>{error}</Text>}
              <Pressable onPress={newChat} disabled={starting || !project} style={({ pressed }) => [s.primary, (pressed || starting || !project) && s.pressed]}>
                {starting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="create-outline" size={17} color="#fff" />
                    <Text style={s.primaryText}>New chat in project</Text>
                  </>
                )}
              </Pressable>
              <Text style={s.section}>Chats</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => openConversation(item.id)} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
              <Text style={s.title} numberOfLines={1}>{item.title?.trim() || 'Untitled'}</Text>
              <Text style={s.time}>{relativeTime(item.updated_at)}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={s.empty}>No chats in this project yet.</Text>}
        />
      )}
    </SafeAreaView>
    </GlassBackdrop>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: space(2), paddingTop: space(2.5) },
  bigIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space(1.5) },
  h1: { ...type.display, color: colors.text },
  desc: { ...type.secondary, color: colors.textMuted, marginTop: space(0.75) },
  err: { ...type.caption, color: colors.danger, marginTop: space(1) },
  primary: { flexDirection: 'row', gap: 6, height: 44, borderRadius: radius.md, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center', marginTop: space(2) },
  primaryText: { ...type.secondary, color: '#fff', fontWeight: '600' },
  pressed: { opacity: 0.65 },
  section: { ...type.micro, color: colors.textFaint, textTransform: 'uppercase', marginTop: space(3), marginBottom: space(0.5) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingHorizontal: space(2), paddingVertical: space(1.75), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.surface },
  title: { flex: 1, ...type.secondary, color: colors.text },
  time: { ...type.caption, color: colors.textFaint },
  empty: { ...type.secondary, color: colors.textMuted, paddingHorizontal: space(2), paddingVertical: space(2) },
});
