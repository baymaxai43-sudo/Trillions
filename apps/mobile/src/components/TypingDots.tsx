import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, space, type } from '../theme';

/** Three softly pulsing dots, with an optional status line (e.g. "Waking up TRILLION…"). */
export function TypingDots({ label }: { label?: string | null }) {
  const vals = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const anims = vals.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 360, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 360, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [vals]);
  return (
    <View style={s.row} accessibilityLabel={label ?? 'TRILLION is typing'}>
      <View style={s.dots}>
        {vals.map((v, i) => (
          <Animated.View key={i} style={[s.dot, { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0.3, 1], outputRange: [0.85, 1.1] }) }] }]} />
        ))}
      </View>
      {!!label && <Text style={s.label}>{label}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(1.25), paddingVertical: space(1) },
  dots: { flexDirection: 'row', gap: 5, height: 18, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  label: { ...type.caption, color: colors.textMuted },
});
