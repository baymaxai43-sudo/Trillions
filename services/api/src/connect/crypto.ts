import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** 32-byte key from CONNECTOR_ENC_KEY (base64 of 32 bytes preferred; any other string is SHA-256'd). */
function key(): Buffer {
  const raw = process.env.CONNECTOR_ENC_KEY;
  if (!raw) throw new Error('CONNECTOR_ENC_KEY is not set');
  const b = Buffer.from(raw, 'base64');
  return b.length === 32 ? b : createHash('sha256').update(raw).digest();
}

/** AES-256-GCM. Output: "v1:" + base64(iv[12] | tag[16] | ciphertext). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function decrypt(blob: string): string {
  if (!blob.startsWith('v1:')) throw new Error('unknown ciphertext version');
  const b = Buffer.from(blob.slice(3), 'base64');
  const d = createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

/** OAuth `state`: base64url(payload).hmac — binds the callback to the user who started it. */
export function signState(payload: { uid: string; provider: string }): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + 10 * 60_000, n: randomBytes(8).toString('hex') }),
  ).toString('base64url');
  return `${body}.${createHmac('sha256', key()).update(body).digest('base64url')}`;
}

export function verifyState(state: string): { uid: string; provider: string } | null {
  const [body, sig] = (state ?? '').split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', key()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  return p.exp > Date.now() ? { uid: p.uid, provider: p.provider } : null;
}
