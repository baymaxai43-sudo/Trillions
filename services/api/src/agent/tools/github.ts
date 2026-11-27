import { cap, int, obj, str, ToolContext, ToolDef } from './types';

async function gh(ctx: ToolContext, path: string, init: RequestInit = {}) {
  const cred = await ctx.connections.credential(ctx.userId, 'github');
  if (!cred) throw new Error('GitHub is not connected');
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    signal: ctx.signal,
    headers: {
      Authorization: `Bearer ${cred.accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'trillion-agent',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body: body as any };
}

const repo = { owner: str('Repository owner'), repo: str('Repository name') };
const enc = encodeURIComponent;
const pathEnc = (p: string) => p.split('/').map(enc).join('/');
const fail = (r: { status: number; body: any }) => ({ ok: false, summary: `GitHub ${r.status}: ${r.body?.message ?? 'error'}` });

export const githubTools: ToolDef[] = [
  {
    name: 'github_list_repos',
    provider: 'github',
    description: "List the user's GitHub repositories, most recently updated first.",
    parameters: obj({ per_page: int('1-50, default 20') }),
    async run(a, ctx) {
      const r = await gh(ctx, `/user/repos?sort=updated&per_page=${Math.min(Number(a.per_page) || 20, 50)}`);
      if (!r.ok) return fail(r);
      const lines = r.body.map((x: any) => `${x.full_name}${x.private ? ' (private)' : ''} · default ${x.default_branch} · ${x.description ?? ''}`);
      return { ok: true, summary: `${lines.length} repositories`, content: lines.join('\n') };
    },
  },
  {
    name: 'github_get_file',
    provider: 'github',
    description: 'Read a file (or list a directory) from a GitHub repository.',
    parameters: obj({ ...repo, path: str('File or directory path'), ref: str('Branch, tag or SHA (optional)') }, ['owner', 'repo', 'path']),
    async run(a, ctx) {
      const r = await gh(ctx, `/repos/${enc(a.owner)}/${enc(a.repo)}/contents/${pathEnc(a.path)}${a.ref ? `?ref=${enc(a.ref)}` : ''}`);
      if (!r.ok) return fail(r);
      if (Array.isArray(r.body)) {
        return { ok: true, summary: `${r.body.length} entries in ${a.path}`, content: r.body.map((e: any) => `${e.type}\t${e.path}`).join('\n') };
      }
      const text = Buffer.from(r.body.content ?? '', 'base64').toString('utf8');
      return { ok: true, summary: `Read ${a.path} (${r.body.size} bytes)`, content: cap(text, 15_000) };
    },
  },
  {
    name: 'github_create_or_update_file',
    provider: 'github',
    confirm: true,
    description: 'Create or overwrite a file in a GitHub repo with a commit.',
    parameters: obj({ ...repo, path: str('File path'), content: str('Full new file content'), message: str('Commit message'), branch: str('Branch (default: repo default)') }, ['owner', 'repo', 'path', 'content', 'message']),
    describe: (a) => `Commit ${a.path} to ${a.owner}/${a.repo}${a.branch ? `@${a.branch}` : ''}: “${a.message}”`,
    async run(a, ctx) {
      const base = `/repos/${enc(a.owner)}/${enc(a.repo)}/contents/${pathEnc(a.path)}`;
      const existing = await gh(ctx, `${base}${a.branch ? `?ref=${enc(a.branch)}` : ''}`);
      const r = await gh(ctx, base, {
        method: 'PUT',
        body: JSON.stringify({
          message: a.message,
          content: Buffer.from(String(a.content), 'utf8').toString('base64'),
          ...(a.branch ? { branch: a.branch } : {}),
          ...(existing.ok && existing.body?.sha ? { sha: existing.body.sha } : {}),
        }),
      });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `${existing.ok ? 'Updated' : 'Created'} ${a.path} (${r.body.commit?.sha?.slice(0, 7)})`, content: r.body.content?.html_url };
    },
  },
  {
    name: 'github_create_issue',
    provider: 'github',
    confirm: true,
    description: 'Open an issue in a GitHub repository.',
    parameters: obj({ ...repo, title: str('Issue title'), body: str('Issue body (markdown)') }, ['owner', 'repo', 'title']),
    describe: (a) => `Open issue “${a.title}” in ${a.owner}/${a.repo}`,
    async run(a, ctx) {
      const r = await gh(ctx, `/repos/${enc(a.owner)}/${enc(a.repo)}/issues`, { method: 'POST', body: JSON.stringify({ title: a.title, body: a.body ?? '' }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Opened issue #${r.body.number}`, content: r.body.html_url };
    },
  },
  {
    name: 'github_list_pull_requests',
    provider: 'github',
    description: 'List pull requests in a repository.',
    parameters: obj({ ...repo, state: { type: 'string', enum: ['open', 'closed', 'all'] } }, ['owner', 'repo']),
    async run(a, ctx) {
      const r = await gh(ctx, `/repos/${enc(a.owner)}/${enc(a.repo)}/pulls?state=${a.state ?? 'open'}&per_page=20`);
      if (!r.ok) return fail(r);
      const lines = r.body.map((p: any) => `#${p.number} ${p.title} [${p.state}] ${p.head?.ref} → ${p.base?.ref} by ${p.user?.login}`);
      return { ok: true, summary: `${lines.length} pull request(s)`, content: lines.join('\n') || 'None' };
    },
  },
  {
    name: 'github_create_pull_request',
    provider: 'github',
    confirm: true,
    description: 'Open a pull request from head branch into base branch.',
    parameters: obj({ ...repo, title: str('PR title'), head: str('Source branch'), base: str('Target branch'), body: str('PR description') }, ['owner', 'repo', 'title', 'head', 'base']),
    describe: (a) => `Open PR “${a.title}” ${a.head} → ${a.base} in ${a.owner}/${a.repo}`,
    async run(a, ctx) {
      const r = await gh(ctx, `/repos/${enc(a.owner)}/${enc(a.repo)}/pulls`, { method: 'POST', body: JSON.stringify({ title: a.title, head: a.head, base: a.base, body: a.body ?? '' }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Opened PR #${r.body.number}`, content: r.body.html_url };
    },
  },
];
