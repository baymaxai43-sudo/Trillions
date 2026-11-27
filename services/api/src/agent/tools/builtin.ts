import { isValidTimezone, nextRun } from '../schedule-util';
import { cap, int, obj, str, ToolDef } from './types';

export const getTime: ToolDef = {
  name: 'get_time',
  description: 'Get the current date and time, optionally in an IANA timezone (default Africa/Lagos).',
  parameters: obj({ timezone: str('IANA timezone, e.g. Africa/Lagos') }),
  async run(args) {
    const tz = args.timezone && isValidTimezone(args.timezone) ? args.timezone : 'Africa/Lagos';
    const now = new Date();
    const s = new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }).format(now);
    return { ok: true, summary: `${s} (${tz})`, content: `${s} | ISO ${now.toISOString()} | tz ${tz}` };
  },
};

export const remember: ToolDef = {
  name: 'remember',
  description:
    'Save a durable fact or preference about the user to long-term memory. Only for things the user would want remembered across conversations. ' +
    'If this run has read web pages or private data, the memory is saved as pending until the user confirms it in Settings.',
  parameters: obj({ fact: str('One self-contained sentence, e.g. "Prefers TypeScript over JavaScript"') }, ['fact']),
  private: false,
  syncScope: 'memories',
  async run(args, ctx) {
    const fact = String(args.fact ?? '').trim().slice(0, 1000);
    if (!fact) return { ok: false, summary: 'Empty fact' };
    // Untrusted content in context could have planted this "fact": hold it for the user's review.
    const confirmed = !(ctx.security.touchedPrivate || ctx.security.usedWeb);
    const { error } = await ctx.db
      .from('memories')
      .insert({ owner_id: ctx.userId, content: fact, source: confirmed ? 'explicit' : 'suggested', confirmed });
    if (error) return { ok: false, summary: 'Could not save memory' };
    return confirmed
      ? { ok: true, summary: `Remembered: ${fact}` }
      : {
          ok: true,
          summary: `Saved for review: ${fact}`,
          content: 'Saved as pending. It is used only after the user confirms it in Settings → What TRILLION knows. Tell the user.',
        };
  },
};

/** Full-text (then substring) memory search. `confirmed` null searches pending and confirmed rows. */
export async function searchMemories(db: any, userId: string, query: string, k = 6, confirmed: boolean | null = true): Promise<{ id: string; content: string }[]> {
  const q = query.trim();
  if (!q) return [];
  const base = () => {
    const b = db.from('memories').select('id, content').eq('owner_id', userId);
    return confirmed === null ? b : b.eq('confirmed', confirmed);
  };
  const fts = await base().textSearch('fts', q.split(/\s+/).slice(0, 12).join(' or '), { type: 'websearch', config: 'english' }).limit(k);
  if (fts.data?.length) return fts.data;
  const like = await base().ilike('content', `%${q.slice(0, 60).replace(/[%_]/g, '')}%`).limit(k);
  return like.data ?? [];
}

export const recall: ToolDef = {
  name: 'recall',
  description: "Search the user's confirmed long-term memory for facts relevant to a query.",
  parameters: obj({ query: str('What to look for') }, ['query']),
  private: true,
  async run(args, ctx) {
    const rows = await searchMemories(ctx.db, ctx.userId, String(args.query ?? ''), 8);
    return {
      ok: true,
      summary: `${rows.length} memor${rows.length === 1 ? 'y' : 'ies'} found`,
      content: rows.length ? rows.map((r) => `- ${r.content}`).join('\n') : 'No matching memories.',
    };
  },
};

export const forget: ToolDef = {
  name: 'forget',
  description: 'Delete memories that match a query (asks the user first).',
  parameters: obj({ query: str('Text identifying the memory to delete') }, ['query']),
  confirm: true,
  syncScope: 'memories',
  describe: (a) => `Delete memories matching “${a.query}”`,
  async run(args, ctx) {
    const rows = await searchMemories(ctx.db, ctx.userId, String(args.query ?? ''), 5, null);
    if (!rows.length) return { ok: false, summary: 'No matching memory' };
    await ctx.db.from('memories').delete().eq('owner_id', ctx.userId).in('id', rows.map((r) => r.id));
    return { ok: true, summary: `Deleted ${rows.length} memor${rows.length === 1 ? 'y' : 'ies'}` };
  },
};

