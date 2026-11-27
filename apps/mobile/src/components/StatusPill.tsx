import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { space } from '../theme';

/** Hark-style live status: a frosted pill with grey text saying what the agent is doing right now. */
export function StatusPill({ text }: { text?: string | null }) {
  const label = text?.trim() || 'Thinking';
  const [shown, setShown] = useState(label);
  const pulse = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Cross-fade when the status changes.
  useEffect(() => {
    if (label === shown) return;
    let alive = true;
    Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      if (!alive) return;
      setShown(label);
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
    return () => {
      alive = false;
    };
  }, [label, shown, fade]);

  return (
    <View style={s.row} accessibilityRole="text" accessibilityLabel={label} accessibilityLiveRegion="polite">
      <View style={s.pill}>
        <Animated.Text style={[s.text, { opacity: Animated.multiply(pulse, fade) }]} numberOfLines={1}>
          {shown}
        </Animated.Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'flex-start', marginVertical: space(0.75), paddingRight: '12%' },
  pill: {
    flexShrink: 1,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  text: { fontSize: 14, lineHeight: 19, color: 'rgba(17,18,20,0.5)', fontWeight: '500' },
});
