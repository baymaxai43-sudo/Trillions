import { capTail, clamp, int, obj, str, ToolContext, ToolDef, ToolResult } from './types';

async function vc(ctx: ToolContext, path: string, init: RequestInit & { teamId?: string } = {}) {
  const cred = await ctx.connections.credential(ctx.userId, 'vercel');
  if (!cred) throw new Error('Vercel is not connected');
  const { teamId: override, ...rest } = init;
  const teamId = override || (cred.meta.teamId as string | null | undefined);
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`https://api.vercel.com${path}${teamId ? `${sep}teamId=${encodeURIComponent(teamId)}` : ''}`, {
    ...rest,
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(30_000)]),
    headers: { Authorization: `Bearer ${cred.accessToken}`, ...(rest.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as any };
}
const fail = (r: any): ToolResult => ({ ok: false, summary: `Vercel ${r.status}: ${r.body?.error?.message ?? 'error'}${r.status === 403 || r.status === 404 ? ' (if the project is in a team, pass teamId; see vercel_list_projects)' : ''}`.slice(0, 300) });
const team = { teamId: str('Team id or slug when the project belongs to a team (optional)') };
const enc = encodeURIComponent;

export const vercelTools: ToolDef[] = [
  {
    name: 'vercel_list_projects',
    progress: () => 'Checking Vercel projects',
    provider: 'vercel',
    description: 'List Vercel projects (personal by default; pass teamId for a team). Also lists the teams the token can see.',
    parameters: obj({ limit: int('1-50, default 20'), ...team }),
    async run(a, ctx) {
      const r = await vc(ctx, `/v9/projects?limit=${clamp(a.limit, 20, 1, 50)}`, { teamId: a.teamId });
      if (!r.ok) return fail(r);
      const lines = (r.body.projects ?? []).map((p: any) => `${p.name} (id ${p.id}) · ${p.framework ?? 'n/a'} · ${p.link?.type ? `${p.link.type}:${p.link.org ?? ''}/${p.link.repo ?? ''}` : 'no git link'}`);
      const cred = await ctx.connections.credential(ctx.userId, 'vercel');
      const teams = ((cred?.meta.teams as any[]) ?? []).map((t) => `${t.slug} (${t.id})`);
      return { ok: true, summary: `${lines.length} project(s)`, content: `${lines.join('\n') || 'No projects.'}${teams.length ? `\n\nTeams: ${teams.join(', ')}` : ''}` };
    },
  },
  {
    name: 'vercel_list_deployments',
    progress: () => 'Checking Vercel deployments',
    provider: 'vercel',
    description: 'List recent deployments, optionally for one project id.',
    parameters: obj({ projectId: str('Project id (optional)'), limit: int('1-20, default 10'), ...team }),
    async run(a, ctx) {
      const q = new URLSearchParams({ limit: String(clamp(a.limit, 10, 1, 20)), ...(a.projectId ? { projectId: a.projectId } : {}) });
      const r = await vc(ctx, `/v6/deployments?${q}`, { teamId: a.teamId });
      if (!r.ok) return fail(r);
      const lines = (r.body.deployments ?? []).map(
        (d: any) => `${d.uid} ${d.name} ${d.state ?? d.readyState} ${d.target ?? 'preview'} https://${d.url} ${new Date(d.created).toISOString()}${d.meta?.githubCommitSha ? ` · ${String(d.meta.githubCommitRef ?? '')}@${String(d.meta.githubCommitSha).slice(0, 7)}` : ''}`,
      );
      return { ok: true, summary: `${lines.length} deployment(s)`, content: lines.join('\n') || 'No deployments.' };
    },
  },
  {
    name: 'vercel_get_deployment_logs',
    progress: () => 'Reading the Vercel build logs',
    provider: 'vercel',
    description: 'Get the build log / events of a deployment (tail, capped). Use to diagnose failed builds.',
    parameters: obj({ deploymentId: str('Deployment id (dpl_…) or URL'), ...team }, ['deploymentId']),
    async run(a, ctx) {
      const r = await vc(ctx, `/v3/deployments/${enc(a.deploymentId)}/events?limit=-1&builds=1`, { teamId: a.teamId });
      if (!r.ok) return fail(r);
      const events: any[] = Array.isArray(r.body) ? r.body : [];
      const lines = events.map((e) => e.text ?? e.payload?.text).filter(Boolean).map((t: string) => t.replace(/\x1b\[[0-9;]*m/g, ''));
      return { ok: true, summary: `${lines.length} log line(s)`, content: capTail(lines.join('\n') || 'No build output.', 12_000) };
    },
  },
  {
    name: 'vercel_list_env_names',
    progress: () => 'Checking Vercel env names',
    provider: 'vercel',
    description: 'List a project’s environment variable NAMES and targets. Values are never returned.',
    parameters: obj({ projectId: str('Project id or name'), ...team }, ['projectId']),
    async run(a, ctx) {
      const r = await vc(ctx, `/v9/projects/${enc(a.projectId)}/env`, { teamId: a.teamId });
      if (!r.ok) return fail(r);
      const lines = (r.body.envs ?? []).map((e: any) => `${e.key} · ${(e.target ?? []).join(',') || 'all'} · ${e.type}`);
      return { ok: true, summary: `${lines.length} env var(s)`, content: lines.join('\n') || 'No env vars.' };
    },
  },
  {
    name: 'vercel_trigger_deploy',
    progress: () => 'Starting the Vercel deploy',
    provider: 'vercel',
    confirm: true,
    description: 'Redeploy the latest deployment of a Vercel project to production.',
    parameters: obj({ projectId: str('Project id or name'), ...team }, ['projectId']),
    describe: (a) => `Redeploy Vercel project ${a.projectId} to PRODUCTION`,
    async run(a, ctx) {
      const latest = await vc(ctx, `/v6/deployments?limit=1&projectId=${enc(a.projectId)}`, { teamId: a.teamId });
      const d = latest.body?.deployments?.[0];
      if (!latest.ok || !d) return { ok: false, summary: 'No previous deployment to redeploy' };
      const r = await vc(ctx, '/v13/deployments', { method: 'POST', teamId: a.teamId, body: JSON.stringify({ name: d.name, deploymentId: d.uid, target: 'production' }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Deploy started: https://${r.body.url}`, content: `Deployment ${r.body.id} state ${r.body.readyState}. Check it with vercel_get_deployment_logs.` };
    },
  },
];