const MIME: Record<string, string> = {
  md: 'text/markdown', txt: 'text/plain', json: 'application/json', csv: 'text/csv', html: 'text/html',
  js: 'text/javascript', ts: 'text/plain', py: 'text/x-python', css: 'text/css', svg: 'image/svg+xml', xml: 'application/xml', yaml: 'text/yaml', yml: 'text/yaml',
};

export const createFile: ToolDef = {
  name: 'create_file',
  description: 'Create a text file (markdown, code, CSV, JSON, HTML…) for the user. It is saved to their private artifacts and shown as a download card.',
  parameters: obj({ filename: str('File name with extension, e.g. report.md'), content: str('Full file content (max 1 MB)') }, ['filename', 'content']),
  async run(args, ctx) {
    const name = String(args.filename ?? 'file.txt').replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file.txt';
    const content = String(args.content ?? '');
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > 1_000_000) return { ok: false, summary: 'File is larger than 1 MB' };
    const ext = name.split('.').pop()?.toLowerCase() ?? 'txt';
    const mime = MIME[ext] ?? 'text/plain';
    const path = `${ctx.userId}/${ctx.runId}/${name}`;
    const up = await ctx.db.storage.from('artifacts').upload(path, Buffer.from(content, 'utf8'), { contentType: `${mime}; charset=utf-8`, upsert: true });
    if (up.error) return { ok: false, summary: `Upload failed: ${up.error.message}` };
    const signed = await ctx.db.storage.from('artifacts').createSignedUrl(path, 7 * 24 * 3600);
    const url = signed.data?.signedUrl ?? '';
    ctx.emit({ type: 'artifact', name, url, mime, size: bytes, path });
    return { ok: true, summary: `Created ${name} (${bytes.toLocaleString()} bytes)`, content: `Saved ${name}. The user sees it as a download card.` };
  },
};

export const spawnSubtask: ToolDef = {
  name: 'spawn_subtask',
  description: 'Delegate a self-contained sub-goal (e.g. research one topic) to a subagent with its own step budget. Returns its summary. Use for parallelisable or long side-quests.',
  parameters: obj({ goal: str('Complete, self-contained instructions for the subagent'), max_steps: int('Step budget, 1-8 (default 5)') }, ['goal']),
  topLevelOnly: true,
  async run(args, ctx) {
    const r = await ctx.runSubtask(String(args.goal ?? ''), Math.min(Math.max(Number(args.max_steps) || 5, 1), 8));
    return { ok: r.ok, summary: r.ok ? 'Subtask finished' : 'Subtask failed', content: cap(r.summary, 6000) };
  },
};

