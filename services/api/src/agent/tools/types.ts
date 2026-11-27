import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentEvent } from '@trillion/shared';
import type { ConnectionsService } from '../../connect/connections.service';
import type { ConnectorId } from '../../connect/providers';

export interface ToolResult {
  ok: boolean;
  /** One line for the chat card. */
  summary: string;
  /** What the model sees (capped by the runner). Defaults to summary. */
  content?: string;
}

export interface ToolContext {
  userId: string;
  runId: string;
  depth: number;
  signal: AbortSignal;
  db: SupabaseClient; // service role: always filter by userId
  connections: ConnectionsService;
  emit(ev: AgentEvent): void;
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

export const cap = (s: string, n = 12_000) => (s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]` : s);
