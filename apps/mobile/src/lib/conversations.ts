import { supabase } from './supabase';
import type { ChatItem } from './agent';
import { uid } from './agent';

export type Conversation = { id: string; title: string | null; updated_at: string; created_at: string };

/** Recent conversations for the signed-in user (RLS scopes to owner). */
export async function listConversations(limit = 100): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, updated_at, created_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Conversation[];
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const { data } = await supabase.from('conversations').select('id, title, updated_at, created_at').eq('id', id).maybeSingle();
  return (data as Conversation) ?? null;
}

/** User and assistant messages of a conversation, oldest first. */
export async function loadMessages(conversationId: string): Promise<ChatItem[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((m: any) => m.content)
    .map((m: any) => ({ key: String(m.id ?? uid()), kind: m.role === 'user' ? 'user' : 'assistant', content: String(m.content) }) as ChatItem);
}

export async function deleteConversation(id: string) {
  const { error } = await supabase.from('conversations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'Just now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 2) return 'Yesterday';
  if (d < 7) return `${Math.floor(d)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Names an untitled conversation after its first message. Never throws. */
export async function ensureTitle(id: string, firstMessage: string) {
  try {
    await supabase.from('conversations').update({ title: firstMessage.trim().slice(0, 60) }).eq('id', id).is('title', null);
  } catch {}
}

/** Number of saved memories (null if unavailable). */
export async function memoryCount(): Promise<number | null> {
  const { count, error } = await supabase.from('memories').select('id', { count: 'exact', head: true });
  return error ? null : count ?? 0;
}

export async function latestMemories(limit = 3): Promise<string[]> {
  const { data } = await supabase.from('memories').select('content').order('created_at', { ascending: false }).limit(limit);
  return (data ?? []).map((m: any) => String(m.content));
}
