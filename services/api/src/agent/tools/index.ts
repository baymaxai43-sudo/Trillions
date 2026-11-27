import { ConnectorId } from '../../connect/providers';
import { cancelScheduledTask, createFile, forget, getTime, listScheduledTasks, recall, remember, runCode, scheduleTask, spawnSubtask } from './builtin';
import { githubTools } from './github';
import { googleTools } from './google';
import { renderTools } from './render';
import { ToolDef } from './types';
import { vercelTools } from './vercel';
import { fetchUrl, webSearch } from './web';

export const ALL_TOOLS: ToolDef[] = [
  getTime, remember, recall, forget, fetchUrl, webSearch, createFile, spawnSubtask,
  scheduleTask, listScheduledTasks, cancelScheduledTask, runCode,
  ...githubTools, ...googleTools, ...vercelTools, ...renderTools,
];

/** Tools available for this user right now. */
export function toolsFor(connected: ConnectorId[], depth: number): ToolDef[] {
  return ALL_TOOLS.filter(
    (t) => (t.enabled ? t.enabled() : true) && (!t.provider || connected.includes(t.provider)) && !(depth > 0 && t.topLevelOnly),
  );
}

export * from './types';
