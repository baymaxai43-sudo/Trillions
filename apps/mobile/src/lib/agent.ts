import { apiFetch } from './api';
import type { Msg } from './chat';
import { openSse, SseHandlers } from './sse';

export type PlanStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type PlanStep = { title: string; status: PlanStatus };

/** Everything the chat list can show. `key` is a stable id for list rendering. */
export type ChatItem = { key?: string } & (
  | { kind: 'user'; content: string }
  | { kind: 'assistant'; content: string }
  | { kind: 'plan'; steps: PlanStep[] }
  | { kind: 'tool'; id: string; name: string; args: Record<string, unknown>; status: 'running' | 'ok' | 'error'; summary?: string; depth: number }
  | { kind: 'artifact'; name: string; url: string; mime: string; size: number }
  | { kind: 'confirm'; id: string; tool: string; summary: string; args: Record<string, unknown>; state: 'pending' | 'approved' | 'declined' }
  | { kind: 'error'; message: string }
);

let counter = 0;
export const uid = () => `${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
/** Gives an item a stable key (used for FlatList keys). */
export const mk = <T extends ChatItem>(item: T): T => (item.key ? item : { ...item, key: uid() });

export type PendingConfirmation = { runId: string; id: string; tool: string; summary: string; args: Record<string, unknown> };

export const toHistory = (items: ChatItem[]): Msg[] =>
  items
    .filter((i): i is Extract<ChatItem, { kind: 'user' | 'assistant' }> => (i.kind === 'user' || i.kind === 'assistant') && !!i.content)
    .map((i) => ({ role: i.kind, content: i.content }));

/** Starts an agent run and streams its events. The run keeps going server-side if this detaches. */
export function streamAgent(messages: Msg[], opts: { conversationId?: string; model?: string }, handlers: SseHandlers) {
  return openSse(
    'POST',
    '/v1/agent/stream',
    { messages: messages.slice(-40), conversationId: opts.conversationId, model: opts.model ?? 'auto' },
    handlers,
  );
}

/** Re-attaches to a run and replays events after `afterSeq`. */
export function reattachRun(runId: string, afterSeq: number, handlers: SseHandlers) {
  return openSse('GET', `/v1/agent/runs/${runId}/stream?after=${afterSeq}`, undefined, handlers, { retries: 1, firstByteTimeoutMs: 75_000 });
}

export type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
export type RunRecord = { id: string; status: RunStatus; result: string | null; error: string | null; conversation_id: string | null };
export const TERMINAL: RunStatus[] = ['completed', 'failed', 'cancelled'];

export const getRun = (runId: string) => apiFetch<RunRecord>(`/v1/agent/runs/${runId}`);

export const confirmAction = (runId: string, confirmationId: string, approve: boolean) =>
  apiFetch('/v1/agent/confirm', { method: 'POST', body: { runId, confirmationId, approve } });

export const cancelRun = (runId: string) => apiFetch(`/v1/agent/runs/${runId}/cancel`, { method: 'POST' });

export const TOOL_LABELS: Record<string, string> = {
  get_time: 'Checking the time',
  remember: 'Saving to memory',
  recall: 'Searching memory',
  forget: 'Deleting a memory',
  fetch_url: 'Reading a page',
  web_search: 'Searching the web',
  create_file: 'Creating a file',
  spawn_subtask: 'Running a subtask',
  schedule_task: 'Scheduling a task',
  list_scheduled_tasks: 'Listing scheduled tasks',
  cancel_scheduled_task: 'Cancelling a scheduled task',
  run_code: 'Running code',
  github_list_repos: 'Listing GitHub repos',
  github_get_file: 'Reading from GitHub',
  github_create_or_update_file: 'Committing to GitHub',
  github_create_issue: 'Opening a GitHub issue',
  github_list_pull_requests: 'Listing pull requests',
  github_create_pull_request: 'Opening a pull request',
  gmail_search: 'Searching Gmail',
  gmail_read: 'Reading an email',
  gmail_send: 'Sending an email',
  vercel_list_projects: 'Listing Vercel projects',
  vercel_list_deployments: 'Listing Vercel deployments',
  vercel_trigger_deploy: 'Deploying on Vercel',
  render_list_services: 'Listing Render services',
  render_trigger_deploy: 'Deploying on Render',
  render_get_logs: 'Reading Render logs',
};

export const toolLabel = (name: string) => TOOL_LABELS[name] ?? name.replace(/_/g, ' ');

/** A short, human hint of the args (e.g. the URL or query). */
export function argHint(args: Record<string, unknown>): string {
  const v = args.url ?? args.query ?? args.path ?? args.filename ?? args.goal ?? args.to ?? args.repo ?? args.serviceId ?? args.projectId ?? args.fact;
  return v ? String(v).slice(0, 80) : '';
}
