import { ReactNode } from 'react';
import { ImageBackground, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, cardShadow } from '../theme';

const SKY = require('../../assets/sky.jpg');

/** Frosted white card: light blur, white veil, hairline white edge. */
export function Glass({ children, style, radius = 22, intensity = 30, padded = true, strong }: { children?: ReactNode; style?: StyleProp<ViewStyle>; radius?: number; intensity?: number; padded?: boolean; strong?: boolean }) {
  return (
    <View style={[s.shadow, { borderRadius: radius }, style]}>
      <View style={[s.clip, { borderRadius: radius }]}>
        {Platform.OS === 'ios' && <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: strong ? colors.cardStrong : colors.card }]} />
        <View style={padded ? s.pad : undefined}>{children}</View>
      </View>
    </View>
  );
}

/** The sky backdrop every screen sits on. Opaque, so stacked screens never show through. */
export function GlassBackdrop({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ImageBackground source={SKY} resizeMode="cover" style={[{ flex: 1, backgroundColor: colors.sky }, style]}>
      {children}
    </ImageBackground>
  );
}
export const Sky = GlassBackdrop;

const s = StyleSheet.create({
  shadow: { backgroundColor: 'transparent', ...cardShadow },
  clip: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.glassLine },
  pad: { padding: 16 },
});

export const glassText = { muted: colors.textMuted };
