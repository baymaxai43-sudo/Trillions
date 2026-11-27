import { cap, int, obj, str, ToolContext, ToolDef } from './types';

async function gmail(ctx: ToolContext, path: string, init: RequestInit = {}) {
  const cred = await ctx.connections.credential(ctx.userId, 'google');
  if (!cred) throw new Error('Gmail is not connected');
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    signal: ctx.signal,
    headers: { Authorization: `Bearer ${cred.accessToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => null)) as any };
}

const header = (m: any, name: string) => m.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

function bodyText(part: any): string {
  if (!part) return '';
  if (part.mimeType === 'text/plain' && part.body?.data) return b64url(part.body.data);
  for (const p of part.parts ?? []) {
    const t = bodyText(p);
    if (t) return t;
  }
  if (part.mimeType === 'text/html' && part.body?.data) return b64url(part.body.data).replace(/<[^>]+>/g, ' ');
  return '';
}

/** Strip CR/LF so header values can't inject extra headers. */
const clean = (s: string) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

/**
 * Disabled: Gmail needs OAuth (access tokens expire hourly; there is no long-lived pasteable token),
 * and connectors are token-only now. Kept so it can return behind a proper OAuth flow later.
 */
const googleEnabled = () => false;

const gmailTools: ToolDef[] = [
  {
    name: 'gmail_search',
    provider: 'google',
    description: 'Search the user\'s Gmail with Gmail query syntax (e.g. "from:alice newer_than:7d"). Returns sender, subject, date, snippet and id.',
    parameters: obj({ query: str('Gmail search query'), max: int('1-15, default 8') }, ['query']),
    async run(a, ctx) {
      const list = await gmail(ctx, `/messages?${new URLSearchParams({ q: a.query, maxResults: String(Math.min(Number(a.max) || 8, 15)) })}`);
      if (!list.ok) return { ok: false, summary: `Gmail ${list.status}` };
      const ids: string[] = (list.body.messages ?? []).map((m: any) => m.id);
      const rows = await Promise.all(
        ids.map(async (id) => {
          const m = await gmail(ctx, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
          return m.ok ? `id ${id} | ${header(m.body, 'Date')} | ${header(m.body, 'From')} | ${header(m.body, 'Subject')}\n  ${m.body.snippet ?? ''}` : `id ${id} (unreadable)`;
        }),
      );
      return { ok: true, summary: `${ids.length} email(s) for “${a.query}”`, content: rows.join('\n') || 'No results' };
    },
  },
  {
    name: 'gmail_read',
    provider: 'google',
    description: 'Read one email by id (from gmail_search).',
    parameters: obj({ id: str('Message id') }, ['id']),
    async run(a, ctx) {
      const m = await gmail(ctx, `/messages/${encodeURIComponent(a.id)}?format=full`);
      if (!m.ok) return { ok: false, summary: `Gmail ${m.status}` };
      const subject = header(m.body, 'Subject');
      return {
        ok: true,
        summary: `Read “${subject}”`,
        content: cap(`From: ${header(m.body, 'From')}\nTo: ${header(m.body, 'To')}\nDate: ${header(m.body, 'Date')}\nSubject: ${subject}\n\n${bodyText(m.body.payload)}`, 12_000),
      };
    },
  },
  {
    name: 'gmail_send',
    provider: 'google',
    confirm: true,
    description: 'Send a plain-text email from the user\'s Gmail. Always requires the user\'s approval.',
    parameters: obj({ to: str('Recipient address(es), comma-separated'), subject: str('Subject'), body: str('Plain-text body'), cc: str('CC (optional)') }, ['to', 'subject', 'body']),
    describe: (a) => `Send email to ${a.to}${a.cc ? ` (cc ${a.cc})` : ''}: “${a.subject}”`,
    async run(a, ctx) {
      const raw = [
        `To: ${clean(a.to)}`,
        ...(a.cc ? [`Cc: ${clean(a.cc)}`] : []),
        `Subject: =?UTF-8?B?${Buffer.from(clean(a.subject)).toString('base64')}?=`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(String(a.body)).toString('base64'),
      ].join('\r\n');
      const r = await gmail(ctx, '/messages/send', { method: 'POST', body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }) });
      return r.ok ? { ok: true, summary: `Sent to ${a.to}` } : { ok: false, summary: `Gmail ${r.status}: ${r.body?.error?.message ?? 'send failed'}` };
    },
  },
];

export const googleTools: ToolDef[] = gmailTools.map((t) => ({ ...t, enabled: googleEnabled, private: true }));
