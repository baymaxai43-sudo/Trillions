import { Injectable } from '@nestjs/common';
import { stripReactionMarkers } from '@trillion/shared';
import type { ChatRequest, StreamEvent } from '@trillion/shared';
import { KeyPool, routeStream } from '@trillion/ai-providers';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ChatService {
  private pool = KeyPool.fromEnv();

  constructor(private readonly supabase: SupabaseService) {}

  async *stream(
    user: { id: string; token: string },
    req: ChatRequest,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const db = this.supabase.forUser(user.token);

    let conversationId = req.conversationId;
    if (!conversationId) {
      const title = req.messages[req.messages.length - 1].content.slice(0, 60);
      const { data, error } = await db
        .from('conversations')
        .insert({ owner_id: user.id, project_id: req.projectId ?? null, title })
        .select('id')
        .single();
      if (error) {
        yield { type: 'error', message: 'Could not start the conversation.' };
        return;
      }
      conversationId = data.id as string;
    }

    const last = req.messages[req.messages.length - 1];
    await db.from('messages').insert({ conversation_id: conversationId, owner_id: user.id, role: last.role, content: last.content });

    let text = '';
    let model = '';
    let provider = '';
    let usage = { inputTokens: 0, outputTokens: 0 };

    for await (const ev of routeStream({ model: req.model, messages: req.messages.map((m) => (m.role === 'assistant' ? { ...m, content: stripReactionMarkers(m.content) } : m)), signal }, this.pool)) {
      if (ev.type === 'meta') {
        model = ev.model;
        provider = ev.provider;
        yield { ...ev, conversationId };
        continue;
      }
      if (ev.type === 'delta') text += ev.text;
      if (ev.type === 'usage') usage = ev;
      yield ev;
    }

    if (text) {
      await db.from('messages').insert({
        conversation_id: conversationId,
        owner_id: user.id,
        role: 'assistant',
        content: text,
        model,
        provider,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      });
    }
  }
}
