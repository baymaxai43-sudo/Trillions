import { ModelInfo } from './types';

/** Only enabled, tested models are shown to users. Update after each validation run. */
export const MODEL_REGISTRY: ModelInfo[] = [
  { id: 'gemini-2.5-flash', provider: 'gemini', label: 'Gemini Flash', capabilities: ['chat', 'stream', 'json', 'vision', 'long_context'], contextTokens: 1_000_000, tier: 'balanced', enabled: true },
  { id: 'gemini-2.5-pro', provider: 'gemini', label: 'Gemini Pro', capabilities: ['chat', 'stream', 'json', 'vision', 'long_context'], contextTokens: 1_000_000, tier: 'smart', enabled: true },
  { id: 'openai/gpt-oss-20b', provider: 'groq', label: 'GPT-OSS 20B (Groq)', capabilities: ['chat', 'stream', 'json', 'tools'], contextTokens: 128_000, tier: 'fast', enabled: true },
  { id: 'openai/gpt-oss-120b', provider: 'openrouter', label: 'GPT-OSS 120B', capabilities: ['chat', 'stream', 'json', 'tools'], contextTokens: 128_000, tier: 'balanced', enabled: true },
];

export function findModel(id: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id && m.enabled);
}
