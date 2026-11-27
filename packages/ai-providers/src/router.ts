import type { ChatMessage, StreamEvent } from '@trillion/shared';
import { gemini } from './gemini';
import { KeyPool } from './key-pool';
import { groq, openrouter } from './openai-compatible';
import { findModel, MODEL_REGISTRY } from './registry';
import { Capability, ModelInfo, ProviderAdapter, ProviderError, ProviderId } from './types';

const ADAPTERS: Record<ProviderId, ProviderAdapter> = { gemini, groq, openrouter };

export interface RouteRequest {
  model: string; // a model id or 'auto'
  messages: ChatMessage[];
  required?: Capability[];
  signal?: AbortSignal;
}

/** Picks candidates in order: explicit model first, else fast-for-short / smart-for-long. */
export function candidates(req: RouteRequest, pool: KeyPool): ModelInfo[] {
  const need = new Set<Capability>(['chat', 'stream', ...(req.required ?? [])]);
  const usable = MODEL_REGISTRY.filter(
    (m) => m.enabled && pool.has(m.provider) && [...need].every((c) => m.capabilities.includes(c)),
  );
  if (req.model !== 'auto') {
    const chosen = findModel(req.model);
    // Fallback only to models with the same required capabilities.
    return chosen ? [chosen, ...usable.filter((m) => m.id !== chosen.id)] : usable;
  }
  const chars = req.messages.reduce((n, m) => n + m.content.length, 0);
  const order: ModelInfo['tier'][] = chars > 6000 ? ['smart', 'balanced', 'fast'] : ['fast', 'balanced', 'smart'];
  return [...usable].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
}

export async function* routeStream(req: RouteRequest, pool: KeyPool): AsyncGenerator<StreamEvent> {
  const list = candidates(req, pool);
  if (!list.length) {
    yield { type: 'error', message: 'No enabled model is available right now.' };
    return;
  }
  for (const model of list) {
    const key = pool.acquire(model.provider);
    if (!key) continue;
    let started = false;
    try {
      for await (const chunk of ADAPTERS[model.provider].stream(
        { model: model.id, messages: req.messages, signal: req.signal },
        key,
      )) {
        if (!started) {
          started = true;
          yield { type: 'meta', conversationId: '', model: model.id, provider: model.provider };
        }
        yield chunk;
      }
      pool.reportSuccess(model.provider, key);
      yield { type: 'done' };
      return;
    } catch (err) {
      const pe = err instanceof ProviderError ? err : undefined;
      pool.reportFailure(model.provider, key, pe?.retryable ?? true);
      // Never switch models mid-answer; only fall back if nothing was streamed yet.
      if (started || req.signal?.aborted) {
        yield { type: 'error', message: 'The response was interrupted.' };
        return;
      }
    }
  }
  yield { type: 'error', message: 'All providers are busy. Please try again shortly.' };
}
