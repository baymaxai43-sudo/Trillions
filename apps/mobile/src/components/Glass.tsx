import { ReactNode } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme';

/** Translucent white card with a light blur, 1px white/60% border and a soft shadow. */
export function Glass({ children, style, radius = 20, intensity = 40, padded = true }: { children?: ReactNode; style?: StyleProp<ViewStyle>; radius?: number; intensity?: number; padded?: boolean }) {
  return (
    <View style={[s.shadow, { borderRadius: radius }, style]}>
      <View style={[s.clip, { borderRadius: radius }]}>
        <BlurView
          intensity={intensity}
          tint="light"
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, s.veil]} />
        <View style={padded ? s.pad : undefined}>{children}</View>
      </View>
    </View>
  );
}

/** Soft emerald-to-white backdrop for glass surfaces. */
export function GlassBackdrop({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={['#D9F5E8', '#EEFAF4', '#FFFFFF']} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={[{ flex: 1 }, style]}>
      {children}
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  shadow: {
    backgroundColor: 'transparent',
    shadowColor: '#0B3B2A',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  clip: { overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.55)' : 'transparent' },
  veil: { backgroundColor: 'rgba(255,255,255,0.55)' },
  pad: { padding: 16 },
});

export const glassText = { muted: colors.textMuted };
