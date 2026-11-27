import { apiFetch } from './api';
import { publish } from './sync';

export type ProviderId = 'github' | 'vercel' | 'render' | 'supabase' | 'netlify';

/** GET /v1/connect/providers. Never contains tokens. */
export type Provider = {
  id: ProviderId;
  label: string;
  description: string;
  tokenUrl: string;
  howTo: string[];
  placeholder: string;
  connected: boolean;
  accountLabel: string | null;
  connectedAt: string | null;
};

export const PROVIDER_MONO: Record<ProviderId, string> = { github: 'GH', vercel: '▲', render: 'R', supabase: 'SB', netlify: 'N' };

export const listProviders = () => apiFetch<Provider[]>('/v1/connect/providers');

/** Sends the token straight to the API over TLS. It never enters the chat, the model or local storage. */
export async function saveToken(provider: ProviderId, token: string): Promise<string | null> {
  const r = await apiFetch<{ ok: boolean; accountLabel: string | null }>(`/v1/connect/${provider}/key`, { method: 'POST', body: { apiKey: token.trim() } });
  publish('connections');
  return r.accountLabel;
}

export async function disconnectProvider(provider: ProviderId) {
  await apiFetch(`/v1/connect/${provider}`, { method: 'DELETE' });
  publish('connections');
}
