import { BadRequestException, Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ChatRequest } from '@trillion/shared';
import { MODEL_REGISTRY } from '@trillion/ai-providers';
import { AuthedRequest, SupabaseAuthGuard } from '../auth/auth.guard';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(SupabaseAuthGuard)
export class ChatController {
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

    const abort = new AbortController();
    res.on('close', () => abort.abort());

    for await (const event of this.chat.stream(req.user, parsed.data, abort.signal)) {
      if (abort.signal.aborted) break;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
  }
}
