import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../src/components/Avatar';
import { BackHeader } from '../../src/components/TopBar';
import { Row, Section } from '../../src/components/SettingsUI';
import { userInfo, useSession } from '../../src/lib/session';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, space, type } from '../../src/theme';

export default function Profile() {
  const { session } = useSession();
  const u = userInfo(session?.user);
  const [name, setName] = useState(u.name);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  useEffect(() => setName(u.name), [u.name]);

  const since = session?.user?.created_at ? new Date(session.user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—';
  const dirty = name.trim() !== u.name && name.trim().length > 0;

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { display_name: name.trim(), full_name: name.trim() } });
    setBusy(false);
    setMsg(error ? { text: error.message } : { text: 'Saved.', ok: true });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <BackHeader title="Profile" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={s.top}>
            <Avatar photo={u.photo} initial={u.initial} size={84} />
            <Text style={s.name}>{u.name || 'Your account'}</Text>
            <Text style={s.email}>{u.email}</Text>
          </View>
          <Text style={s.label}>Display name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.textFaint} maxLength={60} />
          {msg && <Text style={[s.msg, msg.ok && { color: colors.accentDark }]}>{msg.text}</Text>}
          <Pressable onPress={save} disabled={!dirty || busy} style={({ pressed }) => [s.primary, (!dirty || busy || pressed) && s.dim]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Save</Text>}
          </Pressable>
          <Section title="Account">
            <Row icon="mail-outline" label="Email" value={u.email} />
            <Row icon="key-outline" label="Sign-in method" value={u.providers.map((p) => p[0].toUpperCase() + p.slice(1)).join(', ')} />
            <Row icon="calendar-outline" label="Member since" value={since} last />
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space(2), paddingBottom: space(5) },
  top: { alignItems: 'center', paddingVertical: space(2), gap: 4 },
  name: { ...type.title, fontSize: 19, color: colors.text, marginTop: space(1) },
  email: { ...type.caption, color: colors.textMuted },
  label: { ...type.caption, color: colors.textMuted, marginTop: space(2), marginBottom: 6 },
  input: { ...type.body, height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(1.5), color: colors.text },
  msg: { ...type.caption, color: colors.danger, marginTop: space(1) },
  primary: { height: 46, borderRadius: radius.md, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center', marginTop: space(1.5) },
  primaryText: { ...type.secondary, color: '#fff', fontWeight: '600' },
  dim: { opacity: 0.5 },
});
