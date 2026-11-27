import { ProviderId } from './types';

interface KeyState {
  key: string;
  cooldownUntil: number;
  failures: number;
}

/**
 * Round-robin pool of server-side keys per provider with cooldown on 429/5xx.
 * Resilience within each provider's terms; not a way around quotas.
 */
export class KeyPool {
  private pools = new Map<ProviderId, KeyState[]>();
  private cursor = new Map<ProviderId, number>();

  constructor(keys: Partial<Record<ProviderId, string[]>>) {
    for (const [p, list] of Object.entries(keys) as [ProviderId, string[]][]) {
      this.pools.set(p, list.filter(Boolean).map((key) => ({ key, cooldownUntil: 0, failures: 0 })));
      this.cursor.set(p, 0);
    }
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): KeyPool {
    const split = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    return new KeyPool({
      gemini: split(env.GEMINI_API_KEYS),
      groq: split(env.GROQ_API_KEYS),
      openrouter: split(env.OPENROUTER_API_KEYS),
    });
  }

  has(provider: ProviderId): boolean {
    return (this.pools.get(provider)?.length ?? 0) > 0;
  }

  /** Returns the next healthy key, or undefined if all are cooling down. */
  acquire(provider: ProviderId): string | undefined {
    const pool = this.pools.get(provider) ?? [];
    const now = Date.now();
    for (let i = 0; i < pool.length; i++) {
      const idx = ((this.cursor.get(provider) ?? 0) + i) % pool.length;
      if (pool[idx].cooldownUntil <= now) {
        this.cursor.set(provider, (idx + 1) % pool.length);
        return pool[idx].key;
      }
    }
    return undefined;
  }

  reportFailure(provider: ProviderId, key: string, retryable: boolean): void {
    const s = this.pools.get(provider)?.find((k) => k.key === key);
    if (!s) return;
    s.failures++;
    if (retryable) s.cooldownUntil = Date.now() + Math.min(60_000 * s.failures, 10 * 60_000);
  }

  reportSuccess(provider: ProviderId, key: string): void {
    const s = this.pools.get(provider)?.find((k) => k.key === key);
    if (s) s.failures = 0;
  }
}
