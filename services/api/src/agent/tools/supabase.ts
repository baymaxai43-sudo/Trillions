import { cap, obj, str, ToolContext, ToolDef, ToolResult } from './types';

async function sb(ctx: ToolContext, path: string, init: RequestInit = {}) {
  const cred = await ctx.connections.credential(ctx.userId, 'supabase');
  if (!cred) throw new Error('Supabase is not connected');
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    ...init,
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(60_000)]),
    headers: { Authorization: `Bearer ${cred.accessToken}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as any };
}
const fail = (r: any): ToolResult => ({ ok: false, summary: `Supabase ${r.status}: ${r.body?.message ?? r.body?.error ?? 'error'}`.slice(0, 400) });
const enc = encodeURIComponent;
const ref = { project_ref: str('Project ref (the id from supabase_list_projects)') };

/** Strips comments and literals so keyword checks are not fooled by them. */
function normalizeSql(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .trim();
}

const WRITE_WORDS =
  /\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|comment|vacuum|analyze|reindex|cluster|refresh|copy|call|do|lock|listen|notify|set|reset|begin|commit|rollback|savepoint|prepare|execute|security|import|load|into)\b/i;

/**
 * Defence in depth on top of the API's read-only role (read_only: true runs as supabase_read_only_role):
 * exactly one statement starting with SELECT / WITH / SHOW / EXPLAIN / TABLE / VALUES and no write keywords.
 */
export function readOnlyViolation(sql: string): string | null {
  const s = normalizeSql(sql).replace(/;\s*$/, '');
  if (!s) return 'Empty query';
  if (s.includes(';')) return 'Only one statement is allowed in read-only mode';
  const lead = /^(select|with|show|explain|table|values)\b/i;
  if (!lead.test(s)) return 'Read-only mode accepts SELECT / WITH / SHOW / EXPLAIN only';
  if (WRITE_WORDS.test(s.replace(lead, ''))) return 'The query contains a write or session keyword; use supabase_execute_sql (asks for approval)';
  return null;
}

function formatRows(body: any): { n: number; text: string } {
  const rows: any[] = Array.isArray(body) ? body : Array.isArray(body?.result) ? body.result : [];
  if (!rows.length) return { n: 0, text: 'No rows.' };
  const cols = Object.keys(rows[0] ?? {});
  const cell = (v: unknown) => (v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v)).replace(/\s+/g, ' ').slice(0, 200);
  const lines = [cols.join(' | '), ...rows.slice(0, 200).map((r) => cols.map((c) => cell(r[c])).join(' | '))];
  return { n: rows.length, text: `${lines.join('\n')}${rows.length > 200 ? `\n…${rows.length - 200} more rows` : ''}` };
}

export const supabaseTools: ToolDef[] = [
  {
    name: 'supabase_list_projects',
    provider: 'supabase',
    description: 'List Supabase projects (ref, name, region, status) the token can access.',
    parameters: obj({}),
    async run(_a, ctx) {
      const r = await sb(ctx, '/projects');
      if (!r.ok) return fail(r);
      const lines = (r.body ?? []).map((p: any) => `${p.id ?? p.ref} · ${p.name} · ${p.region} · ${p.status} · org ${p.organization_id}`);
      return { ok: true, summary: `${lines.length} project(s)`, content: lines.join('\n') || 'No projects.' };
    },
  },
  {
    name: 'supabase_query',
    provider: 'supabase',
    description:
      'Run READ-ONLY SQL (one SELECT/WITH/SHOW/EXPLAIN) as the read-only role. Schema-qualify names (public.users). Results capped at 200 rows. ' +
      'Use for inspecting schema (information_schema, pg_catalog, pg_policies) and data.',
    parameters: obj({ ...ref, sql: str('One read-only SQL statement') }, ['project_ref', 'sql']),
    async run(a, ctx) {
      const bad = readOnlyViolation(String(a.sql ?? ''));
      if (bad) return { ok: false, summary: bad };
      const r = await sb(ctx, `/projects/${enc(a.project_ref)}/database/query`, { method: 'POST', body: JSON.stringify({ query: String(a.sql), read_only: true }) });
      if (!r.ok) return fail(r);
      const { n, text } = formatRows(r.body);
      return { ok: true, summary: `${n} row(s)`, content: cap(text, 14_000) };
    },
  },
  {
    name: 'supabase_execute_sql',
    provider: 'supabase',
    confirm: true,
    description:
      'Run SQL that CHANGES the database (DDL, DML, policies, functions). Asks the user first. Prefer a migration file in the repo for schema changes; use this for one-off fixes the user asked for.',
    parameters: obj({ ...ref, sql: str('SQL to execute'), reason: str('Why, in one sentence (shown to the user)') }, ['project_ref', 'sql']),
    describe: (a) => `Run SQL that changes project ${a.project_ref}${a.reason ? ` (${a.reason})` : ''}:\n${String(a.sql).slice(0, 600)}${String(a.sql).length > 600 ? '\n…' : ''}`,
    async run(a, ctx) {
      const r = await sb(ctx, `/projects/${enc(a.project_ref)}/database/query`, { method: 'POST', body: JSON.stringify({ query: String(a.sql) }) });
      if (!r.ok) return fail(r);
      const { n, text } = formatRows(r.body);
      return { ok: true, summary: `SQL executed${n ? ` (${n} row(s) returned)` : ''}`, content: cap(text, 8000) };
    },
  },
  {
    name: 'supabase_list_functions',
    provider: 'supabase',
    description: 'List Edge Functions of a project (slug, status, version, verify_jwt).',
    parameters: obj(ref, ['project_ref']),
    async run(a, ctx) {
      const r = await sb(ctx, `/projects/${enc(a.project_ref)}/functions`);
      if (!r.ok) return fail(r);
      const lines = (r.body ?? []).map((f: any) => `${f.slug} · ${f.status} · v${f.version} · verify_jwt ${f.verify_jwt} · updated ${f.updated_at ? new Date(f.updated_at).toISOString() : '-'}`);
      return { ok: true, summary: `${lines.length} function(s)`, content: lines.join('\n') || 'No edge functions.' };
    },
  },
];
