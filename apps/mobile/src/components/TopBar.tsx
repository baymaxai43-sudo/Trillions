import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, space, type } from '../theme';

export function TopBar({ title, onHome, onSearch, onProfile }: { title: string; onHome?: () => void; onSearch?: () => void; onProfile?: () => void }) {
  return (
    <View style={s.bar}>
      <Pressable onPress={onHome} hitSlop={12} style={s.icon}><Text style={s.glyph}>⌂</Text></Pressable>
      <View style={s.center}>
        <Image source={require('../../assets/logo-mark.png')} style={s.logo} />
        <Text style={s.title}>{title}</Text>
      </View>
      <View style={s.right}>
        <Pressable onPress={onSearch} hitSlop={12} style={s.icon}><Text style={s.glyph}>⌕</Text></Pressable>
        <Pressable onPress={onProfile} hitSlop={12} style={[s.icon, s.avatar]}><Text style={s.avatarText}>T</Text></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(2), backgroundColor: colors.bg },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  logo: { width: 20, height: 20, borderRadius: 5 },
  title: { ...type.secondary, fontWeight: '600', color: colors.text },
  right: { flexDirection: 'row', gap: space(1) },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  glyph: { fontSize: 22, color: colors.text },
  avatar: { backgroundColor: colors.primarySoft },
  avatarText: { color: colors.primaryDark, fontWeight: '700' },
});
