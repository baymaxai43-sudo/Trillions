import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, space } from '../theme';

export function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [o]);
  return <Animated.View style={[s.block, style, { opacity: o }]} />;
}

/** Placeholder rows for lists while they load. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View style={{ paddingHorizontal: space(2), paddingTop: space(1) }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={s.row}>
          <SkeletonBlock style={{ width: `${55 + ((i * 17) % 35)}%`, height: 14 }} />
          <SkeletonBlock style={{ width: 70, height: 11, marginTop: 8 }} />
        </View>
      ))}
    </View>
  );
}

/** Placeholder for a conversation thread while messages load. */
export function ThreadSkeleton() {
  return (
    <View style={{ padding: space(2.5), gap: space(2.5) }}>
      <SkeletonBlock style={{ alignSelf: 'flex-end', width: '55%', height: 40, borderRadius: 18 }} />
      <View style={{ gap: 8 }}>
        <SkeletonBlock style={{ width: '92%', height: 13 }} />
        <SkeletonBlock style={{ width: '80%', height: 13 }} />
        <SkeletonBlock style={{ width: '60%', height: 13 }} />
      </View>
      <SkeletonBlock style={{ alignSelf: 'flex-end', width: '40%', height: 40, borderRadius: 18 }} />
    </View>
  );
}

const s = StyleSheet.create({
  block: { backgroundColor: colors.surfaceAlt, borderRadius: 6 },
  row: { paddingVertical: space(1.75), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
