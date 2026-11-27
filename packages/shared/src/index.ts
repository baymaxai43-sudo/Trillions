import { z } from 'zod';

export const Role = z.enum(['user', 'assistant', 'system', 'tool']);
export type Role = z.infer<typeof Role>;

export const ChatMessage = z.object({
  role: Role,
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatRequest = z.object({
  conversationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  messages: z.array(ChatMessage).min(1),
  model: z.string().default('auto'),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const TaskStatus = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'completed',
  'failed',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export type StreamEvent =
  | { type: 'meta'; conversationId: string; model: string; provider: string }
  | { type: 'delta'; text: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; message: string }
  | { type: 'done' };

// ---- Agent harness ------------------------------------------------------------

export const AgentRequest = z.object({
  conversationId: z.string().uuid().optional(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(40_000) }))
    .min(1)
    .max(60),
  model: z.string().default('auto'),
  maxSteps: z.number().int().min(1).max(25).optional(),
});
export type AgentRequest = z.infer<typeof AgentRequest>;

export const AgentConfirm = z.object({
  runId: z.string().uuid(),
  confirmationId: z.string().min(1),
  approve: z.boolean(),
});
export type AgentConfirm = z.infer<typeof AgentConfirm>;

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export interface PlanStep {
  title: string;
  status: PlanStepStatus;
}

export type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';

/** Events streamed over SSE by POST /v1/agent/stream and GET /v1/agent/runs/:id/stream. */
export type AgentEvent = { seq?: number; depth?: number } & (
  | { type: 'meta'; runId: string; conversationId: string; model: string; provider: string }
  | { type: 'plan'; steps: PlanStep[] }
  | { type: 'step_status'; index: number; status: PlanStepStatus }
  | { type: 'delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; summary: string }
  | { type: 'pending_confirmation'; id: string; tool: string; args: Record<string, unknown>; summary: string }
  | { type: 'confirmation_resolved'; id: string; approved: boolean }
  | { type: 'artifact'; name: string; url: string; mime: string; size: number; path: string }
  | { type: 'status'; status: RunStatus }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; message: string }
  | { type: 'done'; status: RunStatus }
);
