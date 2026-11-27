import { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text } from 'react-native';
import { BlurView } from 'expo-blur';

/** Frosted tapback circle on the bottom-left corner of a user bubble. Pops in when it arrives live. */
export function ReactionBadge({ emoji, animate }: { emoji: string; animate?: boolean }) {
  const v = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    Animated.spring(v, { toValue: 1, friction: 4, tension: 160, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [animate, v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  return (
    <Animated.View style={[s.badge, { opacity: v, transform: [{ scale }] }]} accessibilityLabel={`TRILLION reacted ${emoji}`}>
      {Platform.OS === 'ios' && <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />}
      <Text style={s.emoji}>{emoji}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  badge: {
    position: 'absolute',
    left: -10,
    bottom: -12,
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#1B2A44',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  emoji: { fontSize: 15, lineHeight: 19, textAlign: 'center' },
});
