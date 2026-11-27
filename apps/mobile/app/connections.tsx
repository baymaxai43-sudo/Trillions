import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, LayoutAnimation, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassBackdrop, Glass } from '../src/components/Glass';
import { BackHeader } from '../src/components/TopBar';
import { HowTo, ProviderMark, TokenForm } from '../src/components/ConnectCard';
import { disconnectProvider, listProviders, Provider, ProviderId } from '../src/lib/connectors';
import { useSync } from '../src/lib/sync';
import { colors, space, type } from '../src/theme';

/** Token-only connections: paste an access token per provider; nothing is stored on the phone. */
export default function Connections() {
  const [list, setList] = useState<Provider[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<ProviderId | null>(null);
  const [working, setWorking] = useState<ProviderId | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await listProviders());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setList((l) => l ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useSync(['connections'], load);

  const toggle = (id: ProviderId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => (o === id ? null : id));
  };

  const disconnect = (p: Provider) =>
    Alert.alert(`Disconnect ${p.label}?`, 'TRILLION loses access until you paste a token again. Also revoke the token at the provider if you no longer use it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setWorking(p.id);
          try {
            await disconnectProvider(p.id);
            await load();
          } catch (e) {
            Alert.alert('Could not disconnect', (e as Error).message);
          } finally {
            setWorking(null);
          }
        },
      },
    ]);

  return (
    <GlassBackdrop>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <BackHeader title="Accounts" />
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.ink} />}
        >
          <Text style={s.lead}>
            Connect with an access token you create at each provider. Tokens are verified, encrypted on the server and never shown to the AI. Anything that commits, deploys or changes data asks you first.
          </Text>
          {list === null && <ActivityIndicator color={colors.ink} style={{ marginTop: space(4) }} />}
          {!!error && <Text style={s.error}>{error}</Text>}
          {list?.map((p) => {
            const expanded = open === p.id;
            return (
              <Glass key={p.id} style={s.card} padded={false}>
                <Pressable onPress={() => toggle(p.id)} style={({ pressed }) => [s.row, pressed && s.pressed]}>
                  <ProviderMark id={p.id} on={p.connected} />
                  <View style={s.flex}>
                    <Text style={s.name}>{p.label}</Text>
                    <Text style={s.desc} numberOfLines={2}>
                      {p.connected ? `Connected${p.accountLabel ? ` as ${p.accountLabel}` : ''}` : p.description}
                    </Text>
                  </View>
                  {working === p.id ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : p.connected ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                  ) : (
                    <View style={s.pill}><Text style={s.pillText}>Connect</Text></View>
                  )}
                </Pressable>
                {expanded && (
                  <View style={s.expand}>
                    {!p.connected && <HowTo steps={p.howTo} tokenUrl={p.tokenUrl} label={p.label} />}
                    {p.connected && <Text style={s.desc}>Paste a new token to replace the current one, or disconnect.</Text>}
                    <TokenForm
                      provider={p.id}
                      label={p.label}
                      placeholder={p.placeholder}
                      onSaved={async () => {
                        setOpen(null);
                        await load();
                      }}
                    />
                    {p.connected && (
                      <Pressable onPress={() => disconnect(p)} style={({ pressed }) => [s.disconnect, pressed && s.pressed]}>
                        <Ionicons name="unlink-outline" size={16} color={colors.danger} />
                        <Text style={s.disconnectText}>Disconnect {p.label}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </Glass>
            );
          })}
          <Text style={s.note}>Gmail isn’t available: Google only issues short-lived tokens, so it can’t be connected by pasting one.</Text>
        </ScrollView>
      </SafeAreaView>
    </GlassBackdrop>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  body: { paddingHorizontal: space(2), paddingBottom: space(5), gap: space(1.5) },
  lead: { ...type.secondary, color: colors.textMuted, marginBottom: space(0.5), marginHorizontal: space(0.5) },
  error: { ...type.caption, color: colors.danger, marginHorizontal: space(0.5) },
  flex: { flex: 1 },
  card: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), padding: space(2) },
  pressed: { opacity: 0.7 },
  name: { ...type.body, fontWeight: '600', color: colors.text },
  desc: { ...type.caption, color: colors.textMuted },
  pill: { height: 32, paddingHorizontal: space(1.5), borderRadius: 999, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  expand: { paddingHorizontal: space(2), paddingBottom: space(2), gap: space(1.5) },
  disconnect: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 },
  disconnectText: { ...type.caption, color: colors.danger, fontWeight: '600' },
  note: { ...type.caption, color: colors.textFaint, textAlign: 'center', marginTop: space(1), marginHorizontal: space(2) },
});
