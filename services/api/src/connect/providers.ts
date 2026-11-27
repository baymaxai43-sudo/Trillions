export type ConnectorId = 'github' | 'google' | 'vercel' | 'render';
export const CONNECTORS: ConnectorId[] = ['github', 'google', 'vercel', 'render'];

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string; // ISO
  scopes?: string;
  label?: string;
  meta?: Record<string, unknown>;
}

const apiBase = () => (process.env.API_PUBLIC_URL ?? 'https://trillion-api.onrender.com').replace(/\/$/, '');
export const redirectUri = (p: ConnectorId) => `${apiBase()}/v1/connect/${p}/callback`;

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];

export interface ConnectorInfo {
  id: ConnectorId;
  label: string;
  kind: 'oauth' | 'api_key';
  configured: boolean; // server has the OAuth app credentials
  description: string;
}

export function connectorInfo(): ConnectorInfo[] {
  const e = process.env;
  return [
    { id: 'github', label: 'GitHub', kind: 'oauth', configured: !!(e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET), description: 'Repos, files, issues and pull requests' },
    { id: 'google', label: 'Gmail', kind: 'oauth', configured: !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET), description: 'Search, read and send email' },
    { id: 'vercel', label: 'Vercel', kind: 'oauth', configured: !!(e.VERCEL_CLIENT_ID && e.VERCEL_CLIENT_SECRET && e.VERCEL_INTEGRATION_SLUG), description: 'Projects and deployments (or paste a token)' },
    { id: 'render', label: 'Render', kind: 'api_key', configured: true, description: 'Services, deploys and logs (paste an API key)' },
  ];
}

export function authUrl(p: ConnectorId, state: string): string {
  const e = process.env;
  switch (p) {
    case 'github': {
      const q = new URLSearchParams({ client_id: e.GITHUB_CLIENT_ID!, redirect_uri: redirectUri(p), scope: 'repo read:user', state, allow_signup: 'false' });
      return `https://github.com/login/oauth/authorize?${q}`;
    }
    case 'google': {
      const q = new URLSearchParams({
        client_id: e.GOOGLE_CLIENT_ID!,
        redirect_uri: redirectUri(p),
        response_type: 'code',
        scope: GOOGLE_SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    }
    case 'vercel':
      return `https://vercel.com/integrations/${e.VERCEL_INTEGRATION_SLUG}/new?${new URLSearchParams({ state })}`;
    default:
      throw new Error(`${p} does not use OAuth`);
  }
}

async function json(res: Response) {
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || body.error) throw new Error(`token exchange failed (${res.status}): ${body.error_description ?? body.error ?? ''}`);
  return body;
}

export async function exchangeCode(p: ConnectorId, code: string): Promise<TokenSet> {
  const e = process.env;
  if (p === 'github') {
    const b = await json(
      await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: e.GITHUB_CLIENT_ID, client_secret: e.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri(p) }),
      }),
    );
    const me = (await (await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${b.access_token}`, 'User-Agent': 'trillion' } })).json()) as any;
    return { accessToken: b.access_token, scopes: b.scope, label: me?.login };
  }
  if (p === 'google') {
    const b = await json(
      await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: e.GOOGLE_CLIENT_ID!, client_secret: e.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(p), grant_type: 'authorization_code' }),
      }),
    );
    const prof = (await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${b.access_token}` } })).json()) as any;
    return {
      accessToken: b.access_token,
      refreshToken: b.refresh_token,
      expiresAt: new Date(Date.now() + (b.expires_in ?? 3600) * 1000).toISOString(),
      scopes: b.scope,
      label: prof?.emailAddress,
    };
  }
  if (p === 'vercel') {
    const b = await json(
      await fetch('https://api.vercel.com/v2/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: e.VERCEL_CLIENT_ID!, client_secret: e.VERCEL_CLIENT_SECRET!, code, redirect_uri: redirectUri(p) }),
      }),
    );
    return { accessToken: b.access_token, label: b.team_id ? `team ${b.team_id}` : 'personal', meta: { teamId: b.team_id ?? null, installationId: b.installation_id ?? null } };
  }
  throw new Error(`${p} does not use OAuth`);
}

export async function refreshGoogle(refreshToken: string): Promise<TokenSet> {
  const b = await json(
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    }),
  );
  return { accessToken: b.access_token, refreshToken, expiresAt: new Date(Date.now() + (b.expires_in ?? 3600) * 1000).toISOString() };
}

/** Validates a pasted key/token and returns a label for it. */
export async function validatePastedKey(p: ConnectorId, token: string): Promise<TokenSet> {
  if (p === 'render') {
    const res = await fetch('https://api.render.com/v1/owners?limit=1', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    if (!res.ok) throw new Error('Render rejected that API key.');
    const owners = (await res.json()) as any[];
    return { accessToken: token, label: owners?.[0]?.owner?.name ?? owners?.[0]?.owner?.email ?? 'Render' };
  }
  if (p === 'vercel') {
    const res = await fetch('https://api.vercel.com/v2/user', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Vercel rejected that token.');
    const u = (await res.json()) as any;
    return { accessToken: token, label: u?.user?.username ?? 'Vercel', meta: { teamId: null, personalToken: true } };
  }
  if (p === 'github') {
    const res = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'trillion' } });
    if (!res.ok) throw new Error('GitHub rejected that token.');
    const u = (await res.json()) as any;
    return { accessToken: token, label: u?.login, meta: { personalToken: true } };
  }
  throw new Error(`${p} does not accept pasted keys`);
}
