import { gemini } from './gemini';
import { KeyPool } from './key-pool';
import { groq, openrouter } from './openai-compatible';
import { candidates } from './router';
import { AgentMessage, ProviderAdapter, ProviderError, ProviderId, ToolCall, ToolSpec } from './types';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = { gemini, groq, openrouter };

export interface ToolTurnRequest {
  model: string; // model id or 'auto'
  messages: AgentMessage[];
  tools?: ToolSpec[];
  toolChoice?: 'auto' | 'none' | 'required';
  json?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type ToolTurnEvent =
  | { type: 'meta'; model: string; provider: ProviderId }
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'end'; text: string; toolCalls: ToolCall[]; finish: string }
  | { type: 'error'; message: string };

/**
 * One model turn with tools. Picks a tool-capable model, falls back to the next candidate only
 * if nothing has been streamed yet (never switches models mid-answer).
 */
export async function* routeToolTurn(req: ToolTurnRequest, pool: KeyPool): AsyncGenerator<ToolTurnEvent> {
  const flat = req.messages.map((m) => ({ role: m.role === 'tool' ? 'user' : m.role, content: typeof m.content === 'string' ? m.content : '' })) as any;
  const list = candidates({ model: req.model, messages: flat, required: ['tools'] }, pool).filter(
    (m) => !!ADAPTERS[m.provider].streamTools,
  );
  if (!list.length) {
    yield { type: 'error', message: 'No tool-capable model is available right now.' };
    return;
  }
  for (const model of list) {
    const key = pool.acquire(model.provider);
    if (!key) continue;
    let started = false;
    let text = '';
    let toolCalls: ToolCall[] = [];
    let finish = 'stop';
    try {
      for await (const chunk of ADAPTERS[model.provider].streamTools!(
        {
          model: model.id,
          messages: req.messages,
          tools: req.tools,
          toolChoice: req.toolChoice,
          json: req.json,
          maxTokens: req.maxTokens,
          signal: req.signal,
        },
        key,
      )) {
        if (!started) {
          started = true;
          yield { type: 'meta', model: model.id, provider: model.provider };
        }
        if (chunk.type === 'delta') {
          text += chunk.text;
          yield chunk;
        } else if (chunk.type === 'usage') yield chunk;
        else if (chunk.type === 'tool_calls') toolCalls = chunk.calls;
        else if (chunk.type === 'finish') finish = chunk.reason;
      }
      pool.reportSuccess(model.provider, key);
      yield { type: 'end', text, toolCalls, finish };
      return;
    } catch (err) {
      const pe = err instanceof ProviderError ? err : undefined;
      pool.reportFailure(model.provider, key, pe?.retryable ?? true);
      if (req.signal?.aborted) {
        yield { type: 'error', message: 'Cancelled.' };
        return;
      }
      if (text) {
        yield { type: 'error', message: 'The response was interrupted.' };
        return;
      }
      // 400s on a model (e.g. malformed tool schema) fall through to the next candidate too.
    }
  }
  yield { type: 'error', message: 'All providers are busy. Please try again shortly.' };
}
