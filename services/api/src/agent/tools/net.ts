import { lookup as dnsLookup } from 'dns/promises';
import http from 'http';
import https from 'https';
import { isIP, LookupFunction } from 'net';
import ipaddr from 'ipaddr.js';

/**
 * SSRF-safe HTTP client for fetching arbitrary public URLs.
 * - Only globally routable unicast addresses (ipaddr.js range === 'unicast'): rejects loopback, private,
 *   link-local, CGNAT, multicast, reserved/documentation, benchmarking, unique-local, NAT64 (64:ff9b::/96),
 *   6to4, Teredo, and IPv4-mapped IPv6 that maps to any of the above.
 * - DNS is resolved once and the socket is pinned to the checked address (no rebinding window).
 * - Redirects are followed manually and every hop is re-checked.
 */

export function isPublicAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  const addr = ipaddr.process(ip); // unwraps IPv4-mapped IPv6 (::ffff:a.b.c.d) to IPv4
  if (addr.range() !== 'unicast') return false;
  if (addr.kind() === 'ipv6') {
    const v6 = addr as ipaddr.IPv6;
    // Deprecated site-local fec0::/10 and anything outside global unicast 2000::/3.
    if (!v6.match(ipaddr.IPv6.parse('2000::'), 3)) return false;
  }
  return true;
}

export interface Target {
  url: URL;
  address: string;
  family: 4 | 6;
}

/** Validates the URL and resolves its host to one checked public address. */
export async function resolvePublic(raw: string | URL): Promise<Target> {
  let u: URL;
  try {
    u = new URL(String(raw));
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http and https URLs are allowed');
  if (u.username || u.password) throw new Error('URLs with credentials are not allowed');
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw new Error('Only standard web ports are allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) throw new Error('Private hosts are blocked');
  let addrs: { address: string; family: number }[];
  if (isIP(host)) addrs = [{ address: host, family: isIP(host) }];
  else {
    try {
      addrs = await dnsLookup(host, { all: true, verbatim: true });
    } catch {
      throw new Error(`Could not resolve ${host}`);
    }
  }
  if (!addrs.length) throw new Error(`Could not resolve ${host}`);
  // Every record must be public: a mixed answer is a classic rebinding setup.
  if (addrs.some((a) => !isPublicAddress(a.address))) throw new Error('Private network addresses are blocked');
  const pick = addrs.find((a) => a.family === 4) ?? addrs[0];
  return { url: u, address: pick.address, family: pick.family === 6 ? 6 : 4 };
}

export interface SafeResponse {
  status: number;
  url: URL;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
}

function requestOnce(t: Target, opts: { signal: AbortSignal; headers: Record<string, string>; maxBytes: number }): Promise<SafeResponse & { location?: string }> {
  const pinned: LookupFunction = (_host, options, cb) => {
    const o = options as { all?: boolean };
    if (o?.all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: t.address, family: t.family }]);
    else cb(null, t.address, t.family);
  };
  const mod = t.url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      t.url,
      { method: 'GET', headers: opts.headers, lookup: pinned, signal: opts.signal, agent: false, timeout: 15_000 },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(', ') : String(v);
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && headers.location) {
          res.resume();
          return resolve({ status, url: t.url, headers, body: '', truncated: false, location: headers.location });
        }
        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;
        res.on('data', (c: Buffer) => {
          if (truncated) return;
          total += c.length;
          chunks.push(c);
          if (total >= opts.maxBytes) {
            truncated = true;
            res.destroy();
            resolve({ status, url: t.url, headers, body: Buffer.concat(chunks).subarray(0, opts.maxBytes).toString('utf8'), truncated });
          }
        });
        res.on('end', () => !truncated && resolve({ status, url: t.url, headers, body: Buffer.concat(chunks).toString('utf8'), truncated }));
        res.on('error', (e) => !truncated && reject(e));
      },
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    req.end();
  });
}

/** GET a public URL with pinned DNS, re-checking every redirect hop (max 4). */
export async function safeGet(raw: string, opts: { signal: AbortSignal; headers?: Record<string, string>; maxBytes?: number }): Promise<SafeResponse> {
  let target = await resolvePublic(raw);
  const headers = { 'User-Agent': 'TRILLION-Agent/0.2 (+https://trillionagent.vercel.app)', Accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.5', ...(opts.headers ?? {}) };
  for (let hop = 0; hop <= 4; hop++) {
    const r = await requestOnce(target, { signal: opts.signal, headers, maxBytes: opts.maxBytes ?? 1_000_000 });
    if (!r.location) return r;
    if (hop === 4) throw new Error('Too many redirects');
    target = await resolvePublic(new URL(r.location, target.url));
  }
  throw new Error('Too many redirects');
}

/** origin + path, no query or fragment, lowercase host: the identity used to compare URLs. */
export function urlKey(raw: string): string | null {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return null;
  }
}
