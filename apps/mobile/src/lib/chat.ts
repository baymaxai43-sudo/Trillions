import { openSse, SseHandlers } from './sse';

export type Msg = { role: 'user' | 'assistant'; content: string };

/** Streams a plain (non-agent) chat reply over SSE. Returns stop(). */
export function streamChat(
  messages: Msg[],
  opts: { conversationId?: string; model?: string },
  handlers: SseHandlers,
): () => void {
  return openSse('POST', '/v1/chat/stream', { messages: messages.slice(-40), conversationId: opts.conversationId, model: opts.model ?? 'auto' }, handlers);
}
