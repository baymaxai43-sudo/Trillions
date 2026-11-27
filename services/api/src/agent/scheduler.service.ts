import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AgentRunner } from './agent-runner.service';
import { nextRun } from './schedule-util';

/**
 * Minute tick that starts due scheduled prompts as background agent runs.
 * In-process (no Redis). On Render free the instance sleeps when idle, so ticks pause until it wakes.
 * Disable with AGENT_SCHEDULER=off.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(private readonly supabase: SupabaseService, private readonly runner: AgentRunner) {}

  onModuleInit() {
    if (process.env.AGENT_SCHEDULER === 'off' || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const db = this.supabase.admin();
      const now = new Date();
      const { data: due } = await db
        .from('scheduled_tasks')
        .select('*')
        .eq('enabled', true)
        .lte('next_run_at', now.toISOString())
        .order('next_run_at')
        .limit(5);
      for (const t of due ?? []) {
        const next = nextRun(t, now);
        // Claim atomically: only the writer that still sees the old next_run_at wins.
        const { data: claimed } = await db
          .from('scheduled_tasks')
          .update({ next_run_at: next?.toISOString() ?? null, enabled: !!next, last_run_at: now.toISOString() })
          .eq('id', t.id)
          .eq('next_run_at', t.next_run_at)
          .select('id');
        if (!claimed?.length) continue;
        try {
          const { runId } = await this.runner.start({
            userId: t.owner_id,
            messages: [{ role: 'user', content: `[Scheduled task${t.title ? `: ${t.title}` : ''}] ${t.prompt}` }],
            scheduledTaskId: t.id,
          });
          await db.from('scheduled_tasks').update({ last_run_id: runId }).eq('id', t.id);
        } catch (err) {
          this.logger.warn(`scheduled task ${t.id} not started: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.warn(`tick failed: ${(err as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }
}
