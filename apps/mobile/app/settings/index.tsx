import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { BackHeader } from '../../src/components/TopBar';
import { GlassBackdrop } from '../../src/components/Glass';
import { Row, Section } from '../../src/components/SettingsUI';
import { signOutGoogle } from '../../src/lib/google';
import { userInfo, useSession } from '../../src/lib/session';
import { supabase } from '../../src/lib/supabase';
import { colors, space } from '../../src/theme';

export default function Settings() {
  const { session } = useSession();
  const u = userInfo(session?.user);
  const isEmailUser = u.providers.includes('email');

  const signOut = () =>
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOutGoogle();
          await supabase.auth.signOut();
        },
      },
    ]);

  return (
    <GlassBackdrop>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <BackHeader title="" />
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => router.push('/settings/profile')} style={({ pressed }) => [s.profile, pressed && { opacity: 0.7 }]}>
            <Text style={s.name} numberOfLines={1}>{u.name || 'Your account'}</Text>
            <Text style={s.email} numberOfLines={1}>{u.email}</Text>
          </Pressable>

          <View style={s.plan}>
            <View style={s.planRow}>
              <Text style={s.planName}>TRILLION <Text style={s.planItalic}>free</Text></Text>
              <Pressable onPress={() => Alert.alert('TRILLION Pro', 'Pro plans are coming soon.')} style={({ pressed }) => [s.upgrade, pressed && { opacity: 0.8 }]}>
                <Text style={s.upgradeText}>Upgrade to Pro</Text>
              </Pressable>
            </View>
            <View style={s.planDivider} />
            <Row label="Usage and plan" onPress={() => Alert.alert('Usage and plan', 'You are on the free plan.')} last />
          </View>

          <Section>
            <Row icon="person-outline" label="Profile" onPress={() => router.push('/settings/profile')} />
            <Row icon="time-outline" label="Scheduled Tasks" onPress={() => router.push('/settings/schedules')} />
            <Row icon="link-outline" label="Accounts" onPress={() => router.push('/connections')} last />
          </Section>

          <Section>
            {isEmailUser && <Row icon="shield-outline" label="Security" onPress={() => router.push('/settings/security')} />}
            <Row icon="settings-outline" label="System Preferences" onPress={() => router.push('/settings/preferences')} />
            <Row icon="chatbox-outline" label="Submit Feedback" onPress={() => Linking.openURL('mailto:trillionapp.official@gmail.com?subject=TRILLION%20feedback').catch(() => {})} />
            <Row icon="information-circle-outline" label="About" onPress={() => router.push('/settings/about')} last />
          </Section>

          <Pressable onPress={signOut} style={({ pressed }) => [s.signOut, pressed && { opacity: 0.7 }]}>
            <Ionicons name="log-out-outline" size={20} color={colors.text} />
            <Text style={s.signOutText}>Sign Out</Text>
          </Pressable>

          <Pressable onPress={() => router.push({ pathname: '/chats', params: { focus: 'search' } })} style={({ pressed }) => [s.search, pressed && { opacity: 0.7 }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <Text style={s.searchText}>Search</Text>
          </Pressable>
          <Text style={s.version}>v{Constants.expoConfig?.version ?? ''}</Text>
        </ScrollView>
      </SafeAreaView>
    </GlassBackdrop>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  body: { paddingHorizontal: space(2), paddingBottom: space(5) },
  profile: { paddingHorizontal: space(0.5), paddingTop: space(1.5), paddingBottom: space(2) },
  name: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6, color: colors.text },
  email: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  plan: { borderRadius: 22, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.glassLine, overflow: 'hidden' },
  planRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(2), paddingTop: space(2), paddingBottom: space(1.75), gap: space(1) },
  planName: { flex: 1, fontSize: 20, fontWeight: '500', color: colors.text, letterSpacing: -0.3 },
  planItalic: { fontStyle: 'italic', fontWeight: '400', color: colors.textMuted },
  upgrade: { height: 38, paddingHorizontal: space(2), borderRadius: 999, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  upgradeText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  planDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(17,18,20,0.09)', marginHorizontal: space(2) },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), height: 56, marginTop: space(1.75), paddingHorizontal: space(2), borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.4)' },
  signOutText: { fontSize: 15.5, fontWeight: '500', color: colors.text },
  search: { flexDirection: 'row', alignItems: 'center', gap: space(1), height: 50, marginTop: space(2.5), paddingHorizontal: space(2), borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.glassLine },
  searchText: { fontSize: 15, color: colors.textMuted },
  version: { textAlign: 'center', fontSize: 12, color: 'rgba(17,18,20,0.4)', marginTop: space(2) },
});
