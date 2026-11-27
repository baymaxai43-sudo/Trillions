import Constants from 'expo-constants';
import { supabase } from './supabase';

const API = (Constants.expoConfig?.extra as { apiUrl: string }).apiUrl;

export type Msg = { role: 'user' | 'assistant'; content: string };

/** Streams a reply over SSE using XHR progress (works in React Native). Returns a stop() fn. */
export async function streamChat(
  messages: Msg[],
  opts: { conversationId?: string; model?: string },
  onEvent: (ev: any) => void,
): Promise<() => void> {
  const { data } = await supabase.auth.getSession();
  const xhr = new XMLHttpRequest();
  let seen = 0;
  xhr.open('POST', `${API}/v1/chat/stream`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Authorization', `Bearer ${data.session?.access_token ?? ''}`);
  xhr.onprogress = () => {
    const chunk = xhr.responseText.slice(seen);
    seen = xhr.responseText.length;
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch {}
      }
    }
  };
  xhr.onerror = () => onEvent({ type: 'error', message: 'Connection lost.' });
  xhr.send(JSON.stringify({ messages, conversationId: opts.conversationId, model: opts.model ?? 'auto' }));
  return () => xhr.abort();
}
