import type { ConnectorId as TokenConnectorId } from '@trillion/shared';

/**
 * Every connector is a pasted access token. OAuth was removed: no client secrets on the server,
 * no redirect flow, no state to replay. Google stays in the type only so its (disabled) tools compile:
 * Gmail has no long-lived pasteable token (OAuth access tokens expire hourly).
 */
export type ConnectorId = TokenConnectorId | 'google';
export const CONNECTORS: TokenConnectorId[] = ['github', 'vercel', 'render', 'supabase', 'netlify'];
export const isConnector = (p: string): p is TokenConnectorId => (CONNECTORS as string[]).includes(p);

export interface TokenSet {
  accessToken: string;
  scopes?: string;
  label?: string;
  meta?: Record<string, unknown>;
}

export interface ConnectorInfo {
  id: TokenConnectorId;
  label: string;
  description: string;
  /** Where the user creates the token. */
  tokenUrl: string;
  /** Short steps, including the scopes/permissions TRILLION needs. */
  howTo: string[];
  placeholder: string;
}

const INFO: Record<TokenConnectorId, ConnectorInfo> = {
  github: {
    id: 'github',
    label: 'GitHub',
    description: 'Repos, code, branches, pull requests, issues and Actions',
    tokenUrl: 'https://github.com/settings/personal-access-tokens/new',
    howTo: [
      'Open GitHub → Settings → Developer settings → Personal access tokens.',
      'Fine-grained (recommended): pick the repositories, then grant Contents, Pull requests, Issues: Read and write; Actions, Metadata: Read. Add Workflows: Read and write only if TRILLION should edit .github/workflows.',
      'Classic also works: scopes repo and workflow.',
      'Set an expiry, generate, and paste the token here.',
    ],
    placeholder: 'github_pat_… or ghp_…',
  },
  vercel: {
    id: 'vercel',
    label: 'Vercel',
    description: 'Projects, deployments, build logs and env var names',
    tokenUrl: 'https://vercel.com/account/settings/tokens',
    howTo: [
      'Open Vercel → Account Settings → Tokens.',
      'Create a token scoped to your personal account or the team that owns the projects.',
      'Set an expiry, create, and paste the token here.',
    ],
    placeholder: 'Vercel access token',
  },
  render: {
    id: 'render',
    label: 'Render',
    description: 'Services, deploys, logs and restarts',
    tokenUrl: 'https://dashboard.render.com/u/settings#api-keys',
    howTo: ['Open Render → Account Settings → API Keys.', 'Create an API key (it has access to every workspace you belong to).', 'Paste it here.'],
    placeholder: 'rnd_…',
  },
  supabase: {
    id: 'supabase',
    label: 'Supabase',
    description: 'Projects, SQL (read-only by default) and edge functions',
    tokenUrl: 'https://supabase.com/dashboard/account/tokens',
    howTo: [
      'Open Supabase → Account → Access Tokens.',
      'Generate a new personal access token (Management API; it can reach every project in your organizations).',
      'Paste it here. Write SQL always asks you first.',
    ],
    placeholder: 'sbp_…',
  },
  netlify: {
    id: 'netlify',
    label: 'Netlify',
    description: 'Sites, deploys and builds',
    tokenUrl: 'https://app.netlify.com/user/applications#personal-access-tokens',
    howTo: ['Open Netlify → User settings → Applications → Personal access tokens.', 'Create a new token with an expiry.', 'Paste it here.'],
    placeholder: 'nfp_…',
  },
};

export function connectorInfo(): ConnectorInfo[] {
  return CONNECTORS.map((id) => INFO[id]);
}
export const infoFor = (p: TokenConnectorId): ConnectorInfo => INFO[p];

const TIMEOUT = 15_000;

async function getJson(url: string, token: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'trillion-agent', ...headers },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const body = (await res.json().catch(() => null)) as any;
  return { ok: res.ok, status: res.status, body, headers: res.headers };
}

const rejected = (label: string, status: number) =>
  new Error(status === 401 || status === 403 ? `${label} rejected that token. Check it was copied fully and has not expired.` : `${label} could not verify the token (HTTP ${status}). Try again shortly.`);

/** Validates a pasted token against the provider and returns what to store. Never logs the token. */
export async function validateToken(p: TokenConnectorId, raw: string): Promise<TokenSet> {
  const token = raw.trim();
  if (!/^[\x21-\x7e]{10,500}$/.test(token)) throw new Error('That does not look like an access token.');
  switch (p) {
    case 'github': {
      const r = await getJson('https://api.github.com/user', token, { 'X-GitHub-Api-Version': '2022-11-28' });
      if (!r.ok) throw rejected('GitHub', r.status);
      const scopes = r.headers.get('x-oauth-scopes') ?? undefined; // classic tokens only
      return { accessToken: token, label: r.body?.login, scopes, meta: { kind: token.startsWith('github_pat_') ? 'fine_grained' : 'classic' } };
    }
    case 'vercel': {
      const r = await getJson('https://api.vercel.com/v2/user', token);
      if (!r.ok) throw rejected('Vercel', r.status);
      const teams = await getJson('https://api.vercel.com/v2/teams?limit=20', token).catch(() => null);
      const list = ((teams?.ok && teams.body?.teams) || []).map((t: any) => ({ id: t.id, slug: t.slug, name: t.name }));
      return { accessToken: token, label: r.body?.user?.username ?? r.body?.user?.email ?? 'Vercel', meta: { teamId: null, teams: list } };
    }
    case 'render': {
      const r = await getJson('https://api.render.com/v1/owners?limit=1', token);
      if (!r.ok) throw rejected('Render', r.status);
      const o = Array.isArray(r.body) ? r.body[0]?.owner : null;
      return { accessToken: token, label: o?.name ?? o?.email ?? 'Render' };
    }
    case 'supabase': {
      const r = await getJson('https://api.supabase.com/v1/organizations', token);
      if (!r.ok) throw rejected('Supabase', r.status);
      const orgs = Array.isArray(r.body) ? r.body : [];
      const label = orgs.length === 1 ? orgs[0].name : orgs.length ? `${orgs[0].name} +${orgs.length - 1}` : 'Supabase';
      return { accessToken: token, label };
    }
    case 'netlify': {
      const r = await getJson('https://api.netlify.com/api/v1/user', token);
      if (!r.ok) throw rejected('Netlify', r.status);
      return { accessToken: token, label: r.body?.slug ?? r.body?.email ?? r.body?.full_name ?? 'Netlify' };
    }
  }
}
