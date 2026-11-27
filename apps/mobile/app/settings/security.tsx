import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassBackdrop } from '../../src/components/Glass';
import { BackHeader } from '../../src/components/TopBar';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, space, type } from '../../src/theme';

export default function Security() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);

  const save = async () => {
    if (pw.length < 8) return setMsg({ text: 'Use at least 8 characters.' });
    if (pw !== pw2) return setMsg({ text: 'Passwords don\u2019t match.' });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg({ text: error.message });
    setPw('');
    setPw2('');
    setMsg({ text: 'Password updated.', ok: true });
  };

  return (
    <GlassBackdrop>

    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <BackHeader title="Security" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <Text style={s.h}>Change password</Text>
          <TextInput style={s.input} placeholder="New password" placeholderTextColor={colors.textFaint} secureTextEntry value={pw} onChangeText={setPw} autoComplete="new-password" />
          <TextInput style={s.input} placeholder="Confirm new password" placeholderTextColor={colors.textFaint} secureTextEntry value={pw2} onChangeText={setPw2} autoComplete="new-password" />
          {msg && <Text style={[s.msg, msg.ok && { color: colors.accentDark }]}>{msg.text}</Text>}
          <Pressable onPress={save} disabled={busy} style={({ pressed }) => [s.primary, (busy || pressed) && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Update password</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </GlassBackdrop>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  body: { padding: space(2), gap: space(1.25) },
  h: { ...type.title, color: colors.text, marginBottom: space(0.5) },
  input: { ...type.body, height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(1.5), color: colors.text },
  msg: { ...type.caption, color: colors.danger },
  primary: { height: 46, borderRadius: radius.md, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center', marginTop: space(0.5) },
  primaryText: { ...type.secondary, color: '#fff', fontWeight: '600' },
});
