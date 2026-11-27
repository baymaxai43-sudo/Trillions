import { bool, cap, capTail, clamp, int, obj, str, strEnum, ToolContext, ToolDef, ToolResult } from './types';

const API = 'https://api.github.com';

async function gh(ctx: ToolContext, path: string, init: RequestInit & { accept?: string; raw?: boolean } = {}) {
  const cred = await ctx.connections.credential(ctx.userId, 'github');
  if (!cred) throw new Error('GitHub is not connected');
  const { accept, raw, ...rest } = init;
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...rest,
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(30_000)]),
    headers: {
      Authorization: `Bearer ${cred.accessToken}`,
      Accept: accept ?? 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'trillion-agent',
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = res.status === 204 ? null : raw ? await res.text().catch(() => '') : await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body: body as any };
}

const repo = { owner: str('Repository owner (user or org)'), repo: str('Repository name') };
const enc = encodeURIComponent;
const pathEnc = (p: string) => String(p).replace(/^\/+/, '').split('/').map(enc).join('/');
const R = (a: { owner: string; repo: string }) => `/repos/${enc(a.owner)}/${enc(a.repo)}`;
const fail = (r: { status: number; body: any }): ToolResult => {
  const msg = typeof r.body === 'object' ? r.body?.message : '';
  const hint =
    r.status === 404 ? ' (not found, or the token cannot see this repo: fine-grained tokens must include it)' :
    r.status === 403 ? ' (token lacks permission or rate limited)' :
    r.status === 409 ? ' (conflict: the branch moved or is empty)' :
    r.status === 422 ? ' (validation failed)' : '';
  return { ok: false, summary: `GitHub ${r.status}: ${msg || 'error'}${hint}`.slice(0, 300) };
};

async function defaultBranch(ctx: ToolContext, a: { owner: string; repo: string }): Promise<string> {
  const r = await gh(ctx, R(a));
  if (!r.ok) throw new Error(fail(r).summary);
  return r.body.default_branch;
}

const target = (a: any) => `${a.owner}/${a.repo}`;
const onBranch = (a: any) => (a.branch ? `branch ${a.branch}` : 'the DEFAULT branch directly');

