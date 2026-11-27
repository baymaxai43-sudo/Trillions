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
  /** OpenAI-style tool calling with streaming. Optional: adapters without it are skipped for agent runs. */
  streamTools?(input: ToolGenerateInput, apiKey: string): AsyncGenerator<ToolStreamChunk>;
}

// ---- Tool calling (OpenAI chat-completions dialect) -------------------------

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON string as produced by the model; parse defensively. */
  arguments: string;
}

export type AgentMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolGenerateInput {
  model: string;
  messages: AgentMessage[];
  tools?: ToolSpec[];
  toolChoice?: 'auto' | 'none' | 'required';
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
}

export type ToolStreamChunk =
  | StreamChunk
  | { type: 'tool_calls'; calls: ToolCall[] }
  | { type: 'finish'; reason: string };

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}
