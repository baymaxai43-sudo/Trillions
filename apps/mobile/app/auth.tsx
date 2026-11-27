import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassBackdrop } from '../src/components/Glass';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../src/lib/supabase';
import { signInWithGoogle } from '../src/lib/google';
import { colors, radius, space, type } from '../src/theme';

WebBrowser.maybeCompleteAuthSession();

type Mode = 'in' | 'up' | 'code';
const CODE_LEN = 6;

export default function Auth() {
  const [mode, setMode] = useState<Mode>('in');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'email' | 'google' | 'github' | 'resend'>(null);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const err = (text: string) => setMsg({ text });

  const verify = async (token: string) => {
    if (token.length !== CODE_LEN) return;
    setBusy('email');
    setMsg(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'signup' });
    setBusy(null);
    if (error) {
      setCode('');
      return err(error.message);
    }
    // The root gate navigates once the session lands.
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setBusy('resend');
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
    setBusy(null);
    if (error) return err(error.message);
    setCooldown(30);
    setMsg({ text: 'New code sent.', ok: true });
  };

  const submit = async () => {
    const creds = { email: email.trim(), password };
    if (!creds.email || !creds.password) return err('Enter your email and password.');
    setBusy('email');
    setMsg(null);
    const { data, error } = mode === 'in' ? await supabase.auth.signInWithPassword(creds) : await supabase.auth.signUp(creds);
    setBusy(null);
    if (error) {
      if (/confirm/i.test(error.message)) {
        await supabase.auth.resend({ type: 'signup', email: creds.email });
        setCooldown(30);
        setMode('code');
        return setMsg({ text: "Your email isn't confirmed yet. We sent you a new code.", ok: true });
      }
      return err(error.message);
    }
    if (!data.session) {
      setCode('');
      setCooldown(30);
      setMode('code');
    }
  };

  const google = async () => {
    setBusy('google');
    setMsg(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      err((e as Error).message || 'Google sign-in failed.');
    } finally {
      setBusy(null);
    }
  };

  const github = async () => {
    setBusy('github');
    setMsg(null);
    try {
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo, skipBrowserRedirect: true } });
      if (error || !data?.url) throw error ?? new Error('Could not start GitHub sign-in');
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== 'success') return;
      const { queryParams } = Linking.parse(res.url);
      const authCode = typeof queryParams?.code === 'string' ? queryParams.code : null;
      if (!authCode) throw new Error(String(queryParams?.error_description ?? 'GitHub sign-in was cancelled'));
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(authCode);
      if (exErr) throw exErr;
    } catch (e) {
      err((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <GlassBackdrop>

    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          {mode === 'code' ? (
            <>
              <Pressable onPress={() => { setMode('up'); setMsg(null); }} hitSlop={10} style={s.back}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
              <Image source={require('../assets/logo-mark.png')} style={s.mark} />
              <Text style={s.title}>Check your email</Text>
              <Text style={s.sub}>Enter the 6-digit code we sent to{'\n'}<Text style={s.subStrong}>{email.trim()}</Text></Text>
              <OtpBoxes value={code} onChange={(v) => { setCode(v); if (v.length === CODE_LEN) verify(v); }} disabled={busy === 'email'} />
              {msg && <Text style={[s.msg, msg.ok && s.msgOk]}>{msg.text}</Text>}
              <Pressable style={({ pressed }) => [s.primary, (pressed || code.length < CODE_LEN) && s.dim]} onPress={() => verify(code)} disabled={!!busy || code.length < CODE_LEN}>
                {busy === 'email' ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>Verify</Text>}
              </Pressable>
              <Pressable onPress={resend} disabled={cooldown > 0 || !!busy} hitSlop={8}>
                <Text style={[s.link, cooldown > 0 && { color: colors.textFaint }]}>
                  {busy === 'resend' ? 'Sending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Image source={require('../assets/logo-mark.png')} style={s.mark} />
              <Text style={s.title}>Welcome to TRILLION</Text>
              <Text style={s.sub}>{mode === 'in' ? 'Sign in to continue.' : 'Create your account.'}</Text>

              <Pressable style={({ pressed }) => [s.oauth, pressed && s.pressed]} onPress={google} disabled={!!busy}>
                {busy === 'google' ? <ActivityIndicator color={colors.text} /> : <Ionicons name="logo-google" size={18} color="#4285F4" />}
                <Text style={s.oauthText}>Continue with Google</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [s.oauth, pressed && s.pressed]} onPress={github} disabled={!!busy}>
                {busy === 'github' ? <ActivityIndicator color={colors.text} /> : <Ionicons name="logo-github" size={18} color="#1F2328" />}
                <Text style={s.oauthText}>Continue with GitHub</Text>
              </Pressable>

              <View style={s.orRow}>
                <View style={s.line} />
                <Text style={s.or}>or</Text>
                <View style={s.line} />
              </View>

              <TextInput
                style={s.input}
                placeholder="Email"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={s.input}
                placeholder="Password"
                placeholderTextColor={colors.textFaint}
                secureTextEntry
                autoComplete={mode === 'in' ? 'password' : 'new-password'}
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={submit}
              />
              {msg && <Text style={[s.msg, msg.ok && s.msgOk]}>{msg.text}</Text>}
              <Pressable style={({ pressed }) => [s.primary, pressed && s.dim]} onPress={submit} disabled={!!busy}>
                {busy === 'email' ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryText}>{mode === 'in' ? 'Sign in' : 'Create account'}</Text>}
              </Pressable>
              <Pressable onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }} hitSlop={8}>
                <Text style={s.switchText}>
                  {mode === 'in' ? "Don't have an account? " : 'Already have an account? '}
                  <Text style={s.linkInline}>{mode === 'in' ? 'Sign up' : 'Sign in'}</Text>
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </GlassBackdrop>
  );
}