export const githubTools: ToolDef[] = [
  // ---- Reads ------------------------------------------------------------------
  {
    name: 'github_list_repos',
    progress: () => 'Looking through your GitHub repos',
    provider: 'github',
    description: 'List repositories the token can access, most recently pushed first.',
    parameters: obj({ per_page: int('1-100, default 30'), owner: str('Only repos of this owner/org (optional)') }),
    async run(a, ctx) {
      const n = clamp(a.per_page, 30, 1, 100);
      const r = a.owner ? await gh(ctx, `/users/${enc(a.owner)}/repos?sort=pushed&per_page=${n}`) : await gh(ctx, `/user/repos?sort=pushed&per_page=${n}&affiliation=owner,collaborator,organization_member`);
      if (!r.ok) return fail(r);
      const lines = r.body.map((x: any) => `${x.full_name}${x.private ? ' (private)' : ''}${x.archived ? ' (archived)' : ''} · default ${x.default_branch} · ${x.language ?? '-'} · pushed ${x.pushed_at?.slice(0, 10)}${x.description ? ` · ${x.description}` : ''}`);
      return { ok: true, summary: `${lines.length} repositories`, content: cap(lines.join('\n')) };
    },
  },
  {
    name: 'github_get_repo',
    progress: (a) => `Looking at ${a.owner}/${a.repo}`,
    provider: 'github',
    description: 'Get repository details: default branch, visibility, language, topics, open issues, last push.',
    parameters: obj(repo, ['owner', 'repo']),
    async run(a, ctx) {
      const r = await gh(ctx, R(a));
      if (!r.ok) return fail(r);
      const x = r.body;
      const lines = [
        `${x.full_name} (${x.visibility ?? (x.private ? 'private' : 'public')})${x.archived ? ' ARCHIVED' : ''}`,
        x.description && `Description: ${x.description}`,
        `Default branch: ${x.default_branch}`,
        `Language: ${x.language ?? '-'} · Topics: ${(x.topics ?? []).join(', ') || '-'}`,
        `Open issues+PRs: ${x.open_issues_count} · Stars: ${x.stargazers_count} · Forks: ${x.forks_count}`,
        `Last push: ${x.pushed_at} · Size: ${x.size} KB`,
        `Permissions: ${Object.entries(x.permissions ?? {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'unknown'}`,
        `URL: ${x.html_url}`,
      ].filter(Boolean);
      return { ok: true, summary: `${x.full_name} · default ${x.default_branch}`, content: lines.join('\n') };
    },
  },
  {
    name: 'github_list_tree',
    progress: (a) => `Looking through ${a.repo}`,
    provider: 'github',
    description: 'List files in a repo (recursive tree, capped at 600 entries). Use first to understand a codebase. Optionally filter by a path prefix.',
    parameters: obj({ ...repo, ref: str('Branch, tag or SHA (default: default branch)'), path: str('Only paths under this prefix, e.g. "src/" (optional)') }, ['owner', 'repo']),
    async run(a, ctx) {
      const ref = a.ref || (await defaultBranch(ctx, a));
      const r = await gh(ctx, `${R(a)}/git/trees/${enc(ref)}?recursive=1`);
      if (!r.ok) return fail(r);
      const prefix = String(a.path ?? '').replace(/^\/+/, '');
      const all = (r.body.tree ?? []).filter((e: any) => !prefix || e.path.startsWith(prefix));
      const shown = all.slice(0, 600).map((e: any) => (e.type === 'tree' ? `${e.path}/` : `${e.path}${e.size != null ? `  (${e.size} B)` : ''}`));
      const note = all.length > 600 || r.body.truncated ? `\n…${all.length - shown.length} more entries not shown${r.body.truncated ? ' (GitHub truncated the tree)' : ''}; narrow with path.` : '';
      return { ok: true, summary: `${all.length} entries at ${ref}${prefix ? ` under ${prefix}` : ''}`, content: cap(shown.join('\n') + note, 16_000) };
    },
  },
  {
    name: 'github_get_file',
    progress: (a) => `Reading ${a.path}`,
    provider: 'github',
    description: 'Read a file (or list a directory) from a repo at a ref. For large files pass start_line/end_line.',
    parameters: obj(
      { ...repo, path: str('File or directory path'), ref: str('Branch, tag or SHA (optional)'), start_line: int('First line, 1-based (optional)'), end_line: int('Last line (optional)') },
      ['owner', 'repo', 'path'],
    ),
    async run(a, ctx) {
      const r = await gh(ctx, `${R(a)}/contents/${pathEnc(a.path)}${a.ref ? `?ref=${enc(a.ref)}` : ''}`);
      if (!r.ok) return fail(r);
      if (Array.isArray(r.body)) {
        return { ok: true, summary: `${r.body.length} entries in ${a.path}`, content: r.body.map((e: any) => `${e.type === 'dir' ? 'dir ' : 'file'}\t${e.path}`).join('\n') };
      }
      if (r.body.type !== 'file') return { ok: false, summary: `${a.path} is a ${r.body.type}` };
      let text: string;
      if (r.body.content) text = Buffer.from(r.body.content, 'base64').toString('utf8');
      else {
        // > 1 MB: contents API omits the body; fetch raw.
        const raw = await gh(ctx, `${R(a)}/contents/${pathEnc(a.path)}${a.ref ? `?ref=${enc(a.ref)}` : ''}`, { accept: 'application/vnd.github.raw+json', raw: true });
        if (!raw.ok) return fail(raw);
        text = String(raw.body);
      }
      if (text.includes('\u0000')) return { ok: true, summary: `${a.path} is binary (${r.body.size} bytes)`, content: 'Binary file; not shown.' };
      const lines = text.split('\n');
      const from = clamp(a.start_line, 1, 1, lines.length);
      const to = clamp(a.end_line, lines.length, from, lines.length);
      const body = lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(4)}  ${l}`).join('\n');
      return {
        ok: true,
        summary: `Read ${a.path} (${lines.length} lines${from > 1 || to < lines.length ? `, showing ${from}-${to}` : ''})`,
        content: cap(`${a.path} @ ${a.ref ?? 'default'} · blob ${r.body.sha}\n${body}`, 16_000),
      };
    },
  },
  {
    name: 'github_search_code',
    progress: (a) => `Searching ${a.repo} for “${a.query}”`,
    provider: 'github',
    description: 'Search code in a repo (GitHub code search on the default branch). Returns matching paths with snippets.',
    parameters: obj({ ...repo, query: str('Search terms, e.g. "createClient language:ts"'), per_page: int('1-30, default 15') }, ['owner', 'repo', 'query']),
    async run(a, ctx) {
      const q = `${a.query} repo:${a.owner}/${a.repo}`;
      const r = await gh(ctx, `/search/code?q=${enc(q)}&per_page=${clamp(a.per_page, 15, 1, 30)}`, { accept: 'application/vnd.github.text-match+json' });
      if (!r.ok) return fail(r);
      const lines = (r.body.items ?? []).map((i: any) => {
        const frag = (i.text_matches ?? []).map((m: any) => String(m.fragment).replace(/\s+/g, ' ').slice(0, 200)).slice(0, 2).join(' … ');
        return `${i.path}${frag ? `\n    ${frag}` : ''}`;
      });
      return { ok: true, summary: `${r.body.total_count ?? lines.length} match(es)`, content: cap(lines.join('\n') || 'No matches.') };
    },
  },
  {
    name: 'github_list_branches',
    progress: (a) => `Listing branches in ${a.repo}`,
    provider: 'github',
    description: 'List branches with their head commit SHA.',
    parameters: obj({ ...repo, per_page: int('1-100, default 50') }, ['owner', 'repo']),
    async run(a, ctx) {
      const r = await gh(ctx, `${R(a)}/branches?per_page=${clamp(a.per_page, 50, 1, 100)}`);
      if (!r.ok) return fail(r);
      const lines = r.body.map((b: any) => `${b.name} ${b.commit?.sha?.slice(0, 7)}${b.protected ? ' (protected)' : ''}`);
      return { ok: true, summary: `${lines.length} branch(es)`, content: lines.join('\n') };
    },
  },
  {
    name: 'github_list_pull_requests',
    progress: (a) => `Checking pull requests in ${a.repo}`,
    provider: 'github',
    description: 'List pull requests in a repository.',
    parameters: obj({ ...repo, state: strEnum(['open', 'closed', 'all']), per_page: int('1-50, default 20') }, ['owner', 'repo']),
    async run(a, ctx) {
      const r = await gh(ctx, `${R(a)}/pulls?state=${a.state ?? 'open'}&per_page=${clamp(a.per_page, 20, 1, 50)}`);
      if (!r.ok) return fail(r);
      const lines = r.body.map((p: any) => `#${p.number} ${p.title} [${p.draft ? 'draft' : p.state}${p.merged_at ? ', merged' : ''}] ${p.head?.ref} → ${p.base?.ref} by ${p.user?.login} · updated ${p.updated_at?.slice(0, 10)}`);
      return { ok: true, summary: `${lines.length} pull request(s)`, content: lines.join('\n') || 'None' };
    },
  },
  {
    name: 'github_get_pull_request',
    progress: (a) => `Reviewing PR #${a.number}`,
    provider: 'github',
    description: 'Get a pull request: description, status, mergeability, and changed files with their diffs (patches capped).',
    parameters: obj({ ...repo, number: int('PR number') }, ['owner', 'repo', 'number']),
    async run(a, ctx) {
      const [pr, files] = await Promise.all([gh(ctx, `${R(a)}/pulls/${Number(a.number)}`), gh(ctx, `${R(a)}/pulls/${Number(a.number)}/files?per_page=100`)]);
      if (!pr.ok) return fail(pr);
      if (!files.ok) return fail(files);
      const p = pr.body;
      const head = [
        `#${p.number} ${p.title}`,
        `${p.head?.ref} → ${p.base?.ref} · ${p.draft ? 'draft' : p.state}${p.merged ? ' (merged)' : ''} · mergeable: ${p.mergeable ?? 'unknown'} (${p.mergeable_state ?? '-'})`,
        `By ${p.user?.login} · +${p.additions} −${p.deletions} in ${p.changed_files} file(s) · head ${p.head?.sha?.slice(0, 7)}`,
        p.body ? `\n${String(p.body).slice(0, 2000)}` : '',
      ].join('\n');
      let budget = 14_000;
      const parts = files.body.map((f: any) => {
        const patch = f.patch ? String(f.patch) : '(no textual diff)';
        const take = patch.slice(0, Math.max(0, Math.min(budget, 3000)));
        budget -= take.length;
        return `--- ${f.filename} [${f.status}] +${f.additions} −${f.deletions}\n${take}${take.length < patch.length ? '\n…[patch truncated]' : ''}`;
      });
      return { ok: true, summary: `PR #${p.number}: ${p.changed_files} file(s), +${p.additions} −${p.deletions}`, content: cap(`${head}\n\n${parts.join('\n\n')}`, 18_000) };
    },
  },
  {
    name: 'github_list_issues',
    progress: (a) => `Checking issues in ${a.repo}`,
    provider: 'github',
    description: 'List issues (pull requests excluded).',
    parameters: obj({ ...repo, state: strEnum(['open', 'closed', 'all']), labels: str('Comma-separated labels (optional)'), per_page: int('1-50, default 20') }, ['owner', 'repo']),
    async run(a, ctx) {
      const q = new URLSearchParams({ state: a.state ?? 'open', per_page: String(clamp(a.per_page, 20, 1, 50)), ...(a.labels ? { labels: a.labels } : {}) });
      const r = await gh(ctx, `${R(a)}/issues?${q}`);
      if (!r.ok) return fail(r);
      const lines = r.body.filter((i: any) => !i.pull_request).map((i: any) => `#${i.number} ${i.title} [${i.state}] ${(i.labels ?? []).map((l: any) => l.name).join(',')} by ${i.user?.login}`);
      return { ok: true, summary: `${lines.length} issue(s)`, content: lines.join('\n') || 'None' };
    },
  },
  {
    name: 'github_list_workflow_runs',
    progress: () => 'Checking CI runs',
    provider: 'github',
    description: 'List recent GitHub Actions runs (CI), optionally for one branch or status.',
    parameters: obj({ ...repo, branch: str('Branch (optional)'), status: strEnum(['completed', 'in_progress', 'queued', 'failure', 'success']), per_page: int('1-30, default 10') }, ['owner', 'repo']),
    async run(a, ctx) {
      const q = new URLSearchParams({ per_page: String(clamp(a.per_page, 10, 1, 30)), ...(a.branch ? { branch: a.branch } : {}), ...(a.status ? { status: a.status } : {}) });
      const r = await gh(ctx, `${R(a)}/actions/runs?${q}`);
      if (!r.ok) return fail(r);
      const lines = (r.body.workflow_runs ?? []).map((w: any) => `${w.id} · ${w.name} · ${w.head_branch}@${w.head_sha?.slice(0, 7)} · ${w.status}${w.conclusion ? `/${w.conclusion}` : ''} · ${w.event} · ${w.created_at}`);
      return { ok: true, summary: `${lines.length} workflow run(s)`, content: lines.join('\n') || 'No runs.' };
    },
  },
  {
    name: 'github_get_run_logs',
    progress: () => 'Reading the CI logs',
    provider: 'github',
    description: 'For a workflow run: list its jobs and return the log tail of failed jobs (max 3 jobs, capped). Use to diagnose CI failures.',
    parameters: obj({ ...repo, run_id: int('Workflow run id') }, ['owner', 'repo', 'run_id']),
    async run(a, ctx) {
      const jobs = await gh(ctx, `${R(a)}/actions/runs/${Number(a.run_id)}/jobs?per_page=50`);
      if (!jobs.ok) return fail(jobs);
      const list: any[] = jobs.body.jobs ?? [];
      const summary = list.map((j) => {
        const failedSteps = (j.steps ?? []).filter((s: any) => s.conclusion === 'failure').map((s: any) => s.name);
        return `${j.name}: ${j.status}${j.conclusion ? `/${j.conclusion}` : ''}${failedSteps.length ? ` (failed: ${failedSteps.join(', ')})` : ''}`;
      });
      const failed = list.filter((j) => j.conclusion === 'failure' || j.conclusion === 'timed_out').slice(0, 3);
      const logs: string[] = [];
      for (const j of failed) {
        const l = await gh(ctx, `${R(a)}/actions/jobs/${j.id}/logs`, { raw: true, accept: 'application/vnd.github+json' });
        const text = l.ok ? String(l.body).replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /gm, '') : `(logs unavailable: HTTP ${l.status})`;
        logs.push(`===== ${j.name} (last lines) =====\n${capTail(text, 5000)}`);
      }
      return {
        ok: true,
        summary: `${list.length} job(s), ${failed.length} failed`,
        content: cap(`Jobs:\n${summary.join('\n')}${logs.length ? `\n\n${logs.join('\n\n')}` : ''}`, 18_000),
      };
    },
  },

  // ---- Writes (approval required) ---------------------------------------------
  {
    name: 'github_create_branch',
    progress: (a) => `Creating branch ${a.branch}`,
    provider: 'github',
    confirm: true,
    description: 'Create a branch from another branch (default: the repo default branch). Do this before committing changes.',
    parameters: obj({ ...repo, branch: str('New branch name, e.g. fix/login-timeout'), from: str('Base branch (optional)') }, ['owner', 'repo', 'branch']),
    describe: (a) => `Create branch ${a.branch} in ${target(a)} from ${a.from ?? 'the default branch'}`,
    async run(a, ctx) {
      const from = a.from || (await defaultBranch(ctx, a));
      const base = await gh(ctx, `${R(a)}/git/ref/heads/${pathEnc(from)}`);
      if (!base.ok) return fail(base);
      const r = await gh(ctx, `${R(a)}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${a.branch}`, sha: base.body.object.sha }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Created ${a.branch} from ${from} (${base.body.object.sha.slice(0, 7)})` };
    },
  },
  {
    name: 'github_create_or_update_file',
    progress: () => 'Preparing the commit',
    provider: 'github',
    confirm: true,
    description: 'Create or overwrite ONE file with a commit. For several files use github_commit_files. Prefer a feature branch over the default branch.',
    parameters: obj({ ...repo, path: str('File path'), content: str('Full new file content'), message: str('Commit message'), branch: str('Branch (default: repo default)') }, ['owner', 'repo', 'path', 'content', 'message']),
    describe: (a) => `Commit ${a.path} to ${target(a)} on ${onBranch(a)}: “${a.message}”`,
    async run(a, ctx) {
      const base = `${R(a)}/contents/${pathEnc(a.path)}`;
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
    name: 'github_commit_files',
    progress: () => 'Preparing the commit',
    provider: 'github',
    confirm: true,
    description:
      'Create, update or delete several files in ONE commit on a branch (git data API). Max 50 files / 1 MB. ' +
      'Each file: {path, content} to write, or {path, delete: true}. The branch must exist (use github_create_branch).',
    parameters: obj(
      {
        ...repo,
        branch: str('Target branch (must exist)'),
        message: str('Commit message'),
        files: {
          type: 'array',
          items: obj({ path: str('File path'), content: str('Full new content'), delete: bool('Delete this file') }, ['path']),
        },
      },
      ['owner', 'repo', 'branch', 'message', 'files'],
    ),
    describe: (a) => {
      const files: any[] = Array.isArray(a.files) ? a.files : [];
      const del = files.filter((f) => f.delete).length;
      const list = files.slice(0, 6).map((f) => `${f.delete ? '−' : '•'} ${f.path}`).join('\n');
      return `Commit ${files.length} file(s)${del ? ` (${del} deleted)` : ''} to ${target(a)} on branch ${a.branch}: “${a.message}”\n${list}${files.length > 6 ? `\n…and ${files.length - 6} more` : ''}`;
    },
    async run(a, ctx) {
      const files: { path: string; content?: string; delete?: boolean }[] = Array.isArray(a.files) ? a.files : [];
      if (!files.length) return { ok: false, summary: 'No files given' };
      if (files.length > 50) return { ok: false, summary: 'Too many files (max 50 per commit)' };
      const bytes = files.reduce((n, f) => n + Buffer.byteLength(String(f.content ?? ''), 'utf8'), 0);
      if (bytes > 1_000_000) return { ok: false, summary: 'Commit is larger than 1 MB' };
      const ref = await gh(ctx, `${R(a)}/git/ref/heads/${pathEnc(a.branch)}`);
      if (!ref.ok) return fail(ref);
      const parent = ref.body.object.sha as string;
      const commit = await gh(ctx, `${R(a)}/git/commits/${parent}`);
      if (!commit.ok) return fail(commit);
      const tree = files.map((f) => {
        const path = String(f.path).replace(/^\/+/, '');
        return f.delete ? { path, mode: '100644', type: 'blob', sha: null } : { path, mode: '100644', type: 'blob', content: String(f.content ?? '') };
      });
      const t = await gh(ctx, `${R(a)}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: commit.body.tree.sha, tree }) });
      if (!t.ok) return fail(t);
      const c = await gh(ctx, `${R(a)}/git/commits`, { method: 'POST', body: JSON.stringify({ message: a.message, tree: t.body.sha, parents: [parent] }) });
      if (!c.ok) return fail(c);
      // Not forced: if the branch moved since we read it, GitHub rejects instead of dropping commits.
      const u = await gh(ctx, `${R(a)}/git/refs/heads/${pathEnc(a.branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: c.body.sha, force: false }) });
      if (!u.ok) return fail(u);
      return { ok: true, summary: `Committed ${files.length} file(s) to ${a.branch} (${c.body.sha.slice(0, 7)})`, content: c.body.html_url };
    },
  },
  {
    name: 'github_create_pull_request',
    progress: () => 'Opening the pull request',
    provider: 'github',
    confirm: true,
    description: 'Open a pull request from head branch into base branch. Write a clear description: what, why, how it was verified, risks.',
    parameters: obj({ ...repo, title: str('PR title'), head: str('Source branch'), base: str('Target branch'), body: str('PR description (markdown)'), draft: bool('Open as draft') }, ['owner', 'repo', 'title', 'head', 'base']),
    describe: (a) => `Open ${a.draft ? 'draft ' : ''}PR “${a.title}” ${a.head} → ${a.base} in ${target(a)}`,
    async run(a, ctx) {
      const r = await gh(ctx, `${R(a)}/pulls`, { method: 'POST', body: JSON.stringify({ title: a.title, head: a.head, base: a.base, body: a.body ?? '', draft: !!a.draft }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Opened PR #${r.body.number}`, content: r.body.html_url };
    },
  },
  {
    name: 'github_comment',
    progress: () => 'Posting the comment',
    provider: 'github',
    confirm: true,
    description: 'Post a comment on an issue or pull request (public to everyone who can see the repo).',
    parameters: obj({ ...repo, number: int('Issue or PR number'), body: str('Comment (markdown)') }, ['owner', 'repo', 'number', 'body']),
    describe: (a) => `Comment on #${a.number} in ${target(a)}: “${String(a.body).slice(0, 140)}${String(a.body).length > 140 ? '…' : ''}”`,
    async run(a, ctx) {
      const r = await gh(ctx, `${R(a)}/issues/${Number(a.number)}/comments`, { method: 'POST', body: JSON.stringify({ body: a.body }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Commented on #${a.number}`, content: r.body.html_url };
    },
  },
  {
    name: 'github_create_issue',
    progress: () => 'Opening the issue',
    provider: 'github',
    confirm: true,
    description: 'Open an issue in a GitHub repository.',
    parameters: obj({ ...repo, title: str('Issue title'), body: str('Issue body (markdown)'), labels: { type: 'array', items: { type: 'string' } } }, ['owner', 'repo', 'title']),
    describe: (a) => `Open issue “${a.title}” in ${target(a)}`,
    async run(a, ctx) {
      const r = await gh(ctx, `${R(a)}/issues`, { method: 'POST', body: JSON.stringify({ title: a.title, body: a.body ?? '', ...(Array.isArray(a.labels) ? { labels: a.labels } : {}) }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Opened issue #${r.body.number}`, content: r.body.html_url };
    },
  },
  {
    name: 'github_merge_pull_request',
    progress: (a) => `Merging PR #${a.number}`,
    provider: 'github',
    confirm: true,
    description: 'Merge a pull request. Check CI (github_list_workflow_runs) and mergeability first.',
    parameters: obj({ ...repo, number: int('PR number'), method: strEnum(['squash', 'merge', 'rebase'], 'Default squash'), sha: str('Expected head SHA (optional safety check)') }, ['owner', 'repo', 'number']),
    describe: (a) => `MERGE PR #${a.number} in ${target(a)} (${a.method ?? 'squash'})`,
    async run(a, ctx) {
      const r = await gh(ctx, `${R(a)}/pulls/${Number(a.number)}/merge`, { method: 'PUT', body: JSON.stringify({ merge_method: a.method ?? 'squash', ...(a.sha ? { sha: a.sha } : {}) }) });
      if (!r.ok) return fail(r);
      return { ok: true, summary: `Merged #${a.number} (${String(r.body.sha).slice(0, 7)})` };
    },
  },
];
