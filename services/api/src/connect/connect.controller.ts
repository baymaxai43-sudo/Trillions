import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { ConnectorId } from '@trillion/shared';
import { AuthedRequest, SupabaseAuthGuard } from '../auth/auth.guard';
import { ConnectionsService } from './connections.service';
import { connectorInfo, isConnector, validateToken } from './providers';

function asConnector(p: string): ConnectorId {
  if (!isConnector(p)) throw new BadRequestException('Unknown provider');
  return p;
}

const KeyBody = z.object({ apiKey: z.string().min(10).max(500) });

/** Token-only connectors. Tokens come in once over TLS, are encrypted, and are never returned. */
@Controller('connect')
@UseGuards(SupabaseAuthGuard)
export class ConnectController {
  constructor(private readonly connections: ConnectionsService) {}

  /** Providers with how-to steps and this user's connection status. Never includes tokens. */
  @Get('providers')
  async providers(@Req() req: AuthedRequest) {
    const rows = await this.connections.list(req.user.id);
    return connectorInfo().map((c) => {
      const row = rows.find((r) => r.provider === c.id);
      return { ...c, kind: 'token' as const, connected: !!row, accountLabel: row?.account_label ?? null, connectedAt: row?.created_at ?? null };
    });
  }

  /** Validate a pasted token with the provider, then store it encrypted. */
  @Post(':provider/key')
  async key(@Param('provider') p: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const provider = asConnector(p);
    const parsed = KeyBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Paste the access token first.');
    let t;
    try {
      t = await validateToken(provider, parsed.data.apiKey);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    await this.connections.save(req.user.id, provider, t);
    return { ok: true, provider, accountLabel: t.label ?? null };
  }

  @Delete(':provider')
  async disconnect(@Param('provider') p: string, @Req() req: AuthedRequest) {
    await this.connections.remove(req.user.id, asConnector(p));
    return { ok: true };
  }
}
