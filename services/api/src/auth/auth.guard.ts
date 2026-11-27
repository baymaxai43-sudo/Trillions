import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose';

export interface AuthedRequest {
  headers: Record<string, string | undefined>;
  socket?: import('net').Socket;
  user: { id: string; token: string };
}

/**
 * Verifies Supabase access tokens.
 * Prefers the project's JWKS (asymmetric signing keys, the default for new projects).
 * Falls back to the legacy HS256 secret when SUPABASE_JWT_SECRET is set.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private jwks?: JWTVerifyGetKey;
  private secret?: Uint8Array;

  constructor() {
    const jwksUrl =
      process.env.SUPABASE_JWKS_URL ??
      (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json` : undefined);
    if (jwksUrl) this.jwks = createRemoteJWKSet(new URL(jwksUrl));
    if (process.env.SUPABASE_JWT_SECRET) this.secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException();
    try {
      const sub = await this.verify(token);
      req.user = { id: sub, token };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private async verify(token: string): Promise<string> {
    const attempts: Array<() => Promise<{ payload: { sub?: string } }>> = [];
    if (this.jwks) attempts.push(() => jwtVerify(token, this.jwks!));
    if (this.secret) attempts.push(() => jwtVerify(token, this.secret!));
    for (const attempt of attempts) {
      try {
        const { payload } = await attempt();
        if (payload.sub) return payload.sub;
      } catch {
        /* try next */
      }
    }
    throw new Error('invalid token');
  }
}
