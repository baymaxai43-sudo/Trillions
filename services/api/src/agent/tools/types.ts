import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentEvent, SyncScope } from '@trillion/shared';
import type { ConnectionsService } from '../../connect/connections.service';
import type { ConnectorId } from '../../connect/providers';

export interface ToolResult {
  ok: boolean;
  /** One line for the chat card. */
  summary: string;
  /** What the model sees (capped by the runner). Defaults to summary. */
  content?: string;
  /** Text appended to the visible assistant reply (top-level runs only), e.g. a summary card block. */
  reply?: string;
}

/** Per-run security state shared by the runner and tools (prompt-injection containment). */
export interface RunSecurity {
  /** Set once the run has read private data (repo content, logs, SQL, memory, mail). */
  touchedPrivate: boolean;
  /** Set once any web content (fetch_url / web_search) entered the run. */
  usedWeb: boolean;
  /** urlKey()s of URLs returned by web_search or written by the user in this run. */
  knownUrls: Set<string>;
  /** Scheduled (unattended) run: approvals are auto-declined. */
  scheduled: boolean;
}

export interface ToolContext {
  userId: string;
  runId: string;
  depth: number;
  signal: AbortSignal;
  db: SupabaseClient; // service role: always filter by userId
  connections: ConnectionsService;
  emit(ev: AgentEvent): void;
  security: RunSecurity;
  /** Persist a non-secret event so it replays when the run is re-opened. */
  persistEvent(ev: AgentEvent, summary: string): Promise<void>;
  /** Runs a nested agent loop (subagent) and resolves with its final summary. */
  runSubtask(goal: string, maxSteps: number): Promise<{ ok: boolean; summary: string }>;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  /** Connector this tool needs; only offered when the user has it connected. */
  provider?: ConnectorId;
  /** Outbound, write or destructive: the user must approve each call. */
  confirm?: boolean;
  /** Per-call approval on top of `confirm` (e.g. fetch_url after private data was read). Return a reason to ask. */
  needsConfirm?(args: any, sec: RunSecurity): string | false;
  /** Output is the user's private data (default: true for every provider tool). */
  private?: boolean;
  /** Settings area this tool changes on success; the app reloads it. */
  syncScope?: SyncScope;
  /** Short live status shown while this tool runs ("Reading src/app.ts"). Never include secrets. */
  progress?(args: any): string;
  /** Human sentence shown on the confirmation sheet. */
  describe?(args: any): string;
  /** Hidden when false (e.g. missing server key or feature flag). */
  enabled?(): boolean;
  /** Not offered to subagents. */
  topLevelOnly?: boolean;
  run(args: any, ctx: ToolContext): Promise<ToolResult>;
}

export const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
export const str = (description: string) => ({ type: 'string', description });
export const int = (description: string) => ({ type: 'integer', description });
export const bool = (description: string) => ({ type: 'boolean', description });
export const strEnum = (values: string[], description?: string) => ({ type: 'string', enum: values, ...(description ? { description } : {}) });

/** Clamp a numeric arg into [min, max] with a default. */
export const clamp = (v: unknown, def: number, min: number, max: number) => Math.min(Math.max(Number(v) || def, min), max);

/** Keep the tail (logs: the end is what matters). */
export const capTail = (s: string, n = 12_000) => (s.length > n ? `…[${s.length - n} earlier chars omitted]\n${s.slice(-n)}` : s);

export const cap = (s: string, n = 12_000) => (s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]` : s);
