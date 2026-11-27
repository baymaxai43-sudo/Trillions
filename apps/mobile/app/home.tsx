import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { TopBar } from '../src/components/TopBar';
import { colors, radius, space, type } from '../src/theme';

/** Home: glanceable panels. Placeholder data until the panels API exists. */
const PANELS = [
  { title: 'Credits left', value: '—', note: 'Plans arrive in Phase 6' },
  { title: 'Active tasks', value: '0', note: 'Agent beta: Phase 4' },
];

export default function Home() {
  return (
    <SafeAreaView style={s.safe}>
      <TopBar title="Home" onHome={() => router.back()} />
      <ScrollView contentContainerStyle={s.grid}>
        {PANELS.map((p) => (
          <View key={p.title} style={s.panel}>
            <Text style={s.pTitle}>{p.title}</Text>
            <Text style={s.pValue}>{p.value}</Text>
            <Text style={s.pNote}>{p.note}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  grid: { padding: space(2), gap: space(1.5) },
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: space(2) },
  pTitle: { ...type.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  pValue: { ...type.display, color: colors.primaryDark, marginTop: space(0.5) },
  pNote: { ...type.secondary, color: colors.textMuted, marginTop: space(0.5) },
});
