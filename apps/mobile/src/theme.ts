export const colors = {
  bg: '#FFFFFF',
  surface: '#F6FBF8',
  surfaceAlt: '#ECF7F1',
  border: '#DCEFE4',
  brandDeep: '#062A1E', // logo tile
  brandMid: '#0A4A33',
  primary: '#10B981',
  primaryDark: '#047857',
  primarySoft: '#D1FAE5',
  text: '#0B1F17',
  textMuted: '#5B6B63',
  danger: '#DC2626',
} as const;

export const radius = { card: 16, bubble: 22, pill: 999 } as const;
export const space = (n: number) => n * 8;
export const type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  body: { fontSize: 17, lineHeight: 24 },
  secondary: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 13, lineHeight: 18 },
};
