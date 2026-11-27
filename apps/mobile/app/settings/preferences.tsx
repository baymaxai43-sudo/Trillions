import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BackHeader } from '../../src/components/TopBar';
import { Note, Row, Section } from '../../src/components/SettingsUI';
import { SkeletonBlock } from '../../src/components/Skeleton';
import { apiFetch } from '../../src/lib/api';
import { getDefaultModel, setDefaultModel } from '../../src/lib/prefs';
import { colors, space } from '../../src/theme';

type Model = { id: string; label: string; tier: 'fast' | 'balanced' | 'smart' };
/** Models in the 'smart' tier are reserved for TRILLION Pro. */
const isPro = (m: Model) => m.tier === 'smart';

export default function Preferences() {
  const [models, setModels] = useState<Model[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState('auto');

  useEffect(() => {
    getDefaultModel().then(setSelected);
    apiFetch<Model[]>('/v1/chat/models')
      .then((m) => setModels(Array.isArray(m) ? m : []))
      .catch((e) => {
        setError((e as Error).message);
        setModels([]);
      });
  }, []);

  const pick = (id: string) => {
    setSelected(id);
    setDefaultModel(id).catch(() => {});
  };
  const check = (id: string) => (selected === id ? <Ionicons name="checkmark" size={18} color={colors.accentDark} /> : null);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <BackHeader title="Preferences" />
      <ScrollView contentContainerStyle={s.body}>
        <Section title="Appearance">
          <Row icon="sunny-outline" label="Light" right={<Ionicons name="checkmark" size={18} color={colors.accentDark} />} />
          <Row icon="moon-outline" label="Dark" value="Coming soon" last />
        </Section>
        <Section title="Default model">
          <Row icon="sparkles-outline" label="Auto (recommended)" onPress={() => pick('auto')} right={check('auto')} last={!models?.length} />
          {models === null ? (
            <SkeletonBlock style={{ height: 14, width: '60%', margin: space(2) }} />
          ) : (
            models.map((m, i) => (
              <Row
                key={m.id}
                icon="hardware-chip-outline"
                label={m.label}
                onPress={() => pick(m.id)}
                locked={isPro(m)}
                right={isPro(m) ? undefined : check(m.id)}
                last={i === models.length - 1}
              />
            ))
          )}
        </Section>
        {error ? <Note>Couldn’t load the model list ({error}). Auto is used.</Note> : <Note>Auto picks the best model for each message.</Note>}
        <Text style={{ height: space(2) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: space(2), paddingBottom: space(5) },
});
