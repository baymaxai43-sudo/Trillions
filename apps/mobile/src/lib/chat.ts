import { openSse } from './sse';

export type Msg = { role: 'user' | 'assistant'; content: string };

/** Streams a plain chat reply over SSE. Returns a stop() fn. */
export async function streamChat(
  messages: Msg[],
  opts: { conversationId?: string; model?: string },
  onEvent: (ev: any) => void,
): Promise<() => void> {
  return openSse(
    'POST',
    '/v1/chat/stream',
    { messages, conversationId: opts.conversationId, model: opts.model ?? 'auto' },
    onEvent,
    (reason) => reason === 'error' && onEvent({ type: 'error', message: 'Connection lost.' }),
  );
}
