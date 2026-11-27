import { API, authHeader } from './api';

/**
 * Opens an SSE stream with XHR progress events (works in React Native, unlike fetch streaming).
 * Returns a stop() that only detaches this client.
 */
export async function openSse(
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  onEvent: (ev: any) => void,
  onClose?: (reason: 'end' | 'error') => void,
): Promise<() => void> {
  const xhr = new XMLHttpRequest();
  let seen = 0;
  let buffer = '';
  xhr.open(method, `${API}${path}`);
  xhr.setRequestHeader('Authorization', await authHeader());
  if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
  const drain = () => {
    buffer += xhr.responseText.slice(seen);
    seen = xhr.responseText.length;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {}
    }
  };
  xhr.onprogress = drain;
  xhr.onload = () => {
    drain();
    if (xhr.status >= 400) {
      let message = `Request failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText).message ?? message;
      } catch {}
      onEvent({ type: 'error', message });
    }
    onClose?.('end');
  };
  xhr.onerror = () => onClose?.('error');
  xhr.send(body !== undefined ? JSON.stringify(body) : null);
  return () => xhr.abort();
}
