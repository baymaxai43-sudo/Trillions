import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { colors, radius, space, type } from '../src/theme';

export default function Auth() {
  const [mode, setMode] = useState<'in' | 'up' | 'code'>('in');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Wake the API early (free hosting sleeps), so the code email isn't delayed.
  useEffect(() => {
    const api = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
    if (api) fetch(`${api}/health`).catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    const creds = { email: email.trim(), password };
    if (mode === 'code') {
      const { data, error } = await supabase.auth.verifyOtp({ email: creds.email, token: code.trim(), type: 'signup' });
      setBusy(false);
      if (error) return setMsg(error.message);
      if (data.session) router.replace('/');
      return;
    }
    const { data, error } =
      mode === 'in' ? await supabase.auth.signInWithPassword(creds) : await supabase.auth.signUp(creds);
    setBusy(false);
    if (error) {
      if (/confirm/i.test(error.message)) {
        await supabase.auth.resend({ type: 'signup', email: creds.email });
        setMode('code');
        return setMsg('Your email isn\'t confirmed yet. We sent you a new code.');
      }
      return setMsg(error.message);
    }
    if (data.session) router.replace('/');
    else {
      setMode('code');
      setMsg(null);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Image source={require('../assets/logo-mark.png')} style={s.mark} />
        <Text style={s.title}>{mode === 'in' ? 'Welcome back' : mode === 'up' ? 'Create your account' : 'Check your email'}</Text>
        {mode === 'code' ? (
          <>
            <Text style={s.sub}>Enter the 6-digit code we sent to {email.trim()}</Text>
            <TextInput style={[s.input, s.code]} placeholder="000000" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} autoFocus />
          </>
        ) : (
          <>
            <TextInput style={s.input} placeholder="Email" placeholderTextColor={colors.textMuted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <TextInput style={s.input} placeholder="Password" placeholderTextColor={colors.textMuted} secureTextEntry value={password} onChangeText={setPassword} />
          </>
        )}
        {msg && <Text style={s.msg}>{msg}</Text>}
        <Pressable style={s.btn} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{mode === 'in' ? 'Sign in' : mode === 'up' ? 'Sign up' : 'Verify'}</Text>}
        </Pressable>
        {mode === 'code' ? (
          <Pressable onPress={async () => { await supabase.auth.resend({ type: 'signup', email: email.trim() }); setMsg('New code sent.'); }}>
            <Text style={s.switch}>Resend code</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')}>
            <Text style={s.switch}>{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</Text>
          </Pressable>
        )}
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
  sub: { ...type.secondary, color: colors.textMuted, textAlign: 'center' },
  code: { textAlign: 'center', fontSize: 28, letterSpacing: 8, fontWeight: '700' },
  msg: { ...type.secondary, color: colors.danger, textAlign: 'center' },
  btn: { backgroundColor: colors.primaryDark, borderRadius: radius.pill, paddingVertical: space(1.75), alignItems: 'center' },
  btnText: { ...type.body, color: '#fff', fontWeight: '600' },
  switch: { ...type.secondary, color: colors.primaryDark, textAlign: 'center', marginTop: space(1) },
});