export const scheduleTask: ToolDef = {
  name: 'schedule_task',
  description: 'Schedule a prompt to run as a background agent task later: once at a time, every N minutes (>=15), or daily at HH:MM in a timezone.',
  parameters: obj(
    {
      prompt: str('What the agent should do when it runs'),
      title: str('Short name'),
      kind: { type: 'string', enum: ['once', 'interval', 'daily'] },
      run_at: str('ISO 8601 datetime with offset, for kind=once'),
      every_minutes: int('Minutes between runs, for kind=interval (min 15)'),
      time_of_day: str('HH:MM 24h, for kind=daily'),
      timezone: str('IANA timezone (default Africa/Lagos)'),
    },
    ['prompt', 'kind'],
  ),
  confirm: true,
  topLevelOnly: true,
  syncScope: 'schedules',
  describe: (a) =>
    `Schedule “${a.title ?? String(a.prompt).slice(0, 60)}” ` +
    (a.kind === 'once' ? `for ${a.run_at}` : a.kind === 'interval' ? `every ${a.every_minutes} min` : `daily at ${a.time_of_day} ${a.timezone ?? 'Africa/Lagos'}`),
  async run(a, ctx) {
    const spec = { kind: a.kind, run_at: a.run_at ?? null, every_minutes: a.every_minutes ?? null, time_of_day: a.time_of_day ?? null, timezone: a.timezone ?? 'Africa/Lagos' };
    if (spec.kind === 'interval' && (spec.every_minutes ?? 0) < 15) return { ok: false, summary: 'Interval must be at least 15 minutes' };
    if (spec.kind === 'daily' && !/^[0-2]\d:[0-5]\d$/.test(spec.time_of_day ?? '')) return { ok: false, summary: 'time_of_day must be HH:MM' };
    const next = nextRun(spec);
    if (!next) return { ok: false, summary: 'That time is in the past' };
    const { data, error } = await ctx.db
      .from('scheduled_tasks')
      .insert({ owner_id: ctx.userId, title: a.title ?? null, prompt: a.prompt, ...spec, next_run_at: next.toISOString() })
      .select('id')
      .single();
    if (error) {
      const limit = /at most 10 active/i.test(error.message);
      return { ok: false, summary: limit ? 'You already have 10 active scheduled tasks. Pause or delete one in Settings first.' : 'Could not schedule the task' };
    }
    return { ok: true, summary: `Scheduled; next run ${next.toISOString()}`, content: `Scheduled task ${data.id}, next run ${next.toISOString()}` };
  },
};

export const listScheduledTasks: ToolDef = {
  name: 'list_scheduled_tasks',
  description: "List the user's scheduled background tasks.",
  parameters: obj({}),
  async run(_a, ctx) {
    const { data } = await ctx.db.from('scheduled_tasks').select('id, title, prompt, kind, next_run_at, enabled').eq('owner_id', ctx.userId).order('created_at');
    const rows = data ?? [];
    const lines = rows.map((r: any) => `- ${r.id} · ${r.title ?? String(r.prompt).slice(0, 60)} · ${r.kind} · ${r.enabled ? `next ${r.next_run_at ?? 'n/a'}` : 'paused'}`);
    return { ok: true, summary: `${rows.length} scheduled task(s)`, content: lines.join('\n') || 'No scheduled tasks.' };
  },
};

export const cancelScheduledTask: ToolDef = {
  name: 'cancel_scheduled_task',
  description: 'Delete a scheduled task by id.',
  parameters: obj({ id: str('Scheduled task id') }, ['id']),
  confirm: true,
  syncScope: 'schedules',
  describe: (a) => `Delete scheduled task ${a.id}`,
  async run(a, ctx) {
    const { error, count } = await ctx.db.from('scheduled_tasks').delete({ count: 'exact' }).eq('owner_id', ctx.userId).eq('id', a.id);
    return error || !count ? { ok: false, summary: 'Task not found' } : { ok: true, summary: 'Scheduled task deleted' };
  },
};

/**
 * Code execution interface. Off by default: Render free has no safe sandbox.
 * Enable with AGENT_ENABLE_CODE=true + E2B_API_KEY once an E2B (or similar) client is wired in.
 */
export const runCode: ToolDef = {
  name: 'run_code',
  description: 'Run a short Python or JavaScript snippet in an isolated cloud sandbox and return stdout/stderr.',
  parameters: obj({ language: { type: 'string', enum: ['python', 'javascript'] }, code: str('Code to run (max 20k chars)') }, ['language', 'code']),
  confirm: true,
  describe: (a) => `Run ${a.language} code in a sandbox (${String(a.code ?? '').length} chars)`,
  enabled: () => process.env.AGENT_ENABLE_CODE === 'true' && !!process.env.E2B_API_KEY,
  async run() {
    // TODO: E2B's sandbox API needs its SDK (sandbox create + envd process RPC); not wired in v1.
    return { ok: false, summary: 'Code execution is not wired up on this server yet' };
  },
};
