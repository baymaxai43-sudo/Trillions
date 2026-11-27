import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassBackdrop } from '../../src/components/Glass';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '../../src/components/TopBar';
import { Sheet } from '../../src/components/Sheet';
import { ListSkeleton } from '../../src/components/Skeleton';
import { createProject, listProjects, Project } from '../../src/lib/projects';
import { colors, radius, space, type } from '../../src/theme';

export default function Projects() {
  const [list, setList] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await listProjects());
    } catch (e) {
      setError((e as Error).message);
      setList((l) => l ?? []);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <GlassBackdrop>

    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <TopBar active="projects" onAdd={() => setCreating(true)} />
      {list === null ? (
        <ListSkeleton rows={5} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerStyle={list.length === 0 ? { flexGrow: 1 } : { paddingTop: space(3), paddingBottom: space(4) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} colors={[colors.accent]} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push({ pathname: '/projects/[id]', params: { id: item.id } })} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
              <Text style={s.title} numberOfLines={1}>{item.title}</Text>
              {!!item.description && <Text style={s.desc} numberOfLines={1}>{item.description}</Text>}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name={error ? 'cloud-offline-outline' : 'folder-open-outline'} size={28} color={colors.textFaint} />
              <Text style={s.emptyTitle}>{error ? 'Couldn\u2019t load projects' : 'No projects yet'}</Text>
              <Text style={s.emptySub}>{error ?? 'Group related chats into a project to keep work in one place.'}</Text>
            </View>
          }
        />
      )}
      <CreateProjectSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(p) => {
          setCreating(false);
          setList((l) => [p, ...(l ?? [])]);
          router.push({ pathname: '/projects/[id]', params: { id: p.id } });
        }}
      />
    </SafeAreaView>
    </GlassBackdrop>
  );
}

function CreateProjectSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (p: Project) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!name.trim()) return setErr('Give your project a name.');
    setBusy(true);
    setErr(null);
    try {
      const p = await createProject(name, desc);
      setName('');
      setDesc('');
      onCreated(p);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="New project">
      <TextInput style={s.input} placeholder="Name" placeholderTextColor={colors.textFaint} value={name} onChangeText={setName} autoFocus maxLength={80} />
      <TextInput style={[s.input, s.multiline]} placeholder="Description (optional)" placeholderTextColor={colors.textFaint} value={desc} onChangeText={setDesc} multiline maxLength={400} textAlignVertical="top" />
      {err && <Text style={s.err}>{err}</Text>}
      <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [s.primary, (pressed || busy) && s.pressed]}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Create project</Text>}
      </Pressable>
    </Sheet>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(2), paddingTop: space(2), paddingBottom: space(1.5) },
  h1: { flex: 1, ...type.display, color: colors.text },
  newBtn: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space(1.5), borderRadius: radius.md, backgroundColor: colors.accentDark },
  newText: { ...type.caption, fontSize: 14, color: '#fff', fontWeight: '500' },
  pressed: { opacity: 0.65 },
  row: { paddingHorizontal: space(3), paddingVertical: space(1.5) },
  rowPressed: { opacity: 0.55 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  desc: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  time: { ...type.caption, color: colors.textFaint },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(4), gap: space(0.75) },
  emptyTitle: { ...type.title, fontSize: 16, color: colors.text },
  emptySub: { ...type.secondary, color: colors.textMuted, textAlign: 'center' },
  input: { ...type.body, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(1.5), height: 48, marginBottom: space(1.25), backgroundColor: 'rgba(255,255,255,0.9)' },
  multiline: { height: 96, paddingTop: space(1.25) },
  err: { ...type.caption, color: colors.danger, marginBottom: space(1) },
  primary: { height: 50, borderRadius: 999, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: space(0.5) },
  primaryText: { ...type.body, color: '#fff', fontWeight: '600' },
});
