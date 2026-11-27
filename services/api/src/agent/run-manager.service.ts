import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { AgentEvent } from '@trillion/shared';

type Listener = (ev: AgentEvent) => void;

interface LiveRun {
  id: string;
  ownerId: string;
  seq: number;
  events: AgentEvent[];
  listeners: Set<Listener>;
  abort: AbortController;
  pending: Map<string, (approve: boolean) => void>;
  finishedAt?: number;
}

const MAX_BUFFER = 5000;

/**
 * In-process registry of running agent runs. Runs are detached from HTTP requests, so they keep
 * going when the app disconnects; clients re-attach and replay buffered events from a seq.
 * Single-instance only (Render free). Swap for Redis pub/sub + BullMQ when scaling out.
 */
@Injectable()
export class RunManager implements OnModuleDestroy {
  private runs = new Map<string, LiveRun>();
  private gc = setInterval(() => this.collect(), 5 * 60_000).unref();

  onModuleDestroy() {
    clearInterval(this.gc);
    for (const r of this.runs.values()) r.abort.abort();
  }

  create(id: string, ownerId: string): LiveRun {
    const run: LiveRun = { id, ownerId, seq: 0, events: [], listeners: new Set(), abort: new AbortController(), pending: new Map() };
    this.runs.set(id, run);
    return run;
  }

  get(id: string) {
    return this.runs.get(id);
  }

  /** Ids of this user's runs that are still going. */
  liveRunIds(ownerId: string): string[] {
    return [...this.runs.values()].filter((r) => !r.finishedAt && r.ownerId === ownerId).map((r) => r.id);
  }

  activeCount(ownerId?: string): number {
    let n = 0;
    for (const r of this.runs.values()) if (!r.finishedAt && (!ownerId || r.ownerId === ownerId)) n++;
    return n;
  }

  emit(id: string, ev: AgentEvent) {
    const run = this.runs.get(id);
    if (!run) return;
    const stamped = { ...ev, seq: ++run.seq } as AgentEvent;
    run.events.push(stamped);
    if (run.events.length > MAX_BUFFER) run.events.splice(0, run.events.length - MAX_BUFFER);
    for (const l of run.listeners) {
      try {
        l(stamped);
      } catch {
        /* a broken listener must not kill the run */
      }
    }
  }

  /** Replays events after `after`, then streams live ones. Returns an unsubscribe fn. */
  subscribe(id: string, after: number, l: Listener): () => void {
    const run = this.runs.get(id);
    if (!run) return () => undefined;
    for (const ev of run.events) if ((ev.seq ?? 0) > after) l(ev);
    run.listeners.add(l);
    return () => run.listeners.delete(l);
  }

  finish(id: string) {
    const run = this.runs.get(id);
    if (!run) return;
    run.finishedAt = Date.now();
    for (const resolve of run.pending.values()) resolve(false);
    run.pending.clear();
  }

  cancel(id: string): boolean {
    const run = this.runs.get(id);
    if (!run || run.finishedAt) return false;
    run.abort.abort();
    for (const resolve of run.pending.values()) resolve(false);
    run.pending.clear();
    return true;
  }

  waitForConfirmation(id: string, confirmationId: string, timeoutMs: number): Promise<boolean> {
    const run = this.runs.get(id);
    if (!run) return Promise.resolve(false);
    return new Promise((resolve) => {
      const timer = setTimeout(() => done(false), timeoutMs);
      const onAbort = () => done(false);
      const done = (v: boolean) => {
        clearTimeout(timer);
        run.abort.signal.removeEventListener('abort', onAbort);
        run.pending.delete(confirmationId);
        resolve(v);
      };
      run.abort.signal.addEventListener('abort', onAbort);
      run.pending.set(confirmationId, done);
    });
  }

  resolveConfirmation(id: string, ownerId: string, confirmationId: string, approve: boolean): boolean {
    const run = this.runs.get(id);
    if (!run || run.ownerId !== ownerId) return false;
    const resolve = run.pending.get(confirmationId);
    if (!resolve) return false;
    resolve(approve);
    return true;
  }

  private collect() {
    const cutoff = Date.now() - 15 * 60_000;
    for (const [id, r] of this.runs) if (r.finishedAt && r.finishedAt < cutoff) this.runs.delete(id);
  }
}
