import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { TopBar } from '../src/components/TopBar';
import { apiFetch } from '../src/lib/api';
import { colors, radius, space, type } from '../src/theme';

type Provider = {
  id: 'github' | 'google' | 'vercel' | 'render';
  label: string;
  kind: 'oauth' | 'api_key';
  configured: boolean;
  description: string;
  connected: boolean;
  accountLabel: string | null;
};

const MONO: Record<Provider['id'], string> = { github: 'GH', google: 'M', vercel: '▲', render: 'R' };
const KEY_HINT: Record<string, string> = {
  render: 'Render → Account settings → API keys',
  vercel: 'Vercel → Account settings → Tokens',
};

export default function Connections() {
  const params = useLocalSearchParams<{ provider?: string; status?: string; message?: string }>();
  const [list, setList] = useState<Provider[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [keyFor, setKeyFor] = useState<Provider['id'] | null>(null);
  const [key, setKey] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await apiFetch<Provider[]>('/v1/connect/providers'));
    } catch (err) {
      Alert.alert('Could not load connections', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Arrived via the trillion://connections deep link after OAuth.
  useEffect(() => {
    if (params.status === 'error') Alert.alert('Not connected', params.message ?? 'Something went wrong.');
    if (params.status) load();
  }, [params.status, params.message, load]);

  const connectOAuth = async (p: Provider) => {
    setWorking(p.id);
    try {
      const { url } = await apiFetch<{ url: string }>(`/v1/connect/${p.id}/start`);
      const result = await WebBrowser.openAuthSessionAsync(url, Linking.createURL('connections'));
      if (result.type === 'success') {
        const q = Linking.parse(result.url).queryParams ?? {};
        if (q.status === 'error') Alert.alert('Not connected', String(q.message ?? 'Something went wrong.'));
      }
      await load();
    } catch (err) {
      Alert.alert('Could not connect', (err as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const saveKey = async () => {
    if (!keyFor || key.trim().length < 10) return;
    setWorking(keyFor);
    try {
      await apiFetch(`/v1/connect/${keyFor}/key`, { method: 'POST', body: { apiKey: key.trim() } });
      setKey('');
      setKeyFor(null);
      await load();
    } catch (err) {
      Alert.alert('Key not accepted', (err as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const disconnect = (p: Provider) =>
    Alert.alert(`Disconnect ${p.label}?`, 'TRILLION will lose access until you connect again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setWorking(p.id);
          try {
            await apiFetch(`/v1/connect/${p.id}`, { method: 'DELETE' });
            await load();
          } finally {
            setWorking(null);
          }
        },
      },
    ]);

  const onConnect = (p: Provider) => {
    if (p.kind === 'api_key' || (p.id === 'vercel' && !p.configured)) return setKeyFor(p.id);
    if (!p.configured) return Alert.alert(`${p.label} isn't set up yet`, 'The server needs its OAuth app credentials first.');
    connectOAuth(p);
  };

  return (
    <SafeAreaView style={s.safe}>
      <TopBar title="Connections" onHome={() => router.back()} />
      <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}>
        <Text style={s.lead}>Let the agent work in your accounts. Tokens are encrypted on the server and never stored on this phone. Anything that sends, commits or deploys asks you first.</Text>
        {!list && loading && <ActivityIndicator color={colors.primary} style={{ marginTop: space(4) }} />}
        {list?.map((p) => (
          <View key={p.id} style={s.card}>
            <View style={s.row}>
              <View style={[s.logo, p.connected && s.logoOn]}>
                <Text style={[s.logoText, p.connected && s.logoTextOn]}>{MONO[p.id]}</Text>
              </View>
              <View style={s.flex}>
                <Text style={s.name}>{p.label}</Text>
                <Text style={s.desc} numberOfLines={2}>
                  {p.connected ? `Connected${p.accountLabel ? ` as ${p.accountLabel}` : ''}` : p.description}
                </Text>
              </View>
              {working === p.id ? (
                <ActivityIndicator color={colors.primary} />
              ) : p.connected ? (
                <Pressable onPress={() => disconnect(p)} style={[s.btn, s.btnGhost]}>
                  <Text style={s.btnGhostText}>Disconnect</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => onConnect(p)} style={[s.btn, !p.configured && p.kind === 'oauth' && p.id !== 'vercel' && s.btnDisabled]}>
                  <Text style={s.btnText}>{p.kind === 'api_key' || (p.id === 'vercel' && !p.configured) ? 'Add key' : 'Connect'}</Text>
                </Pressable>
              )}
            </View>
            {keyFor === p.id && (
              <View style={s.keyBox}>
                <TextInput
                  style={s.input}
                  value={key}
                  onChangeText={setKey}
                  placeholder={p.id === 'render' ? 'rnd_…' : 'Paste token'}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
                <Text style={s.hint}>{KEY_HINT[p.id] ?? ''}</Text>
                <View style={s.row}>
                  <Pressable onPress={() => { setKeyFor(null); setKey(''); }} style={[s.btn, s.btnGhost, s.flex]}>
                    <Text style={s.btnGhostText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={saveKey} style={[s.btn, s.flex]}>
                    <Text style={s.btnText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space(2), gap: space(1.5) },
  lead: { ...type.secondary, color: colors.textMuted, marginBottom: space(0.5) },
  flex: { flex: 1 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: space(1.75), gap: space(1.5) },
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  logoOn: { backgroundColor: colors.brandDeep },
  logoText: { fontWeight: '800', color: colors.primaryDark },
  logoTextOn: { color: '#fff' },
  name: { ...type.body, fontWeight: '600', color: colors.text },
  desc: { ...type.caption, color: colors.textMuted },
  btn: { height: 38, paddingHorizontal: space(2), borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.45 },
  btnText: { ...type.secondary, color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { ...type.secondary, color: colors.text, fontWeight: '600' },
  keyBox: { gap: space(1) },
  input: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, paddingHorizontal: space(1.5), color: colors.text, ...type.secondary },
  hint: { ...type.caption, color: colors.textMuted },
});
