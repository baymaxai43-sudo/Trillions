import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

type Ctx = { session: Session | null; loading: boolean };
const SessionContext = createContext<Ctx>({ session: null, loading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Ctx>({ session: null, loading: true });
  useEffect(() => {
    let alive = true;
    supabase.auth
      .getSession()
      .then(({ data }) => alive && setState({ session: data.session, loading: false }))
      .catch(() => alive && setState({ session: null, loading: false }));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setState({ session, loading: false });
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

/** Display info for the signed-in user. */
export function userInfo(user: User | null | undefined) {
  const meta = (user?.user_metadata ?? {}) as Record<string, any>;
  const email = user?.email ?? '';
  const name: string = meta.display_name || meta.full_name || meta.name || (email ? email.split('@')[0] : '');
  const photo: string | null = meta.avatar_url || meta.picture || null;
  const provider: string = (user?.app_metadata as any)?.provider ?? 'email';
  const providers: string[] = (user?.app_metadata as any)?.providers ?? [provider];
  return { name, firstName: name.split(/\s+/)[0] ?? '', email, photo, provider, providers, initial: (name || email || 'T').charAt(0).toUpperCase() };
}
