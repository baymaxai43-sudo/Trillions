import { readSse } from './sse';
import { GenerateInput, ProviderAdapter, ProviderError, StreamChunk } from './types';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export const gemini: ProviderAdapter = {
  id: 'gemini',
  async *stream(input: GenerateInput, apiKey: string): AsyncGenerator<StreamChunk> {
    const system = input.messages.filter((m) => m.role === 'system').map((m) => m.content);
    const contents = input.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const res = await fetch(`${BASE}/models/${input.model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      signal: input.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        ...(system.length ? { systemInstruction: { parts: [{ text: system.join('\n\n') }] } } : {}),
        generationConfig: { temperature: input.temperature ?? 0.7, maxOutputTokens: input.maxTokens },
      }),
    });
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      throw new ProviderError(`gemini ${res.status}: ${await res.text()}`, res.status, retryable);
    }
    let usage: StreamChunk | undefined;
    for await (const data of readSse(res)) {
      const json = JSON.parse(data);
      const text = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('');
      if (text) yield { type: 'delta', text };
      if (json.usageMetadata) {
        usage = {
          type: 'usage',
          inputTokens: json.usageMetadata.promptTokenCount ?? 0,
          outputTokens: json.usageMetadata.candidatesTokenCount ?? 0,
        };
      }
    }
    if (usage) yield usage;
  },
};