/** Six separate digit boxes backed by one hidden input (handles paste and autofill). */
function OtpBoxes({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(true);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={s.otpRow}>
      {Array.from({ length: CODE_LEN }).map((_, i) => {
        const active = focused && (i === value.length || (i === CODE_LEN - 1 && value.length === CODE_LEN));
        return (
          <View key={i} style={[s.otpBox, active && s.otpBoxActive, !!value[i] && s.otpBoxFilled]}>
            <Text style={s.otpDigit}>{value[i] ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, CODE_LEN))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={CODE_LEN}
        autoFocus
        editable={!disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={s.hiddenInput}
        caretHidden
      />
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  wrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space(3), paddingVertical: space(4), gap: space(1.5) },
  back: { position: 'absolute', top: space(1), left: space(1.5), width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 52, height: 52, alignSelf: 'center', borderRadius: 13, marginBottom: space(1) },
  title: { ...type.display, color: colors.text, textAlign: 'center' },
  sub: { ...type.secondary, color: colors.textMuted, textAlign: 'center', marginBottom: space(1.5) },
  subStrong: { color: colors.text, fontWeight: '500' },
  oauth: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space(1.25),
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  oauthText: { ...type.body, color: colors.text, fontWeight: '500' },
  pressed: { backgroundColor: colors.surface },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), marginVertical: space(0.5) },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  or: { ...type.caption, color: colors.textFaint },
  input: {
    ...type.body,
    height: 50,
    color: colors.text,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space(1.75),
  },
  msg: { ...type.caption, color: colors.danger, textAlign: 'center' },
  msgOk: { color: colors.accentDark },
  primary: { height: 50, backgroundColor: colors.accentDark, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: space(0.5) },
  primaryText: { ...type.body, color: '#fff', fontWeight: '600' },
  dim: { opacity: 0.6 },
  switchText: { ...type.secondary, color: colors.textMuted, textAlign: 'center', marginTop: space(1) },
  linkInline: { color: colors.accentDark, fontWeight: '500' },
  link: { ...type.secondary, color: colors.accentDark, textAlign: 'center', marginTop: space(1), fontWeight: '500' },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: space(1), marginVertical: space(1) },
  otpBox: { width: 46, height: 54, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  otpBoxActive: { borderColor: colors.accent, borderWidth: 1.5 },
  otpBoxFilled: { backgroundColor: colors.surface },
  otpDigit: { fontSize: 22, fontWeight: '600', color: colors.text },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});
