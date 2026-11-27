import { useEffect } from 'react';
import { router } from 'expo-router';
import { BootScreen } from '../src/components/BootScreen';
import { supabase } from '../src/lib/supabase';

/**
 * Deep-link landing for OAuth (trillion://auth-callback). The auth screen finishes the code exchange;
 * the root gate moves on to the chat once the session exists. Fall back to /auth if nothing happens.
 */
export default function AuthCallback() {
  useEffect(() => {
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      router.replace(data.session ? '/' : '/auth');
    }, 8000);
    return () => clearTimeout(t);
  }, []);
  return <BootScreen />;
}
