import { ConnectorId } from '../../connect/providers';
import { cancelScheduledTask, createFile, forget, getTime, listScheduledTasks, reactToMessage, recall, remember, runCode, scheduleTask, showSummary, spawnSubtask } from './builtin';
import { requestConnection } from './connect';
import { githubTools } from './github';
import { googleTools } from './google';
import { netlifyTools } from './netlify';
import { renderTools } from './render';
import { supabaseTools } from './supabase';
import { ToolDef } from './types';
import { vercelTools } from './vercel';
import { fetchUrl, webSearch } from './web';

export const ALL_TOOLS: ToolDef[] = [
  getTime, remember, recall, forget, fetchUrl, webSearch, createFile, spawnSubtask,
  scheduleTask, listScheduledTasks, cancelScheduledTask, runCode, requestConnection, showSummary, reactToMessage,
  ...githubTools, ...vercelTools, ...renderTools, ...supabaseTools, ...netlifyTools, ...googleTools,
];

/** Tools available for this user right now (provider tools only when that provider is connected). */
export function toolsFor(connected: ConnectorId[], depth: number): ToolDef[] {
  return ALL_TOOLS.filter(
    (t) => (t.enabled ? t.enabled() : true) && (!t.provider || connected.includes(t.provider)) && !(depth > 0 && t.topLevelOnly),
  );
}

/** Whether a tool's output is the user's private data (taints the run for fetch_url and memory). */
export const isPrivateTool = (t: ToolDef) => t.private ?? !!t.provider;

export * from './types';
