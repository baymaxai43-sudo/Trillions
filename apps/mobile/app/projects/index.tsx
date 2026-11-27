import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TopBar } from '../../src/components/TopBar';
import { Sheet } from '../../src/components/Sheet';
import { ListSkeleton } from '../../src/components/Skeleton';
import { relativeTime } from '../../src/lib/conversations';
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
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <TopBar active="projects" />
      <View style={s.headRow}>
        <Text style={s.h1}>Projects</Text>
        <Pressable onPress={() => setCreating(true)} style={({ pressed }) => [s.newBtn, pressed && s.pressed]}>
          <Ionicons name="add" size={17} color="#fff" />
          <Text style={s.newText}>New project</Text>
        </Pressable>
      </View>
      {list === null ? (
        <ListSkeleton rows={5} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerStyle={list.length === 0 ? { flexGrow: 1 } : { paddingBottom: space(4) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.accent} colors={[colors.accent]} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push({ pathname: '/projects/[id]', params: { id: item.id } })} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
              <View style={s.icon}><Ionicons name="folder-outline" size={18} color={colors.accentDark} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                {!!item.description && <Text style={s.desc} numberOfLines={1}>{item.description}</Text>}
              </View>
              <Text style={s.time}>{relativeTime(item.updated_at)}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
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
  safe: { flex: 1, backgroundColor: colors.bg },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(2), paddingTop: space(2), paddingBottom: space(1.5) },
  h1: { flex: 1, ...type.display, color: colors.text },
  newBtn: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space(1.5), borderRadius: radius.md, backgroundColor: colors.accentDark },
  newText: { ...type.caption, fontSize: 14, color: '#fff', fontWeight: '500' },
  pressed: { opacity: 0.65 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingHorizontal: space(2), paddingVertical: space(1.5), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowPressed: { backgroundColor: colors.surface },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  title: { ...type.secondary, color: colors.text, fontWeight: '500' },
  desc: { ...type.caption, color: colors.textMuted },
  time: { ...type.caption, color: colors.textFaint },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(4), gap: space(0.75) },
  emptyTitle: { ...type.title, fontSize: 16, color: colors.text },
  emptySub: { ...type.secondary, color: colors.textMuted, textAlign: 'center' },
  input: { ...type.body, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(1.5), height: 48, marginBottom: space(1.25), backgroundColor: 'rgba(255,255,255,0.9)' },
  multiline: { height: 96, paddingTop: space(1.25) },
  err: { ...type.caption, color: colors.danger, marginBottom: space(1) },
  primary: { height: 48, borderRadius: radius.md, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center', marginTop: space(0.5) },
  primaryText: { ...type.body, color: '#fff', fontWeight: '600' },
});
