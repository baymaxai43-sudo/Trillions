import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpException, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AgentConfirm, AgentEvent, AgentRequest } from '@trillion/shared';
import { AuthedRequest, SupabaseAuthGuard } from '../auth/auth.guard';
import { ConnectionsService } from '../connect/connections.service';
import { SupabaseService } from '../supabase/supabase.service';
import { AgentRunner } from './agent-runner.service';
import { RunManager } from './run-manager.service';
import { toolsFor } from './tools';

@Controller('agent')
@UseGuards(SupabaseAuthGuard)
export class AgentController {
  constructor(
    private readonly runner: AgentRunner,
    private readonly runs: RunManager,
    private readonly supabase: SupabaseService,
    private readonly connections: ConnectionsService,
  ) {}

  /** Starts a run and streams its events. Closing the connection does NOT stop the run. */
  @Post('stream')
  async stream(@Body() body: unknown, @Req() req: AuthedRequest, @Res() res: Response) {
    const parsed = AgentRequest.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    let started: { runId: string; conversationId: string };
    try {
      started = await this.runner.start({ userId: req.user.id, ...parsed.data });
    } catch (err) {
      const msg = (err as Error).message;
      throw new HttpException(msg, /already have|capacity/.test(msg) ? 429 : /not found/i.test(msg) ? 404 : 503);
    }
    this.pipe(started.runId, 0, req, res);
  }

  /** Re-attach to a run (e.g. after the app was closed). Replays events after `after`. */
  @Get('runs/:id/stream')
  async reattach(@Param('id', ParseUUIDPipe) id: string, @Query('after') after: string, @Req() req: AuthedRequest, @Res() res: Response) {
    const live = this.runs.get(id);
    if (live) {
      if (live.ownerId !== req.user.id) throw new ForbiddenException();
      return this.pipe(id, Number(after) || 0, req, res);
    }
    // Finished and evicted: replay the persisted record.
    const db = this.supabase.forUser(req.user.token);
    const { data: run } = await db.from('agent_runs').select('*').eq('id', id).maybeSingle();
    if (!run) throw new NotFoundException();
    const { data: steps } = await db.from('agent_steps').select('*').eq('run_id', id).order('seq');
    this.open(res);
    const send = (ev: AgentEvent) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
    send({ type: 'meta', runId: id, conversationId: run.conversation_id ?? '', model: run.model ?? '', provider: run.provider ?? '' });
    if (Array.isArray(run.plan) && run.plan.length) send({ type: 'plan', steps: run.plan });
    for (const s of steps ?? []) {
      if (s.kind === 'tool_result') {
        send({ type: 'tool_call', id: s.id, name: s.tool, args: s.args ?? {}, depth: s.data?.depth ?? 0 });
        send({ type: 'tool_result', id: s.id, name: s.tool, ok: !!s.ok, summary: s.summary ?? '', depth: s.data?.depth ?? 0 });
      }
    }
    if (run.result) send({ type: 'delta', text: run.result });
    if (run.error && run.status === 'failed') send({ type: 'error', message: run.error });
    send({ type: 'done', status: run.status });
    res.end();
  }

  @Post('confirm')
  confirm(@Body() body: unknown, @Req() req: AuthedRequest) {
    const parsed = AgentConfirm.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const { runId, confirmationId, approve } = parsed.data;
    if (!this.runs.resolveConfirmation(runId, req.user.id, confirmationId, approve)) {
      throw new NotFoundException('That action is no longer waiting for approval.');
    }
    return { ok: true };
  }

  @Post('runs/:id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    const live = this.runs.get(id);
    if (!live || live.ownerId !== req.user.id) throw new NotFoundException();
    return { ok: this.runs.cancel(id) };
  }

  @Get('runs')
  async list(@Req() req: AuthedRequest) {
    const { data } = await this.supabase
      .forUser(req.user.token)
      .from('agent_runs')
      .select('id, goal, status, model, created_at, finished_at, conversation_id, scheduled_task_id')
      .is('parent_run_id', null)
      .order('created_at', { ascending: false })
      .limit(30);
    return (data ?? []).map((r) => ({ ...r, live: !!this.runs.get(r.id) && !this.runs.get(r.id)!.finishedAt }));
  }

  @Get('runs/:id')
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    const db = this.supabase.forUser(req.user.token);
    const { data: run } = await db.from('agent_runs').select('*').eq('id', id).maybeSingle();
    if (!run) throw new NotFoundException();
    const { data: steps } = await db.from('agent_steps').select('seq, kind, tool, args, ok, summary, status, data, created_at').eq('run_id', id).order('seq');
    return { ...run, steps: steps ?? [] };
  }

  @Get('tools')
  async tools(@Req() req: AuthedRequest) {
    const connected = await this.connections.connectedProviders(req.user.id);
    return toolsFor(connected, 0).map((t) => ({ name: t.name, description: t.description, provider: t.provider ?? null, needsApproval: !!t.confirm }));
  }

  @Get('schedules')
  async schedules(@Req() req: AuthedRequest) {
    const { data } = await this.supabase.forUser(req.user.token).from('scheduled_tasks').select('*').order('created_at');
    return data ?? [];
  }

  @Delete('schedules/:id')
  async deleteSchedule(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    await this.supabase.forUser(req.user.token).from('scheduled_tasks').delete().eq('id', id);
    return { ok: true };
  }

  private open(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': connected\n\n');
  }

  private pipe(runId: string, after: number, req: AuthedRequest, res: Response) {
    this.open(res);
    const heartbeat = setInterval(() => !res.writableEnded && res.write(': ping\n\n'), 15_000);
    let unsub = () => {};
    const close = () => {
      clearInterval(heartbeat);
      unsub();
      if (!res.writableEnded) res.end();
    };
    unsub = this.runs.subscribe(runId, after, (ev) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (ev.type === 'done') setImmediate(close);
    });
    req.socket?.once('close', close); // detaches the viewer only; the run continues
  }
}
