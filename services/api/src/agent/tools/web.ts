import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { cap, int, obj, str, ToolDef } from './types';

const MAX_BYTES = 1_000_000;

function isPrivate(ip: string): boolean {
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const l = ip.toLowerCase();
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb');
}

/** Rejects non-http(s) URLs and hosts that resolve to private/loopback/link-local ranges (SSRF guard). */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http and https URLs are allowed');
  if (u.username || u.password) throw new Error('URLs with credentials are not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Private hosts are blocked');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivate(a.address))) throw new Error('Private network addresses are blocked');
  return u;
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  const text = html
    .replace(/<(script|style|noscript|svg|head|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, text };
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    chunks.push(value);
    if (total >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

export const fetchUrl: ToolDef = {
  name: 'fetch_url',
  description: 'Fetch a public web page or text/JSON resource and return its readable text (HTML is stripped). Use for reading specific URLs.',
  parameters: obj({ url: str('Absolute http(s) URL'), max_chars: int('Max characters to return (default 8000, max 20000)') }, ['url']),
  async run(args, ctx) {
    let url = await assertPublicUrl(String(args.url));
    let res: Response | undefined;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(15_000)]),
        headers: { 'User-Agent': 'TRILLION-Agent/0.1 (+https://trillion.app)', Accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.5' },
      });
      const loc = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && loc) {
        url = await assertPublicUrl(new URL(loc, url).toString()); // re-check every hop
        continue;
      }
      break;
    }
    if (!res) return { ok: false, summary: 'No response' };
    const type = res.headers.get('content-type') ?? '';
    if (!/text|json|xml|javascript/.test(type) && type) return { ok: false, summary: `Unsupported content type ${type}` };
    const body = await readCapped(res);
    const max = Math.min(Number(args.max_chars) || 8000, 20_000);
    const { title, text } = /html/.test(type) ? htmlToText(body) : { title: '', text: body };
    return {
      ok: res.ok,
      summary: `${res.status} ${title || url.hostname} (${text.length.toLocaleString()} chars)`,
      content: cap(`URL: ${url}\nStatus: ${res.status}\nTitle: ${title}\n\n${text}`, max),
    };
  },
};

export const webSearch: ToolDef = {
  name: 'web_search',
  description: 'Search the web for current information. Returns titles, URLs and snippets; follow up with fetch_url to read a page.',
  parameters: obj({ query: str('Search query'), max_results: int('1-8, default 5') }, ['query']),
  enabled: () => !!(process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY),
  async run(args, ctx) {
    const n = Math.min(Math.max(Number(args.max_results) || 5, 1), 8);
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(15_000)]);
    let results: { title: string; url: string; snippet: string }[] = [];
    if (process.env.TAVILY_API_KEY) {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
        body: JSON.stringify({ query: args.query, max_results: n, search_depth: 'basic' }),
      });
      if (!res.ok) return { ok: false, summary: `Search failed (${res.status})` };
      const b = (await res.json()) as any;
      results = (b.results ?? []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content }));
    } else {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: args.query, count: String(n) })}`, {
        signal,
        headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY! },
      });
      if (!res.ok) return { ok: false, summary: `Search failed (${res.status})` };
      const b = (await res.json()) as any;
      results = (b.web?.results ?? []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.description }));
    }
    return {
      ok: true,
      summary: `${results.length} results for “${args.query}”`,
      content: cap(results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${(r.snippet ?? '').replace(/<[^>]+>/g, '')}`).join('\n\n')),
    };
  },
};
