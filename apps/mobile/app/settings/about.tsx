import { Image, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GlassBackdrop } from '../../src/components/Glass';
import Constants from 'expo-constants';
import { BackHeader } from '../../src/components/TopBar';
import { Row, Section } from '../../src/components/SettingsUI';
import { API } from '../../src/lib/api';
import { colors, space, type } from '../../src/theme';

export default function About() {
  const version = Constants.expoConfig?.version ?? '—';
  const build = (Constants.expoConfig?.android as { versionCode?: number } | undefined)?.versionCode;
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  return (
    <GlassBackdrop>
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <BackHeader title="About" />
      <ScrollView contentContainerStyle={s.body}>
        <View style={s.top}>
          <Image source={require('../../assets/logo-mark.png')} style={s.mark} />
          <Text style={s.name}>TRILLION</Text>
          <Text style={s.ver}>Version {version}{build ? ` (${build})` : ''}</Text>
        </View>
        <Section>
          <Row icon="document-text-outline" label="Privacy policy" onPress={() => open(`${API}/privacy`)} />
          <Row icon="reader-outline" label="Terms of service" onPress={() => open(`${API}/terms`)} last />
        </Section>
      </ScrollView>
    </SafeAreaView>
    </GlassBackdrop>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
  body: { padding: space(2) },
  top: { alignItems: 'center', paddingVertical: space(3), gap: 4 },
  mark: { width: 64, height: 64, borderRadius: 16, marginBottom: space(1) },
  name: { ...type.title, color: colors.text, letterSpacing: 1 },
  ver: { ...type.caption, color: colors.textMuted },
});
