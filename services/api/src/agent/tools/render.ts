import { int, obj, str, ToolContext, ToolDef } from './types';

async function rd(ctx: ToolContext, path: string, init: RequestInit = {}) {
  const cred = await ctx.connections.credential(ctx.userId, 'render');
  if (!cred) throw new Error('Render is not connected');
  const res = await fetch(`https://api.render.com/v1${path}`, {
    ...init,
    signal: ctx.signal,
    headers: { Authorization: `Bearer ${cred.accessToken}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as any };
}
const fail = (r: any) => ({ ok: false, summary: `Render ${r.status}: ${r.body?.message ?? 'error'}` });

export const renderTools: ToolDef[] = [
  {
    name: 'render_list_services',
    provider: 'render',
    description: 'List Render services (id, name, type, status).',
    parameters: obj({ limit: int('1-50, default 20') }),
    async run(a, ctx) {
      const r = await rd(ctx, `/services?limit=${Math.min(Number(a.limit) || 20, 50)}`);
      if (!r.ok) return fail(r);
      const lines = (r.body ?? []).map(({ service: s }: any) => `${s.id} ${s.name} · ${s.type} · ${s.suspended} · ${s.serviceDetails?.url ?? ''}`);
      return { ok: true, summary: `${lines.length} service(s)`, content: lines.join('\n') };
    },
  },
  {
    name: 'render_trigger_deploy',
    provider: 'render',
    confirm: true,
    description: 'Trigger a new deploy of a Render service.',
    parameters: obj({ serviceId: str('Service id (srv-…)'), clearCache: { type: 'boolean' } }, ['serviceId']),
    describe: (a) => `Deploy Render service ${a.serviceId}${a.clearCache ? ' (clear cache)' : ''}`,
    async run(a, ctx) {
      const r = await rd(ctx, `/services/${encodeURIComponent(a.serviceId)}/deploys`, { method: 'POST', body: JSON.stringify({ clearCache: a.clearCache ? 'clear' : 'do_not_clear' }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Deploy ${r.body.id} ${r.body.status}` };
    },
  },
  {
    name: 'render_get_logs',
    provider: 'render',
    description: 'Fetch recent logs for a Render service.',
    parameters: obj({ serviceId: str('Service id (srv-…)'), limit: int('1-100, default 50') }, ['serviceId']),
    async run(a, ctx) {
      const svc = await rd(ctx, `/services/${encodeURIComponent(a.serviceId)}`);
      if (!svc.ok) return fail(svc);
      const q = new URLSearchParams({ ownerId: svc.body.ownerId, resource: a.serviceId, limit: String(Math.min(Number(a.limit) || 50, 100)), direction: 'backward' });
      const r = await rd(ctx, `/logs?${q}`);
      if (!r.ok) return fail(r);
      const lines = (r.body.logs ?? []).map((l: any) => `${l.timestamp} ${l.message}`).reverse();
      return { ok: true, summary: `${lines.length} log line(s)`, content: lines.join('\n').slice(-12_000) };
    },
  },
];
