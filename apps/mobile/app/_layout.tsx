import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useRootNavigationState, useSegments } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BootScreen } from '../src/components/BootScreen';
import { SessionProvider, useSession } from '../src/lib/session';
import { wakeServer } from '../src/lib/sse';
import { hasOnboarded, onOnboarded } from '../src/lib/storage';
import { colors } from '../src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const PUBLIC = new Set(['auth', 'auth-callback']);
type Onboard = 'unknown' | 'yes' | 'no';

function Gate() {
  const { session, loading } = useSession();
  const segments = useSegments() as string[];
  const navReady = !!useRootNavigationState()?.key;
  const first = segments[0] ?? '';
  const onPublic = PUBLIC.has(first);
  const onWelcome = first === 'welcome';
  const userId = session?.user?.id;
  const [onboard, setOnboard] = useState<Onboard>('unknown');

  useEffect(() => {
    if (!userId) return setOnboard('unknown');
    let alive = true;
    setOnboard('unknown');
    hasOnboarded(userId).then((v) => alive && setOnboard(v ? 'yes' : 'no'));
    const off = onOnboarded((id) => id === userId && setOnboard('yes'));
    return () => {
      alive = false;
      off();
    };
  }, [userId]);

  // Where should we be right now? null = stay.
  const target: '/auth' | '/welcome' | '/' | null = loading
    ? null
    : !session
      ? onPublic
        ? null
        : '/auth'
      : onboard === 'unknown'
        ? null
        : onboard === 'no'
          ? onWelcome
            ? null
            : '/welcome'
          : onPublic || onWelcome
            ? '/'
            : null;
  const waiting = loading || (!!session && onboard === 'unknown' && first !== 'auth-callback');

  useEffect(() => {
    if (!loading && !(session && onboard === 'unknown')) SplashScreen.hideAsync().catch(() => {});
  }, [loading, session, onboard]);

  useEffect(() => {
    if (!target || !navReady) return;
    const t = setTimeout(() => {
      try {
        if (router.canDismiss()) router.dismissAll();
        router.replace(target);
      } catch (e) {
        console.warn('nav', e);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [target, navReady]);

  // Never leave the splash up forever.
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade_from_bottom' }} />
      {(waiting || !!target) && first !== 'auth-callback' && <BootScreen overlay />}
    </View>
  );
}

export default function Root() {
  // Free hosting sleeps: start waking the API as soon as the app opens.
  useEffect(() => {
    wakeServer().catch(() => {});
  }, []);
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

/** Shows the error instead of a blank screen if anything crashes. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 20, fontWeight: '600', color: '#0B1F17' }}>Something went wrong</Text>
      <Text selectable style={{ marginTop: 8, color: '#5B6B64' }}>{String(error?.message ?? error)}</Text>
      <Text onPress={() => retry()} style={{ marginTop: 20, color: '#047857', fontWeight: '600' }}>Try again</Text>
    </ScrollView>
  );
}
