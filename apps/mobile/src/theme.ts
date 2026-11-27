import { Platform } from 'react-native';

/** Sky + glass (Hark-style): soft blue sky backdrop, translucent white cards, ink-black accents. */
export const colors = {
  bg: '#FFFFFF',
  sky: '#A9C0DD',
  card: 'rgba(255,255,255,0.74)',
  cardStrong: 'rgba(255,255,255,0.92)',
  glassLine: 'rgba(255,255,255,0.75)',
  surface: 'rgba(255,255,255,0.55)',
  surfaceAlt: 'rgba(255,255,255,0.4)',
  border: 'rgba(17,18,20,0.08)',
  borderStrong: 'rgba(17,18,20,0.14)',
  text: '#111214',
  textMuted: '#4F5866',
  textFaint: '#7D8796',
  ink: '#151618',
  accent: '#151618',
  accentDark: '#151618',
  accentSoft: 'rgba(255,255,255,0.6)',
  link: '#1E5BD8',
  success: '#22A05B',
  danger: '#D92D20',
  dangerSoft: 'rgba(254,242,242,0.9)',
  scrim: 'rgba(17,24,39,0.32)',
  // Legacy aliases (kept so older screens keep compiling).
  primary: '#151618',
  primaryDark: '#151618',
  primarySoft: 'rgba(255,255,255,0.6)',
  brandDeep: '#062A1E',
} as const;

export const radius = { sm: 12, md: 16, lg: 22, xl: 26, card: 22, bubble: 22, pill: 999 } as const;
export const space = (n: number) => n * 8;

export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const type = {
  greeting: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.6 },
  display: { fontSize: 26, lineHeight: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23 },
  secondary: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 13, lineHeight: 18 },
  micro: { fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
};

export const sheetShadow = {
  shadowColor: '#0B1F17',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: -4 },
  elevation: 12,
} as const;

export const cardShadow = {
  shadowColor: '#1B2A44',
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 6 },
  elevation: 0,
} as const;
