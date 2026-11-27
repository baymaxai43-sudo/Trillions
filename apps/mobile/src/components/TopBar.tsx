import { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Avatar } from './Avatar';
import { userInfo, useSession } from '../lib/session';
import { goTab, Tab } from '../lib/nav';
import { colors, space } from '../theme';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'home', label: 'Home' },
  { id: 'projects', label: 'Projects' },
];

function BarShell({ children, scrolled, transparent }: { children: ReactNode; scrolled?: boolean; transparent?: boolean }) {
  if (scrolled) {
    return (
      <View style={[s.bar, s.barScrolled]}>
        <BlurView intensity={50} tint="light" experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.72)' }]} />
        {children}
      </View>
    );
  }
  return <View style={[s.bar, transparent ? s.barClear : s.barPlain]}>{children}</View>;
}

/** Top bar: Home icon, Chat · Home · Projects switcher, search and avatar (opens Settings). */
export function TopBar({
  active,
  onSearch,
  scrolled,
  transparent,
}: {
  active: Tab;
  onSearch?: () => void;
  scrolled?: boolean;
  transparent?: boolean;
}) {
  const { session } = useSession();
  const u = userInfo(session?.user);
  return (
    <BarShell scrolled={scrolled} transparent={transparent}>
      <Pressable onPress={() => goTab('home', active)} hitSlop={10} style={({ pressed }) => [s.icon, pressed && s.pressed]} accessibilityLabel="Home">
        <Ionicons name={active === 'home' ? 'home' : 'home-outline'} size={20} color={colors.text} />
      </Pressable>
      <View style={s.tabs} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = t.id === active;
          return (
            <Pressable key={t.id} onPress={() => goTab(t.id, active)} hitSlop={6} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Text style={[s.tabText, on && s.tabTextOn]}>{t.label}</Text>
              <View style={[s.tabMark, on && s.tabMarkOn]} />
            </Pressable>
          );
        })}
      </View>
      <View style={s.right}>
        <Pressable onPress={onSearch ?? (() => router.push({ pathname: '/chats', params: { focus: 'search' } }))} hitSlop={10} style={({ pressed }) => [s.icon, pressed && s.pressed]} accessibilityLabel="Search">
          <Ionicons name="search-outline" size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => router.push('/settings')} hitSlop={10} accessibilityLabel="Settings">
          <Avatar photo={u.photo} initial={u.initial} size={30} />
        </Pressable>
      </View>
    </BarShell>
  );
}

/** Header for sub-screens: back chevron + title (+ optional right content). */
export function BackHeader({ title, onBack, right, scrolled, transparent }: { title: string; onBack?: () => void; right?: ReactNode; scrolled?: boolean; transparent?: boolean }) {
  return (
    <BarShell scrolled={scrolled} transparent={transparent}>
      <Pressable
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        hitSlop={10}
        style={({ pressed }) => [s.icon, pressed && s.pressed]}
        accessibilityLabel="Back"
      >
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <Text style={s.title} numberOfLines={1}>{title}</Text>
      <View style={[s.right, { minWidth: 36, justifyContent: 'flex-end' }]}>{right}</View>
    </BarShell>
  );
}

const s = StyleSheet.create({
  bar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(1.25) },
  barPlain: { backgroundColor: colors.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  barClear: { backgroundColor: 'transparent' },
  barScrolled: { overflow: 'hidden', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '500', color: colors.text, marginHorizontal: space(1) },
  tabs: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: space(2) },
  tab: { alignItems: 'center', paddingTop: 4 },
  tabText: { fontSize: 14, fontWeight: '400', color: colors.textMuted },
  tabTextOn: { color: colors.text, fontWeight: '600' },
  tabMark: { marginTop: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  tabMarkOn: { backgroundColor: colors.accent },
  right: { flexDirection: 'row', alignItems: 'center', gap: space(0.75) },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  pressed: { backgroundColor: 'rgba(11,31,23,0.05)' },
});
