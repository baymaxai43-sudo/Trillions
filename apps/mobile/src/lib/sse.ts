import { fetch as expoFetch } from 'expo/fetch';
import { API, authHeader } from './api';

export type SseClose = { reason: 'end' | 'error'; status?: number; message?: string };

export type SseHandlers = {
  onEvent: (ev: any) => void;
  /** First response arrived (server is awake). */
  onOpen?: () => void;
  /** Stream finished or failed. Not called after stop(). */
  onClose?: (info: SseClose) => void;
};

export type SseOptions = {
  /** Give up waiting for the server's first byte after this long (Render cold start is up to ~60s). */
  firstByteTimeoutMs?: number;
  /** Retries when nothing came back yet (network error, 502/503/504 while the server boots). */
  retries?: number;
};

const RETRYABLE = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pings /health so a sleeping free-tier server starts booting. Never throws. */
export async function wakeServer(timeoutMs = 70_000): Promise<boolean> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}/health`, { signal: ac.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

function parseLine(line: string, onEvent: (ev: any) => void) {
  const l = line.endsWith('\r') ? line.slice(0, -1) : line;
  if (!l.startsWith('data:')) return;
  const payload = l.slice(l.startsWith('data: ') ? 6 : 5).trim();
  if (!payload || payload === '[DONE]') return;
  try {
    onEvent(JSON.parse(payload));
  } catch {
    // Partial/garbled line: ignore.
  }
}

/**
 * Opens an SSE stream with streaming `fetch` from expo/fetch (reliable on Android, unlike XHR progress).
 * Returns stop(), which only detaches this client; agent runs keep going server-side.
 */
export function openSse(
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  h: SseHandlers,
  opts: SseOptions = {},
): () => void {
  const firstByteTimeoutMs = opts.firstByteTimeoutMs ?? 90_000;
  const retries = opts.retries ?? 1;
  let stopped = false;
  let current: AbortController | null = null;
  let closed = false;
  const close = (info: SseClose) => {
    if (stopped || closed) return;
    closed = true;
    h.onClose?.(info);
  };

  const attempt = async (n: number): Promise<void> => {
    const ac = new AbortController();
    current = ac;
    let opened = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      if (!opened) {
        timedOut = true;
        ac.abort();
      }
    }, firstByteTimeoutMs);
    const markOpen = () => {
      if (opened) return;
      opened = true;
      clearTimeout(timer);
      h.onOpen?.();
    };

    try {
      const headers: Record<string, string> = { Authorization: await authHeader(), Accept: 'text/event-stream' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await expoFetch(`${API}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ac.signal,
      });
      if (stopped) return;

      if (!res.ok) {
        clearTimeout(timer);
        if (RETRYABLE.has(res.status) && n < retries) {
          await sleep(3000);
          if (!stopped) return attempt(n + 1);
          return;
        }
        let message = `Request failed (${res.status})`;
        try {
          const j = JSON.parse(await res.text());
          if (j?.message) message = Array.isArray(j.message) ? j.message.join(', ') : String(j.message);
        } catch {}
        markOpen();
        return close({ reason: 'error', status: res.status, message });
      }

      markOpen();
      const reader = res.body?.getReader();
      if (!reader) {
        // No streaming body: read it all at once.
        const text = await res.text();
        text.split('\n').forEach((l) => parseLine(l, h.onEvent));
        return close({ reason: 'end' });
      }
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (stopped) return;
        if (done) break;
        if (!value) continue;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) parseLine(line, h.onEvent);
      }
      buffer += decoder.decode();
      if (buffer) buffer.split('\n').forEach((l) => parseLine(l, h.onEvent));
      close({ reason: 'end' });
    } catch (e) {
      clearTimeout(timer);
      if (stopped) return;
      if (!opened && n < retries) {
        // Server likely asleep or unreachable: wake it, then try once more.
        await wakeServer();
        if (!stopped) return attempt(n + 1);
        return;
      }
      close({
        reason: 'error',
        message: timedOut ? 'TRILLION took too long to respond.' : (e as Error)?.message || 'Connection lost.',
      });
    }
  };

  attempt(0);
  return () => {
    stopped = true;
    current?.abort();
  };
}
