import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Avatar } from '../../src/components/Avatar';
import { BackHeader } from '../../src/components/TopBar';
import { Glass, GlassBackdrop } from '../../src/components/Glass';
import { Row, Section } from '../../src/components/SettingsUI';
import { signOutGoogle } from '../../src/lib/google';
import { userInfo, useSession } from '../../src/lib/session';
import { supabase } from '../../src/lib/supabase';
import { colors, space, type } from '../../src/theme';

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
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <BackHeader title="Settings" />
      <ScrollView contentContainerStyle={s.body}>
        <Pressable onPress={() => router.push('/settings/profile')} style={({ pressed }) => [s.profile, pressed && { opacity: 0.7 }]}>
          <Avatar photo={u.photo} initial={u.initial} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{u.name || 'Your account'}</Text>
            <Text style={s.email} numberOfLines={1}>{u.email}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>

        <GlassBackdrop style={s.planWrap}>
          <Glass radius={16}>
            <View style={s.planRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.planEyebrow}>Your plan</Text>
                <Text style={s.planName}>TRILLION Free</Text>
              </View>
              <View style={s.badge}><Text style={s.badgeText}>Current</Text></View>
            </View>
            <View style={s.proRow} accessibilityState={{ disabled: true }}>
              <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
              <Text style={s.proText}>TRILLION Pro</Text>
              <Text style={s.soon}>Coming soon</Text>
            </View>
          </Glass>
        </GlassBackdrop>

        <Section>
          <Row icon="ribbon-outline" label="Plan" value="Free" />
          <Row icon="person-outline" label="Profile" onPress={() => router.push('/settings/profile')} />
          <Row icon="time-outline" label="Scheduled tasks" onPress={() => router.push('/settings/schedules')} />
          <Row icon="link-outline" label="Connected accounts" onPress={() => router.push('/connections')} />
          <Row icon="options-outline" label="Preferences" onPress={() => router.push('/settings/preferences')} />
          {isEmailUser && <Row icon="shield-checkmark-outline" label="Security" onPress={() => router.push('/settings/security')} />}
          <Row icon="chatbox-ellipses-outline" label="Feedback" onPress={() => Linking.openURL('mailto:trillionapp.official@gmail.com?subject=TRILLION%20feedback').catch(() => {})} />
          <Row icon="information-circle-outline" label="About" value={`v${Constants.expoConfig?.version ?? ''}`} onPress={() => router.push('/settings/about')} last />
        </Section>

        <Section>
          <Row icon="log-out-outline" label="Sign out" onPress={signOut} danger last />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space(2), paddingBottom: space(5) },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space(1.75), paddingVertical: space(1) },
  name: { ...type.title, color: colors.text },
  email: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  planWrap: { flex: 0, borderRadius: 20, padding: space(1.25), marginTop: space(2) },
  planRow: { flexDirection: 'row', alignItems: 'center' },
  planEyebrow: { ...type.caption, color: colors.textMuted },
  planName: { ...type.title, fontSize: 18, color: colors.text, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: '#BFEBD8' },
  badgeText: { ...type.micro, color: colors.accentDark, fontWeight: '600' },
  proRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space(1.5), paddingTop: space(1.25), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(11,31,23,0.1)', opacity: 0.75 },
  proText: { flex: 1, ...type.secondary, color: colors.textMuted, fontWeight: '500' },
  soon: { ...type.caption, color: colors.textFaint },
});
