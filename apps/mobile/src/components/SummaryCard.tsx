import { memo, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { plainPreview, Summary } from '../lib/summary';
import { colors, space } from '../theme';

export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });

/** Tappable card under a short reply; opens the full summary sheet. */
export const SummaryCard = memo(function SummaryCard({ summary, onOpen }: { summary: Summary; onOpen: (s: Summary) => void }) {
  const preview = useMemo(() => plainPreview(summary.markdown), [summary.markdown]);
  return (
    <View style={s.row}>
      <Pressable
        onPress={() => onOpen(summary)}
        accessibilityRole="button"
        accessibilityLabel={`Open summary: ${summary.title}`}
        style={({ pressed }) => [s.card, pressed && s.pressed]}
      >
        <View style={s.head}>
          <Text style={s.eyebrow}>Summary</Text>
          <View style={s.expand}>
            <Ionicons name="expand-outline" size={15} color={colors.text} />
          </View>
        </View>
        <Text style={s.title} numberOfLines={2}>{summary.title}</Text>
        {!!preview && <Text style={s.preview} numberOfLines={2}>{preview}</Text>}
      </Pressable>
    </View>
  );
});

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'flex-start', marginVertical: space(0.75), paddingRight: '8%' },
  card: {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 560,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 22,
    paddingVertical: space(1.75),
    paddingHorizontal: space(2),
    shadowColor: '#1B2A44',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  eyebrow: { fontSize: 11, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '600', color: colors.textFaint },
  expand: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(17,18,20,0.05)' },
  title: { fontFamily: serif, fontSize: 20, lineHeight: 26, color: colors.text, marginBottom: 6 },
  preview: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
});
