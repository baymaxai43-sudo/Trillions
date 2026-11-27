import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ChatItem } from '../lib/agent';
import { listProviders, PROVIDER_MONO, ProviderId, saveToken } from '../lib/connectors';
import { colors, radius, space, type } from '../theme';
import { Glass } from './Glass';

/** Provider monogram tile. */
export function ProviderMark({ id, on }: { id: ProviderId; on?: boolean }) {
  return (
    <View style={[s.mark, on && s.markOn]}>
      <Text style={[s.markText, on && s.markTextOn]}>{PROVIDER_MONO[id] ?? id.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

/** Numbered how-to steps plus a button to the provider's token page. */
export function HowTo({ steps, tokenUrl, label }: { steps: string[]; tokenUrl: string; label: string }) {
  return (
    <View style={s.howTo}>
      {steps.map((t, i) => (
        <View key={i} style={s.stepRow}>
          <Text style={s.stepNum}>{i + 1}</Text>
          <Text style={s.stepText}>{t}</Text>
        </View>
      ))}
      <Pressable onPress={() => Linking.openURL(tokenUrl).catch(() => {})} style={({ pressed }) => [s.linkBtn, pressed && s.pressed]} accessibilityRole="link">
        <Ionicons name="open-outline" size={15} color={colors.text} />
        <Text style={s.linkText}>Create a {label} token</Text>
      </Pressable>
    </View>
  );
}

/**
 * Secure paste field. The token goes straight to POST /v1/connect/:provider/key and is cleared from
 * state right after; it never becomes a chat message.
 */
export function TokenForm({ provider, label, placeholder, onSaved, onCancel }: { provider: ProviderId; label: string; placeholder?: string; onSaved: (account: string | null) => void; onCancel?: () => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = token.trim().length >= 10;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const label = await saveToken(provider, token);
      setToken('');
      onSaved(label);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.form}>
      <TextInput
        style={s.input}
        value={token}
        onChangeText={(t) => {
          setToken(t);
          if (error) setError(null);
        }}
        placeholder={placeholder ?? 'Paste access token'}
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        importantForAutofill="no"
        textContentType="none"
        secureTextEntry
        onSubmitEditing={save}
        returnKeyType="done"
        editable={!busy}
      />
      {!!error && <Text style={s.error}>{error}</Text>}
      <View style={s.actions}>
        {onCancel && (
          <Pressable onPress={onCancel} style={({ pressed }) => [s.btn, s.btnGhost, pressed && s.pressed]}>
            <Text style={s.btnGhostText}>Cancel</Text>
          </Pressable>
        )}
        <Pressable onPress={save} disabled={!valid || busy} style={({ pressed }) => [s.btn, s.btnFlex, (!valid || busy) && s.disabled, pressed && s.pressed]}>
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Save securely</Text>}
        </Pressable>
      </View>
      <Text style={s.fine}>Checked with {label}, encrypted on the server, never shown to the AI.</Text>
    </View>
  );
}

/** In-chat card shown when the agent calls request_connection. */
export function ConnectCard({ item }: { item: Extract<ChatItem, { kind: 'connect' }> }) {
  const [connected, setConnected] = useState(item.connected);
  const [account, setAccount] = useState(item.accountLabel);
  const [replacing, setReplacing] = useState(false);

  // The event may be older than the connection (replayed run): check the live state once.
  useEffect(() => {
    if (item.connected) return;
    let alive = true;
    listProviders()
      .then((list) => {
        const p = list.find((x) => x.id === item.provider);
        if (alive && p?.connected) {
          setConnected(true);
          setAccount(p.accountLabel);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.provider, item.connected]);

  const showForm = !connected || replacing;

  return (
    <Glass style={s.card} strong padded={false}>
      <View style={s.inner}>
        <View style={s.head}>
          <ProviderMark id={item.provider} on={connected} />
          <View style={s.flex}>
            <Text style={s.title}>{connected ? `${item.label} connected` : `Connect ${item.label}`}</Text>
            <Text style={s.sub} numberOfLines={3}>
              {connected ? (account ? `Connected as ${account}` : 'Ready to use') : item.reason || 'Paste an access token to continue.'}
            </Text>
          </View>
          {connected && !replacing && <Ionicons name="checkmark-circle" size={22} color={colors.success} />}
        </View>
        {showForm && (
          <>
            <HowTo steps={item.howTo} tokenUrl={item.tokenUrl} label={item.label} />
            <TokenForm
              provider={item.provider}
              label={item.label}
              onSaved={(label) => {
                setConnected(true);
                setAccount(label);
                setReplacing(false);
              }}
              onCancel={replacing ? () => setReplacing(false) : undefined}
            />
          </>
        )}
        {connected && !replacing && (
          <View style={s.doneRow}>
            <Text style={s.fine}>Reply “done” and TRILLION will continue.</Text>
            <Pressable onPress={() => setReplacing(true)} hitSlop={8}>
              <Text style={s.replace}>Replace token</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Glass>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  card: { marginVertical: 6, marginRight: '4%' },
  inner: { padding: space(2), gap: space(1.5) },
  head: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  title: { ...type.title, color: colors.text },
  sub: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  mark: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  markOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  markText: { fontWeight: '700', color: colors.textMuted, fontSize: 13 },
  markTextOn: { color: '#fff' },
  howTo: { gap: space(1) },
  stepRow: { flexDirection: 'row', gap: space(1), alignItems: 'flex-start' },
  stepNum: { width: 20, height: 20, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.ink, color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 20 },
  stepText: { flex: 1, ...type.caption, color: colors.text },
  linkBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: space(1.5), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.borderStrong },
  linkText: { ...type.caption, color: colors.text, fontWeight: '600' },
  form: { gap: space(1) },
  input: { height: 48, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.borderStrong, backgroundColor: 'rgba(255,255,255,0.9)', paddingHorizontal: space(1.5), color: colors.text, ...type.secondary },
  error: { ...type.caption, color: colors.danger },
  actions: { flexDirection: 'row', gap: space(1) },
  btn: { height: 44, paddingHorizontal: space(2), borderRadius: 999, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  btnFlex: { flex: 1 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  btnGhost: { backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.borderStrong },
  btnGhostText: { color: colors.text, fontSize: 15, fontWeight: '500' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  fine: { ...type.caption, fontSize: 12, color: colors.textFaint },
  doneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(1) },
  replace: { ...type.caption, color: colors.link, fontWeight: '600' },
});
