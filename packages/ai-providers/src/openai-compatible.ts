import { readSse } from './sse';
import { GenerateInput, ProviderAdapter, ProviderError, ProviderId, StreamChunk } from './types';

/** Groq and OpenRouter both speak the OpenAI chat-completions dialect. */
export function openAiCompatible(
  id: ProviderId,
  baseUrl: string,
  extraHeaders: Record<string, string> = {},
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
          temperature: input.temperature ?? 0.7,
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
  };
}

export const groq = openAiCompatible('groq', 'https://api.groq.com/openai/v1');
export const openrouter = openAiCompatible('openrouter', 'https://openrouter.ai/api/v1', {
  'HTTP-Referer': 'https://trillion.app',
  'X-Title': 'TRILLION',
});
