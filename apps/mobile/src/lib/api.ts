import Constants from 'expo-constants';
import { supabase } from './supabase';

export const API = (Constants.expoConfig?.extra as { apiUrl: string }).apiUrl;

export async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return `Bearer ${data.session?.access_token ?? ''}`;
}

/** JSON fetch against the TRILLION API with the user's Supabase token. Throws with the server's message. */
export async function apiFetch<T = any>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), init.timeoutMs ?? 75_000);
  try {
    const res = await fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: await authHeader(), ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: ac.signal,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const m = json?.message;
      throw new Error(m ? (Array.isArray(m) ? m.join(', ') : String(m)) : `Request failed (${res.status})`);
    }
    return json as T;
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new Error('TRILLION took too long to respond.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
