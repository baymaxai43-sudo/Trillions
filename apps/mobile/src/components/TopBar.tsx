import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Avatar } from './Avatar';
import { userInfo, useSession } from '../lib/session';
import { goTab, openConversation, Tab } from '../lib/nav';
import { colors, space } from '../theme';

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'chat', label: 'Chat' },
  { id: 'projects', label: 'Projects' },
];

const BTN = 44;

/** Round frosted button used at both ends of the bars. */
export function CircleButton({ icon, onPress, label, size = BTN, dark }: { icon: keyof typeof Ionicons.glyphMap; onPress?: () => void; label: string; size?: number; dark?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={label}
      style={({ pressed }) => [s.circle, { width: size, height: size, borderRadius: size / 2 }, dark && s.circleDark, pressed && s.pressed]}
    >
      <Ionicons name={icon} size={dark ? 20 : 21} color={dark ? '#fff' : colors.text} />
    </Pressable>
  );
}

/**
 * Hark-style top bar: a round button on the left (search on Chat, + elsewhere),
 * the frosted Home · Chat · Projects pill in the middle with a black active pill,
 * and the avatar on the right (opens Settings).
 */
export function TopBar({
  active,
  onSearch,
  onAdd,
}: {
  active: Tab;
  onSearch?: () => void;
  onAdd?: () => void;
  scrolled?: boolean;
  transparent?: boolean;
}) {
  const { session } = useSession();
  const u = userInfo(session?.user);
  const search = onSearch ?? (() => router.push({ pathname: '/chats', params: { focus: 'search' } }));
  const add = onAdd ?? (() => openConversation(null));
  return (
    <View style={s.bar}>
      {active === 'chat' ? <CircleButton icon="search" label="Search" onPress={search} /> : <CircleButton icon="add" label="New" onPress={add} />}
      <View style={s.center}>
        <View style={s.track} accessibilityRole="tablist">
          {TABS.map((t) => {
            const on = t.id === active;
            return (
              <Pressable
                key={t.id}
                onPress={() => goTab(t.id, active)}
                hitSlop={4}
                style={[s.tab, on && s.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Pressable onPress={() => router.push('/settings')} hitSlop={8} accessibilityLabel="Settings" style={({ pressed }) => pressed && s.pressed}>
        <Avatar photo={u.photo} initial={u.initial} size={BTN} />
      </Pressable>
    </View>
  );
}

/** Sub-screen header: round back button, centred title, optional right content. */
export function BackHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode; scrolled?: boolean; transparent?: boolean }) {
  return (
    <View style={s.bar}>
      <CircleButton icon="chevron-back" label="Back" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} />
      <Text style={s.title} numberOfLines={1}>{title}</Text>
      <View style={s.rightSlot}>{right}</View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space(2), gap: space(1) },
  center: { flex: 1, alignItems: 'center' },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.6)',
    maxWidth: 260,
  },
  tab: { height: 38, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center', minWidth: 62 },
  tabOn: { backgroundColor: colors.ink },
  tabText: { fontSize: 14, fontWeight: '500', color: 'rgba(17,18,20,0.55)' },
  tabTextOn: { color: '#FFFFFF', fontWeight: '600' },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  circleDark: { backgroundColor: colors.ink, borderColor: colors.ink },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.text, letterSpacing: -0.2 },
  rightSlot: { minWidth: BTN, alignItems: 'flex-end', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
});
