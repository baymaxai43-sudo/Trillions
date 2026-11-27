import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { decrypt, encrypt, isLegacyCiphertext } from './crypto';
import { ConnectorId, CONNECTORS, isConnector, TokenSet } from './providers';

export interface Credential {
  accessToken: string;
  meta: Record<string, unknown>;
  label?: string;
}

/** Stores per-user connector tokens encrypted at rest. Tokens never leave the server or reach the model. */
@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  private listeners = new Set<(userId: string, provider: ConnectorId) => void>();
  constructor(private readonly supabase: SupabaseService) {}

  /** Notified after a connection is saved or removed (the agent uses it to refresh tools and the app). */
  onChange(l: (userId: string, provider: ConnectorId) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private changed(userId: string, provider: ConnectorId) {
    for (const l of this.listeners) {
      try {
        l(userId, provider);
      } catch {
        /* listeners must not break saves */
      }
    }
  }

  async list(userId: string) {
    const { data } = await this.supabase
      .admin()
      .from('connections')
      .select('provider, account_label, scopes, created_at, updated_at')
      .eq('owner_id', userId);
    return data ?? [];
  }

  /** Token providers the user has connected (legacy OAuth rows such as google are ignored). */
  async connectedProviders(userId: string): Promise<ConnectorId[]> {
    return (await this.list(userId)).map((r) => r.provider as string).filter(isConnector);
  }

  async save(userId: string, provider: ConnectorId, t: TokenSet) {
    const { error } = await this.supabase
      .admin()
      .from('connections')
      .upsert(
        {
          owner_id: userId,
          provider,
          account_label: t.label ?? null,
          scopes: t.scopes ?? null,
          access_token_enc: encrypt(t.accessToken),
          refresh_token_enc: null,
          expires_at: null,
          meta: t.meta ?? {},
        },
        { onConflict: 'owner_id,provider' },
      );
    if (error) throw new Error(`could not save connection: ${error.message}`);
    this.changed(userId, provider);
  }

  async remove(userId: string, provider: ConnectorId) {
    await this.supabase.admin().from('connections').delete().eq('owner_id', userId).eq('provider', provider);
    this.changed(userId, provider);
  }

  async credential(userId: string, provider: ConnectorId): Promise<Credential | null> {
    if (!(CONNECTORS as string[]).includes(provider)) return null;
    const { data } = await this.supabase
      .admin()
      .from('connections')
      .select('access_token_enc, meta, account_label')
      .eq('owner_id', userId)
      .eq('provider', provider)
      .maybeSingle();
    if (!data) return null;
    const accessToken = decrypt(data.access_token_enc);
    if (isLegacyCiphertext(data.access_token_enc)) {
      // Upgrade v1 (raw master key) ciphertext to v2 (HKDF subkey) in place. Best effort.
      const { error } = await this.supabase
        .admin()
        .from('connections')
        .update({ access_token_enc: encrypt(accessToken) })
        .eq('owner_id', userId)
        .eq('provider', provider)
        .eq('access_token_enc', data.access_token_enc);
      if (error) this.logger.warn(`v2 re-encrypt failed for ${provider}: ${error.message}`);
    }
    return { accessToken, meta: (data.meta ?? {}) as Record<string, unknown>, label: data.account_label ?? undefined };
  }
}
