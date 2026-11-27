import { capTail, clamp, int, obj, str, ToolContext, ToolDef, ToolResult } from './types';

async function rd(ctx: ToolContext, path: string, init: RequestInit = {}) {
  const cred = await ctx.connections.credential(ctx.userId, 'render');
  if (!cred) throw new Error('Render is not connected');
  const res = await fetch(`https://api.render.com/v1${path}`, {
    ...init,
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(30_000)]),
    headers: { Authorization: `Bearer ${cred.accessToken}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as any };
}
const fail = (r: any): ToolResult => ({ ok: false, summary: `Render ${r.status}: ${r.body?.message ?? 'error'}`.slice(0, 300) });
const enc = encodeURIComponent;
const svc = { serviceId: str('Service id (srv-…)') };

export const renderTools: ToolDef[] = [
  {
    name: 'render_list_services',
    progress: () => 'Checking Render services',
    provider: 'render',
    description: 'List Render services (id, name, type, suspended, URL, branch).',
    parameters: obj({ limit: int('1-100, default 30') }),
    async run(a, ctx) {
      const r = await rd(ctx, `/services?limit=${clamp(a.limit, 30, 1, 100)}`);
      if (!r.ok) return fail(r);
      const lines = (r.body ?? []).map(({ service: s }: any) => `${s.id} ${s.name} · ${s.type} · ${s.suspended} · branch ${s.branch ?? '-'} · autoDeploy ${s.autoDeploy} · ${s.serviceDetails?.url ?? ''}`);
      return { ok: true, summary: `${lines.length} service(s)`, content: lines.join('\n') || 'No services.' };
    },
  },
  {
    name: 'render_list_deploys',
    progress: () => 'Checking Render deploys',
    provider: 'render',
    description: 'List recent deploys of a Render service with status and commit.',
    parameters: obj({ ...svc, limit: int('1-20, default 10') }, ['serviceId']),
    async run(a, ctx) {
      const r = await rd(ctx, `/services/${enc(a.serviceId)}/deploys?limit=${clamp(a.limit, 10, 1, 20)}`);
      if (!r.ok) return fail(r);
      const lines = (r.body ?? []).map(({ deploy: d }: any) => `${d.id} · ${d.status} · ${d.trigger ?? ''} · ${d.commit?.id?.slice(0, 7) ?? '-'} ${String(d.commit?.message ?? '').split('\n')[0].slice(0, 80)} · ${d.createdAt}${d.finishedAt ? ` → ${d.finishedAt}` : ''}`);
      return { ok: true, summary: `${lines.length} deploy(s)`, content: lines.join('\n') || 'No deploys.' };
    },
  },
  {
    name: 'render_get_logs',
    progress: () => 'Reading Render logs',
    provider: 'render',
    description: 'Fetch recent logs for a Render service (newest last, capped). Optionally filter by text.',
    parameters: obj({ ...svc, limit: int('1-100, default 60'), text: str('Only lines containing this text (optional)') }, ['serviceId']),
    async run(a, ctx) {
      const s = await rd(ctx, `/services/${enc(a.serviceId)}`);
      if (!s.ok) return fail(s);
      const q = new URLSearchParams({ ownerId: s.body.ownerId, resource: a.serviceId, limit: String(clamp(a.limit, 60, 1, 100)), direction: 'backward', ...(a.text ? { text: a.text } : {}) });
      const r = await rd(ctx, `/logs?${q}`);
      if (!r.ok) return fail(r);
      const lines = (r.body.logs ?? []).map((l: any) => `${l.timestamp} ${l.message}`).reverse();
      return { ok: true, summary: `${lines.length} log line(s)`, content: capTail(lines.join('\n') || 'No log lines.', 12_000) };
    },
  },
  {
    name: 'render_trigger_deploy',
    progress: () => 'Starting the Render deploy',
    provider: 'render',
    confirm: true,
    description: 'Trigger a new deploy of a Render service (latest commit of its branch).',
    parameters: obj({ ...svc, clearCache: { type: 'boolean' } }, ['serviceId']),
    describe: (a) => `Deploy Render service ${a.serviceId}${a.clearCache ? ' (clear build cache)' : ''}`,
    async run(a, ctx) {
      const r = await rd(ctx, `/services/${enc(a.serviceId)}/deploys`, { method: 'POST', body: JSON.stringify({ clearCache: a.clearCache ? 'clear' : 'do_not_clear' }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Deploy ${r.body.id} ${r.body.status}`, content: 'Check progress with render_list_deploys and render_get_logs.' };
    },
  },
  {
    name: 'render_restart_service',
    progress: () => 'Restarting the Render service',
    provider: 'render',
    confirm: true,
    description: 'Restart a running Render service without rebuilding (brief downtime on single-instance plans).',
    parameters: obj(svc, ['serviceId']),
    describe: (a) => `Restart Render service ${a.serviceId} (brief downtime)`,
    async run(a, ctx) {
      const r = await rd(ctx, `/services/${enc(a.serviceId)}/restart`, { method: 'POST' });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Restart requested for ${a.serviceId}` };
    },
  },
];
