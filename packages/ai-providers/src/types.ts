import type { ChatMessage } from '@trillion/shared';

export type Capability = 'chat' | 'stream' | 'tools' | 'json' | 'vision' | 'long_context';
export type ProviderId = 'gemini' | 'groq' | 'openrouter';

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  label: string;
  capabilities: Capability[];
  contextTokens: number;
  tier: 'fast' | 'balanced' | 'smart';
  enabled: boolean;
}

export interface GenerateInput {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type StreamChunk =
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number };

export interface ProviderAdapter {
  id: ProviderId;
  stream(input: GenerateInput, apiKey: string): AsyncGenerator<StreamChunk>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}
