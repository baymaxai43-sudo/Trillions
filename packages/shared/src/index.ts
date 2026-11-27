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
