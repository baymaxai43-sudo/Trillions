import { readSse } from './sse';
import {
  GenerateInput,
  ProviderAdapter,
  ProviderError,
  ProviderId,
  StreamChunk,
  ToolCall,
  ToolGenerateInput,
  ToolStreamChunk,
} from './types';

export interface CompatOptions {
  /** Keep tool_calls[].extra_content in history (Gemini 3 thought signatures). Others get it stripped. */
  keepExtraContent?: boolean;
  /** Leave temperature at the provider default (Gemini 3 recommends 1.0). */
  omitTemperature?: boolean;
}

const SKIP_SIGNATURE = 'skip_thought_signature_validator';

/** Prepares agent history for a provider: strips or fills provider-specific tool-call data. */
export function prepareMessages(messages: ToolGenerateInput['messages'], keepExtra: boolean): unknown[] {
  return messages.map((m) => {
    if (m.role !== 'assistant' || !('tool_calls' in m) || !m.tool_calls?.length) return m;
    const tool_calls = m.tool_calls.map((tc, i) => {
      const { extra_content, ...rest } = tc;
      if (!keepExtra) return rest;
      if (extra_content) return { ...rest, extra_content };
      // Gemini 3 validates a signature on the first call of each step; history from another
      // provider has none, so use Google's documented bypass value for that one call.
      return i === 0 ? { ...rest, extra_content: { google: { thought_signature: SKIP_SIGNATURE } } } : rest;
    });
    return { ...m, tool_calls };
  });
}

/** Groq, OpenRouter and Gemini's OpenAI-compatible endpoint all speak the chat-completions dialect. */
export function openAiCompatible(
  id: ProviderId,
  baseUrl: string,
  extraHeaders: Record<string, string> = {},
  opts: CompatOptions = {},
): ProviderAdapter {
  return {
    id,
    async *stream(input: GenerateInput, apiKey: string): AsyncGenerator<StreamChunk> {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: input.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          ...(opts.omitTemperature ? {} : { temperature: input.temperature ?? 0.7 }),
          max_tokens: input.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        }),
      });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(`${id} ${res.status}: ${await res.text()}`, res.status, retryable);
      }
      for await (const data of readSse(res)) {
        if (data === '[DONE]') return;
        const json = JSON.parse(data);
        const text = json.choices?.[0]?.delta?.content;
        if (text) yield { type: 'delta', text };
        if (json.usage) {
          yield {
            type: 'usage',
            inputTokens: json.usage.prompt_tokens ?? 0,
            outputTokens: json.usage.completion_tokens ?? 0,
          };
        }
      }
    },

    async *streamTools(input: ToolGenerateInput, apiKey: string): AsyncGenerator<ToolStreamChunk> {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: input.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...extraHeaders },
        body: JSON.stringify({
          model: input.model,
          messages: prepareMessages(input.messages, !!opts.keepExtraContent),
          ...(opts.omitTemperature ? {} : { temperature: input.temperature ?? 0.4 }),
          max_tokens: input.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
          ...(input.tools?.length ? { tools: input.tools, tool_choice: input.toolChoice ?? 'auto' } : {}),
          ...(input.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(`${id} ${res.status}: ${await res.text()}`, res.status, retryable);
      }
      yield* parseToolStream(readSse(res));
    },
  };
}

/**
 * Accumulates OpenAI streaming deltas. Tool calls arrive in fragments keyed by `index`:
 * the first fragment carries id + name, later ones append to `arguments`.
 */
export async function* parseToolStream(lines: AsyncIterable<string>): AsyncGenerator<ToolStreamChunk> {
  const calls = new Map<number, ToolCall>();
  let finish = 'stop';
  for await (const data of lines) {
    if (data === '[DONE]') break;
    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }
    const choice = json.choices?.[0];
    const delta = choice?.delta;
    if (delta?.content) yield { type: 'delta', text: delta.content };
    for (const tc of delta?.tool_calls ?? []) {
      const idx = typeof tc.index === 'number' ? tc.index : calls.size;
      const cur = calls.get(idx) ?? { id: '', name: '', arguments: '' };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name += tc.function.name;
      if (tc.function?.arguments) cur.arguments += tc.function.arguments;
      if (tc.extra_content && typeof tc.extra_content === 'object') cur.extra = { ...(cur.extra ?? {}), ...tc.extra_content };
      calls.set(idx, cur);
    }
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (json.usage) {
      yield { type: 'usage', inputTokens: json.usage.prompt_tokens ?? 0, outputTokens: json.usage.completion_tokens ?? 0 };
    }
  }
  if (calls.size) {
    const list = [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([i, c]) => ({ ...c, id: c.id || `call_${i}_${Date.now().toString(36)}` }))
      .filter((c) => c.name);
    if (list.length) yield { type: 'tool_calls', calls: list };
  }
  yield { type: 'finish', reason: finish };
}

export const groq = openAiCompatible('groq', 'https://api.groq.com/openai/v1');
export const openrouter = openAiCompatible('openrouter', 'https://openrouter.ai/api/v1', {
  'HTTP-Referer': 'https://trillion.app',
  'X-Title': 'TRILLION',
});
