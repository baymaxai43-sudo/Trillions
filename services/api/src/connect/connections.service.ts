import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { decrypt, encrypt } from './crypto';
import { ConnectorId, refreshGoogle, TokenSet } from './providers';

export interface Credential {
  accessToken: string;
  meta: Record<string, unknown>;
  label?: string;
}

/** Stores per-user connector tokens encrypted at rest. Tokens never leave the server. */
@Injectable()
export class ConnectionsService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(userId: string) {
    const { data } = await this.supabase
      .admin()
      .from('connections')
      .select('provider, account_label, scopes, created_at')
      .eq('owner_id', userId);
    return data ?? [];
  }

  async connectedProviders(userId: string): Promise<ConnectorId[]> {
    return (await this.list(userId)).map((r) => r.provider as ConnectorId);
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
          refresh_token_enc: t.refreshToken ? encrypt(t.refreshToken) : null,
          expires_at: t.expiresAt ?? null,
          meta: t.meta ?? {},
        },
        { onConflict: 'owner_id,provider' },
      );
    if (error) throw new Error(`could not save connection: ${error.message}`);
  }

  async remove(userId: string, provider: ConnectorId) {
    await this.supabase.admin().from('connections').delete().eq('owner_id', userId).eq('provider', provider);
  }

  /** Returns a usable access token, refreshing Google tokens that are about to expire. */
  async credential(userId: string, provider: ConnectorId): Promise<Credential | null> {
    const { data } = await this.supabase
      .admin()
      .from('connections')
      .select('access_token_enc, refresh_token_enc, expires_at, meta, account_label')
      .eq('owner_id', userId)
      .eq('provider', provider)
      .maybeSingle();
    if (!data) return null;
    let accessToken = decrypt(data.access_token_enc);
    const expiring = data.expires_at && new Date(data.expires_at).getTime() < Date.now() + 60_000;
    if (provider === 'google' && expiring && data.refresh_token_enc) {
      const t = await refreshGoogle(decrypt(data.refresh_token_enc));
      await this.supabase
        .admin()
        .from('connections')
        .update({ access_token_enc: encrypt(t.accessToken), expires_at: t.expiresAt })
        .eq('owner_id', userId)
        .eq('provider', provider);
      accessToken = t.accessToken;
    }
    return { accessToken, meta: (data.meta ?? {}) as Record<string, unknown>, label: data.account_label ?? undefined };
  }
}
