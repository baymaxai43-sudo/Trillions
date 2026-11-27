import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, Stack, useSegments } from 'expo-router';
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
    if (!target) return;
    if (router.canDismiss()) router.dismissAll();
    router.replace(target);
  }, [target]);

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
