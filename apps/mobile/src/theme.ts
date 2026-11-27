import { Platform } from 'react-native';

/** White + light emerald. Restrained: thin borders, no heavy tints. */
export const colors = {
  bg: '#FFFFFF',
  surface: '#F6FAF8',
  surfaceAlt: '#EEF5F1',
  border: '#E6EEEA',
  borderStrong: '#D5E2DB',
  text: '#0B1F17',
  textMuted: '#5B6B64',
  textFaint: '#8A9A93',
  accent: '#10B981',
  accentDark: '#047857',
  accentSoft: '#ECFDF5',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  scrim: 'rgba(11,31,23,0.32)',
  // Legacy aliases (kept so older screens keep compiling).
  primary: '#10B981',
  primaryDark: '#047857',
  primarySoft: '#ECFDF5',
  brandDeep: '#062A1E',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 24, card: 14, bubble: 20, pill: 999 } as const;
export const space = (n: number) => n * 8;

export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const type = {
  greeting: { fontSize: 28, lineHeight: 34, fontWeight: '600' as const, letterSpacing: -0.3 },
  display: { fontSize: 24, lineHeight: 30, fontWeight: '600' as const, letterSpacing: -0.2 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
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
