import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'crypto';

/** 32-byte master from CONNECTOR_ENC_KEY (base64 of 32 bytes preferred; any other string is SHA-256'd). */
function master(): Buffer {
  const raw = process.env.CONNECTOR_ENC_KEY;
  if (!raw) throw new Error('CONNECTOR_ENC_KEY is not set');
  const b = Buffer.from(raw, 'base64');
  return b.length === 32 ? b : createHash('sha256').update(raw).digest();
}

/** Separate subkeys per purpose (HKDF-SHA256), so the encryption key never doubles as a MAC key. */
function subkey(purpose: 'enc/v2' | 'hmac/v2'): Buffer {
  return Buffer.from(hkdfSync('sha256', master(), Buffer.from('trillion-connectors'), Buffer.from(`trillion/${purpose}`), 32));
}

/**
 * AES-256-GCM. Output: "v2:" + base64(iv[12] | tag[16] | ciphertext), keyed with the HKDF encryption subkey.
 * "v1:" blobs (raw master key) still decrypt; ConnectionsService re-encrypts them as v2 on read.
 */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', subkey('enc/v2'), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'v2:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function decrypt(blob: string): string {
  const version = blob.slice(0, 3);
  const k = version === 'v2:' ? subkey('enc/v2') : version === 'v1:' ? master() : null;
  if (!k) throw new Error('unknown ciphertext version');
  const b = Buffer.from(blob.slice(3), 'base64');
  const d = createDecipheriv('aes-256-gcm', k, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

export const isLegacyCiphertext = (blob: string) => blob.startsWith('v1:');

/** Signed, expiring token: base64url(payload).hmac. Uses the HMAC subkey (never the encryption key). */
export function signPayload(payload: Record<string, unknown>, ttlMs = 10 * 60_000): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs, n: randomBytes(8).toString('hex') })).toString('base64url');
  return `${body}.${createHmac('sha256', subkey('hmac/v2')).update(body).digest('base64url')}`;
}

export function verifyPayload<T extends Record<string, unknown>>(token: string): T | null {
  const [body, sig] = (token ?? '').split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', subkey('hmac/v2')).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return typeof p.exp === 'number' && p.exp > Date.now() ? (p as T) : null;
  } catch {
    return null;
  }
}
