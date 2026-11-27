import { int, obj, str, ToolContext, ToolDef } from './types';

async function vc(ctx: ToolContext, path: string, init: RequestInit = {}) {
  const cred = await ctx.connections.credential(ctx.userId, 'vercel');
  if (!cred) throw new Error('Vercel is not connected');
  const teamId = cred.meta.teamId as string | null | undefined;
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`https://api.vercel.com${path}${teamId ? `${sep}teamId=${encodeURIComponent(teamId)}` : ''}`, {
    ...init,
    signal: ctx.signal,
    headers: { Authorization: `Bearer ${cred.accessToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as any };
}
const fail = (r: any) => ({ ok: false, summary: `Vercel ${r.status}: ${r.body?.error?.message ?? 'error'}` });

export const vercelTools: ToolDef[] = [
  {
    name: 'vercel_list_projects',
    provider: 'vercel',
    description: 'List Vercel projects.',
    parameters: obj({ limit: int('1-50, default 20') }),
    async run(a, ctx) {
      const r = await vc(ctx, `/v9/projects?limit=${Math.min(Number(a.limit) || 20, 50)}`);
      if (!r.ok) return fail(r);
      const lines = (r.body.projects ?? []).map((p: any) => `${p.name} (id ${p.id}) · ${p.framework ?? 'n/a'}`);
      return { ok: true, summary: `${lines.length} project(s)`, content: lines.join('\n') };
    },
  },
  {
    name: 'vercel_list_deployments',
    provider: 'vercel',
    description: 'List recent deployments, optionally for one project id.',
    parameters: obj({ projectId: str('Project id (optional)'), limit: int('1-20, default 10') }),
    async run(a, ctx) {
      const q = new URLSearchParams({ limit: String(Math.min(Number(a.limit) || 10, 20)), ...(a.projectId ? { projectId: a.projectId } : {}) });
      const r = await vc(ctx, `/v6/deployments?${q}`);
      if (!r.ok) return fail(r);
      const lines = (r.body.deployments ?? []).map((d: any) => `${d.uid} ${d.name} ${d.state ?? d.readyState} ${d.target ?? 'preview'} https://${d.url} ${new Date(d.created).toISOString()}`);
      return { ok: true, summary: `${lines.length} deployment(s)`, content: lines.join('\n') };
    },
  },
  {
    name: 'vercel_trigger_deploy',
    provider: 'vercel',
    confirm: true,
    description: 'Redeploy the latest deployment of a Vercel project to production.',
    parameters: obj({ projectId: str('Project id or name') }, ['projectId']),
    describe: (a) => `Redeploy Vercel project ${a.projectId} to production`,
    async run(a, ctx) {
      const latest = await vc(ctx, `/v6/deployments?limit=1&projectId=${encodeURIComponent(a.projectId)}`);
      const d = latest.body?.deployments?.[0];
      if (!latest.ok || !d) return { ok: false, summary: 'No previous deployment to redeploy' };
      const r = await vc(ctx, '/v13/deployments', { method: 'POST', body: JSON.stringify({ name: d.name, deploymentId: d.uid, target: 'production' }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Deploy started: https://${r.body.url}`, content: `Deployment ${r.body.id} state ${r.body.readyState}` };
    },
  },
];
