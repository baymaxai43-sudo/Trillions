import { clamp, int, obj, str, ToolContext, ToolDef, ToolResult } from './types';

async function nf(ctx: ToolContext, path: string, init: RequestInit = {}) {
  const cred = await ctx.connections.credential(ctx.userId, 'netlify');
  if (!cred) throw new Error('Netlify is not connected');
  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    ...init,
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(30_000)]),
    headers: { Authorization: `Bearer ${cred.accessToken}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as any };
}
const fail = (r: any): ToolResult => ({ ok: false, summary: `Netlify ${r.status}: ${r.body?.message ?? 'error'}`.slice(0, 300) });
const enc = encodeURIComponent;

export const netlifyTools: ToolDef[] = [
  {
    name: 'netlify_list_sites',
    provider: 'netlify',
    description: 'List Netlify sites (id, name, URL, repo, last published deploy).',
    parameters: obj({ per_page: int('1-100, default 30') }),
    async run(a, ctx) {
      const r = await nf(ctx, `/sites?per_page=${clamp(a.per_page, 30, 1, 100)}&filter=all`);
      if (!r.ok) return fail(r);
      const lines = (r.body ?? []).map((s: any) => `${s.id} · ${s.name} · ${s.ssl_url ?? s.url} · ${s.build_settings?.repo_url ?? 'no repo'} · published ${s.published_deploy?.published_at ?? '-'}`);
      return { ok: true, summary: `${lines.length} site(s)`, content: lines.join('\n') || 'No sites.' };
    },
  },
  {
    name: 'netlify_list_deploys',
    provider: 'netlify',
    description: 'List recent deploys of a Netlify site with state, branch, commit and error message.',
    parameters: obj({ site_id: str('Site id'), per_page: int('1-30, default 10') }, ['site_id']),
    async run(a, ctx) {
      const r = await nf(ctx, `/sites/${enc(a.site_id)}/deploys?per_page=${clamp(a.per_page, 10, 1, 30)}`);
      if (!r.ok) return fail(r);
      const lines = (r.body ?? []).map(
        (d: any) => `${d.id} · ${d.state} · ${d.context} · ${d.branch ?? '-'}@${String(d.commit_ref ?? '').slice(0, 7)} · ${d.created_at}${d.error_message ? ` · ERROR: ${String(d.error_message).slice(0, 200)}` : ''}`,
      );
      return { ok: true, summary: `${lines.length} deploy(s)`, content: lines.join('\n') || 'No deploys.' };
    },
  },
  {
    name: 'netlify_trigger_build',
    provider: 'netlify',
    confirm: true,
    description: 'Trigger a new build and deploy of a Netlify site from its linked repo.',
    parameters: obj({ site_id: str('Site id'), clear_cache: { type: 'boolean' } }, ['site_id']),
    describe: (a) => `Trigger a Netlify build for site ${a.site_id}${a.clear_cache ? ' (clear cache)' : ''}`,
    async run(a, ctx) {
      const r = await nf(ctx, `/sites/${enc(a.site_id)}/builds`, { method: 'POST', body: JSON.stringify({ clear_cache: !!a.clear_cache }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Build ${r.body?.id ?? ''} started`, content: 'Check progress with netlify_list_deploys.' };
    },
  },
];
