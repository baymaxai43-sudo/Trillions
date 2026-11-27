import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function Avatar({ photo, initial, size = 32 }: { photo?: string | null; initial: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size, borderRadius: size / 2 };
  if (photo && !failed) return <Image source={{ uri: photo }} style={[s.img, dim]} onError={() => setFailed(true)} />;
  return (
    <View style={[s.fallback, dim]}>
      <Text style={[s.initial, { fontSize: Math.round(size * 0.42) }]}>{initial}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  img: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  fallback: { backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#FFFFFF', fontWeight: '700' },
});
