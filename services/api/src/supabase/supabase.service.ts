import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private adminClient?: SupabaseClient;

  /** Client that acts AS the user, so Postgres RLS applies to every query. */
  forUser(accessToken: string): SupabaseClient {
    return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    });
  }

  /**
   * Service-role client for server-owned writes (agent runs that outlive the user's 1h JWT,
   * encrypted connector tokens, storage). Every query through it MUST filter by owner_id.
   */
  admin(): SupabaseClient {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    this.adminClient ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.adminClient;
  }
}
