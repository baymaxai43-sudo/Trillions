import { randomBytes } from 'crypto';
import type { AgentEvent } from '@trillion/shared';
import { CONNECTORS, infoFor, isConnector } from '../../connect/providers';
import { obj, str, strEnum, ToolDef } from './types';

/** Shows a secure paste card in the chat. The token goes from the card straight to the API, never through the model. */
export const requestConnection: ToolDef = {
  name: 'request_connection',
  progress: (a) => `Asking you to connect ${a.provider ?? 'an account'}`,
  description:
    'Ask the user to connect an account (GitHub, Vercel, Render, Supabase, Netlify). Shows a secure card in the chat where they paste an access token. ' +
    'Use when the user asks to connect something, or when a task needs a provider that is not connected. Never ask for tokens in chat.',
  parameters: obj({ provider: strEnum(CONNECTORS), reason: str('One short sentence: what you will do with it') }, ['provider', 'reason']),
  private: false,
  topLevelOnly: true,
  async run(a, ctx) {
    const provider = String(a.provider ?? '');
    if (!isConnector(provider)) return { ok: false, summary: `Unknown provider ${provider}` };
    const info = infoFor(provider);
    const row = (await ctx.connections.list(ctx.userId)).find((r) => r.provider === provider);
    const ev: AgentEvent = {
      type: 'connect_request',
      id: `cr_${randomBytes(6).toString('hex')}`,
      provider,
      label: info.label,
      reason: String(a.reason ?? '').slice(0, 200),
      howTo: info.howTo,
      tokenUrl: info.tokenUrl,
      connected: !!row,
      accountLabel: row?.account_label ?? null,
    };
    ctx.emit(ev);
    await ctx.persistEvent(ev, `Connect ${info.label}`);
    if (row) {
      return {
        ok: true,
        summary: `${info.label} is already connected${row.account_label ? ` as ${row.account_label}` : ''}`,
        content: `${info.label} is already connected. A card is showing in case the user wants to replace the token. Continue with the task.`,
      };
    }
    return {
      ok: true,
      summary: `Showing a secure ${info.label} connect card`,
      content: `A secure paste card is showing; ask the user to paste the token there. Do not ask them to paste it in chat. Once they save it, ${info.label} tools become available on their next message.`,
    };
  },
};
