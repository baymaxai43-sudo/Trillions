import Constants from 'expo-constants';
import { supabase } from './supabase';

export const API = (Constants.expoConfig?.extra as { apiUrl: string }).apiUrl;

export async function authHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return `Bearer ${data.session?.access_token ?? ''}`;
}

/** JSON fetch against the TRILLION API with the user's Supabase token. Throws with the server's message. */
export async function apiFetch<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: await authHeader(), ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(json?.message ? String(json.message) : `Request failed (${res.status})`);
  return json as T;
}
