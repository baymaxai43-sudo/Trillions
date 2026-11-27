import { useRef, useState } from 'react';
import { Dimensions, Image, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Glass, GlassBackdrop } from '../src/components/Glass';
import { userInfo, useSession } from '../src/lib/session';
import { markOnboarded } from '../src/lib/storage';
import { colors, radius, space, type } from '../src/theme';

const SLIDES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  { icon: 'chatbubble-ellipses-outline', title: 'Ask anything', body: 'Chat with TRILLION to think, write, and research. Replies keep coming even if you leave the app.' },
  { icon: 'sparkles-outline', title: 'Hand off tasks', body: 'Turn on Agent and TRILLION plans the work, uses tools, and asks you before anything risky.' },
  { icon: 'folder-open-outline', title: 'Stay organized', body: 'Group chats into Projects, glance at Home, and connect accounts when you\u2019re ready.' },
];

/** Three-slide welcome after the first sign-in. The root gate moves on once it's marked done. */
export default function Welcome() {
  const { session } = useSession();
  const me = userInfo(session?.user);
  const [page, setPage] = useState(0);
  const ref = useRef<ScrollView>(null);
  const width = Dimensions.get('window').width;

  const done = () => session?.user?.id && markOnboarded(session.user.id);
  const next = () => (page < SLIDES.length - 1 ? ref.current?.scrollTo({ x: (page + 1) * width, animated: true }) : done());
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <GlassBackdrop>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.top}>
          <Image source={require('../assets/logo-mark.png')} style={s.mark} />
          <Pressable onPress={done} hitSlop={10}>
            <Text style={s.skip}>Skip</Text>
          </Pressable>
        </View>
        <Text style={s.hello}>Welcome{me.firstName ? `, ${me.firstName}` : ''}</Text>
        <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={s.pager}>
          {SLIDES.map((sl) => (
            <View key={sl.title} style={[s.slide, { width }]}>
              <Glass radius={24} style={s.card}>
                <View style={s.iconWrap}><Ionicons name={sl.icon} size={26} color={colors.accentDark} /></View>
                <Text style={s.title}>{sl.title}</Text>
                <Text style={s.body}>{sl.body}</Text>
              </Glass>
            </View>
          ))}
        </ScrollView>
        <View style={s.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[s.dot, i === page && s.dotOn]} />
          ))}
        </View>
        <Pressable onPress={next} style={({ pressed }) => [s.primary, pressed && { opacity: 0.7 }]}>
          <Text style={s.primaryText}>{page < SLIDES.length - 1 ? 'Next' : 'Get started'}</Text>
        </Pressable>
      </SafeAreaView>
    </GlassBackdrop>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space(3), paddingTop: space(2) },
  mark: { width: 36, height: 36, borderRadius: 9 },
  skip: { ...type.secondary, color: colors.textMuted },
  hello: { ...type.greeting, color: colors.text, paddingHorizontal: space(3), marginTop: space(4) },
  pager: { flexGrow: 0, marginTop: space(3) },
  slide: { paddingHorizontal: space(3) },
  card: { minHeight: 240 },
  iconWrap: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(236,253,245,0.9)', borderWidth: 1, borderColor: '#BFEBD8', alignItems: 'center', justifyContent: 'center', marginBottom: space(2.5) },
  title: { ...type.display, color: colors.text },
  body: { ...type.body, color: colors.textMuted, marginTop: space(1) },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: space(3) },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(11,31,23,0.15)' },
  dotOn: { width: 18, backgroundColor: colors.accentDark },
  primary: { marginTop: 'auto', marginHorizontal: space(3), marginBottom: space(2), height: 50, borderRadius: radius.md, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...type.body, color: '#fff', fontWeight: '600' },
});
