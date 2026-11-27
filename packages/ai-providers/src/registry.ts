import { ModelInfo } from './types';

/** Only enabled, tested models are shown to users. Update after each validation run. */
const proOn = (process.env.GEMINI_PRO_ENABLED ?? '').toLowerCase() === 'true';

export const MODEL_REGISTRY: ModelInfo[] = [
  // Gemini 3.1 (used only when GEMINI_API_KEYS is set). Flash-Lite is on the free tier; Pro needs a billed project.
  { id: 'gemini-3.1-flash-lite', provider: 'gemini', label: 'Gemini 3.1 Flash-Lite', capabilities: ['chat', 'stream', 'json', 'tools', 'vision', 'long_context'], contextTokens: 1_000_000, tier: 'fast', enabled: true },
  { id: 'gemini-3.1-pro-preview', provider: 'gemini', label: 'Gemini 3.1 Pro', capabilities: ['chat', 'stream', 'json', 'tools', 'vision', 'long_context'], contextTokens: 1_000_000, tier: 'smart', enabled: proOn },
  { id: 'gemini-2.5-flash', provider: 'gemini', label: 'Gemini Flash', capabilities: ['chat', 'stream', 'json', 'vision', 'long_context'], contextTokens: 1_000_000, tier: 'balanced', enabled: true },
  { id: 'gemini-2.5-pro', provider: 'gemini', label: 'Gemini Pro', capabilities: ['chat', 'stream', 'json', 'vision', 'long_context'], contextTokens: 1_000_000, tier: 'smart', enabled: true },
  { id: 'openai/gpt-oss-20b', provider: 'groq', label: 'GPT-OSS 20B (Groq)', capabilities: ['chat', 'stream', 'json', 'tools'], contextTokens: 128_000, tier: 'fast', enabled: true },
  { id: 'openai/gpt-oss-120b', provider: 'openrouter', label: 'GPT-OSS 120B', capabilities: ['chat', 'stream', 'json', 'tools'], contextTokens: 128_000, tier: 'balanced', enabled: true },
];

export function findModel(id: string): ModelInfo | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id && m.enabled);
}
