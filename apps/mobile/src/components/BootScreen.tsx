import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/** Shown while the session loads, so the auth screen never flashes. Matches the native splash. */
export function BootScreen({ overlay }: { overlay?: boolean }) {
  return (
    <View style={[s.wrap, overlay && StyleSheet.absoluteFillObject]}>
      <Image source={require('../../assets/logo-mark.png')} style={s.mark} />
      <ActivityIndicator color={colors.accent} style={s.spin} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  mark: { width: 96, height: 96, borderRadius: 22 },
  spin: { position: 'absolute', bottom: 96 },
});
