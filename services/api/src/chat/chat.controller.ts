import { BadRequestException, Logger, Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ChatRequest } from '@trillion/shared';
import { MODEL_REGISTRY } from '@trillion/ai-providers';
import { AuthedRequest, SupabaseAuthGuard } from '../auth/auth.guard';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(SupabaseAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chat: ChatService) {}

  @Get('models')
  models() {
    return MODEL_REGISTRY.filter((m) => m.enabled).map(({ id, label, tier, capabilities }) => ({ id, label, tier, capabilities }));
  }

  /** Streams the reply as SSE. Client closes the connection to stop generation. */
  @Post('stream')
  async stream(@Body() body: unknown, @Req() req: AuthedRequest, @Res() res: Response) {
    const parsed = ChatRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Comment line so proxies start streaming immediately.
    res.write(': connected\n\n');

    // Abort upstream generation only when the client socket really disconnects.
    const abort = new AbortController();
    const onDisconnect = () => {
      if (!res.writableEnded) abort.abort();
    };
    req.socket?.once('close', onDisconnect);

    try {
      for await (const event of this.chat.stream(req.user, parsed.data, abort.signal)) {
        if (abort.signal.aborted) break;
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (err) {
      this.logger.error(`stream failed: ${(err as Error).message}`);
      if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type: 'error', message: 'Something went wrong.' })}\n\n`);
    } finally {
      req.socket?.off('close', onDisconnect);
      if (!res.writableEnded) res.end();
    }
  }
}
