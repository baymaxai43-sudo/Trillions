import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { colors, radius, space, type } from '../src/theme';

export default function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const creds = { email: email.trim(), password };
    const { data, error } =
      mode === 'in' ? await supabase.auth.signInWithPassword(creds) : await supabase.auth.signUp(creds);
    setBusy(false);
    if (error) return setMsg(error.message);
    if (data.session) router.replace('/');
    else setMsg('Check your email to confirm your account, then sign in.');
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Image source={require('../assets/logo-mark.png')} style={s.mark} />
        <Text style={s.title}>{mode === 'in' ? 'Welcome back' : 'Create your account'}</Text>
        <TextInput style={s.input} placeholder="Email" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Password" placeholderTextColor={colors.textMuted} secureTextEntry value={password} onChangeText={setPassword} />
        {msg && <Text style={s.msg}>{msg}</Text>}
        <Pressable style={s.btn} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{mode === 'in' ? 'Sign in' : 'Sign up'}</Text>}
        </Pressable>
        <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')}>
          <Text style={s.switch}>{mode === 'in' ? "New here? Create an account" : 'Have an account? Sign in'}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { flex: 1, justifyContent: 'center', padding: space(3), gap: space(1.5) },
  mark: { width: 64, height: 64, alignSelf: 'center', marginBottom: space(1), borderRadius: 16 },
  title: { ...type.display, color: colors.text, textAlign: 'center', marginBottom: space(1) },
  input: { ...type.body, color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, paddingHorizontal: space(2), paddingVertical: space(1.5) },
  msg: { ...type.secondary, color: colors.danger, textAlign: 'center' },
  btn: { backgroundColor: colors.primaryDark, borderRadius: radius.pill, paddingVertical: space(1.75), alignItems: 'center' },
  btnText: { ...type.body, color: '#fff', fontWeight: '600' },
  switch: { ...type.secondary, color: colors.primaryDark, textAlign: 'center', marginTop: space(1) },
});
