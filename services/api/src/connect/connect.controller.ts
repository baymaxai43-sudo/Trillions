import { BadRequestException, Body, Controller, Delete, Get, Logger, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthedRequest, SupabaseAuthGuard } from '../auth/auth.guard';
import { ConnectionsService } from './connections.service';
import { signState, verifyState } from './crypto';
import { authUrl, ConnectorId, connectorInfo, CONNECTORS, exchangeCode, validatePastedKey } from './providers';

const appRedirect = () => process.env.APP_REDIRECT_URL ?? 'trillion://connections';

function asConnector(p: string): ConnectorId {
  if (!CONNECTORS.includes(p as ConnectorId)) throw new BadRequestException('Unknown provider');
  return p as ConnectorId;
}

@Controller('connect')
export class ConnectController {
  private readonly logger = new Logger(ConnectController.name);
  constructor(private readonly connections: ConnectionsService) {}

  /** Providers with connection status for this user. Never includes tokens. */
  @Get('providers')
  @UseGuards(SupabaseAuthGuard)
  async providers(@Req() req: AuthedRequest) {
    const rows = await this.connections.list(req.user.id);
    return connectorInfo().map((c) => {
      const row = rows.find((r) => r.provider === c.id);
      return { ...c, connected: !!row, accountLabel: row?.account_label ?? null, connectedAt: row?.created_at ?? null };
    });
  }

  /** Returns the provider's authorize URL. The app opens it in a browser session. */
  @Get(':provider/start')
  @UseGuards(SupabaseAuthGuard)
  start(@Param('provider') p: string, @Req() req: AuthedRequest) {
    const provider = asConnector(p);
    const info = connectorInfo().find((c) => c.id === provider)!;
    if (info.kind !== 'oauth') throw new BadRequestException(`${info.label} connects with an API key`);
    if (!info.configured) throw new BadRequestException(`${info.label} is not configured on the server yet`);
    return { url: authUrl(provider, signState({ uid: req.user.id, provider })) };
  }

  /** OAuth redirect target (no auth header: the signed state identifies the user). */
  @Get(':provider/callback')
  async callback(@Param('provider') p: string, @Query() q: Record<string, string>, @Res() res: Response) {
    const back = (status: string, msg?: string) =>
      res.redirect(`${appRedirect()}?${new URLSearchParams({ provider: p, status, ...(msg ? { message: msg } : {}) })}`);
    try {
      const provider = asConnector(p);
      const st = verifyState(q.state);
      if (!st || st.provider !== provider) return back('error', 'Link expired, please try again.');
      if (q.error || !q.code) return back('error', q.error_description ?? q.error ?? 'Cancelled');
      const tokens = await exchangeCode(provider, q.code);
      await this.connections.save(st.uid, provider, tokens);
      return back('ok');
    } catch (err) {
      this.logger.warn(`callback ${p} failed: ${(err as Error).message}`);
      return back('error', 'Could not finish connecting.');
    }
  }

  /** Paste-a-key flow (Render API key; Vercel/GitHub personal token fallback). */
  @Post(':provider/key')
  @UseGuards(SupabaseAuthGuard)
  async key(@Param('provider') p: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const provider = asConnector(p);
    const parsed = z.object({ apiKey: z.string().min(10).max(500) }).safeParse(body);
    if (!parsed.success) throw new BadRequestException('apiKey is required');
    try {
      const t = await validatePastedKey(provider, parsed.data.apiKey.trim());
      await this.connections.save(req.user.id, provider, t);
      return { ok: true, accountLabel: t.label ?? null };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Delete(':provider')
  @UseGuards(SupabaseAuthGuard)
  async disconnect(@Param('provider') p: string, @Req() req: AuthedRequest) {
    await this.connections.remove(req.user.id, asConnector(p));
    return { ok: true };
  }
}
