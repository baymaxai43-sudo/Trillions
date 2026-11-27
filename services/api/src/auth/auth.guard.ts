import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';

export interface AuthedRequest {
  headers: Record<string, string | undefined>;
  user: { id: string; token: string };
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET ?? '');

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException();
    try {
      const { payload } = await jwtVerify(token, this.secret);
      if (!payload.sub) throw new Error('no sub');
      req.user = { id: payload.sub, token };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
