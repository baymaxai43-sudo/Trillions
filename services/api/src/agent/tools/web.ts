import { safeGet, urlKey } from './net';
import { cap, int, obj, str, ToolDef } from './types';

export { isPublicAddress, resolvePublic } from './net';

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

/** After private data entered the run, a URL the model made up could carry it out (query string, path). */
const isKnown = (raw: string, known: Set<string>) => {
  const k = urlKey(raw);
  return !!k && known.has(k);
};

export const fetchUrl: ToolDef = {
  name: 'fetch_url',
  description:
    'Fetch a public web page or text/JSON resource and return its readable text (HTML is stripped). Use for reading specific URLs. ' +
    'After private data has been read in this run, URLs that did not come from web_search or the user need approval and lose their query string.',
  parameters: obj({ url: str('Absolute http(s) URL'), max_chars: int('Max characters to return (default 8000, max 20000)') }, ['url']),
  private: false,
  needsConfirm: (a, sec) => (sec.touchedPrivate && !isKnown(String(a.url), sec.knownUrls) ? 'This run has read private data, and this URL did not come from a search result.' : false),
  describe: (a) => `Open ${String(a.url).slice(0, 200)}`,
  async run(args, ctx) {
    let raw = String(args.url ?? '');
    if (ctx.security.touchedPrivate && !isKnown(raw, ctx.security.knownUrls)) {
      try {
        const u = new URL(raw);
        u.search = '';
        u.hash = '';
        raw = u.toString();
      } catch {
        /* safeGet reports the bad URL */
      }
    }
    ctx.security.usedWeb = true;
    const res = await safeGet(raw, { signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(20_000)]) });
    const type = res.headers['content-type'] ?? '';
    if (type && !/text|json|xml|javascript/.test(type)) return { ok: false, summary: `Unsupported content type ${type.split(';')[0]}` };
    const max = Math.min(Number(args.max_chars) || 8000, 20_000);
    const { title, text } = /html/.test(type) ? htmlToText(res.body) : { title: '', text: res.body };
    const ok = res.status >= 200 && res.status < 300;
    return {
      ok,
      summary: `${res.status} ${title.slice(0, 80) || res.url.hostname} (${text.length.toLocaleString()} chars)`,
      content: cap(`URL: ${res.url}\nStatus: ${res.status}\nTitle: ${title}\n\n${text}`, max),
    };
  },
};

export const webSearch: ToolDef = {
  name: 'web_search',
  description: 'Search the web for current information. Returns titles, URLs and snippets; follow up with fetch_url to read a page.',
  parameters: obj({ query: str('Search query'), max_results: int('1-8, default 5') }, ['query']),
  private: false,
  enabled: () => !!(process.env.TAVILY_API_KEY || process.env.BRAVE_API_KEY),
  async run(args, ctx) {
    const n = Math.min(Math.max(Number(args.max_results) || 5, 1), 8);
    const signal = AbortSignal.any([ctx.signal, AbortSignal.timeout(15_000)]);
    ctx.security.usedWeb = true;
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
    for (const r of results) {
      const k = urlKey(r.url);
      if (k) ctx.security.knownUrls.add(k);
    }
    return {
      ok: true,
      summary: `${results.length} results for “${String(args.query).slice(0, 80)}”`,
      content: cap(results.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${(r.snippet ?? '').replace(/<[^>]+>/g, '')}`).join('\n\n')),
    };
  },
};
