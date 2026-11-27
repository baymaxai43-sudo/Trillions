# TRILLION Agent Harness (Phase 3)

A general autonomous agent: it **plans**, **calls tools** in a multi-step loop, **remembers** the user,
reads the **web**, writes **files**, delegates to **subagents**, works in the user's **connected accounts**,
runs **in the background** (survives the app closing) and on a **schedule**. Every outbound, write or
destructive action pauses for the user's **explicit approval**.

Built for Render free (512 MB, sleeps when idle): no Redis, one in-process runner, all task state in Postgres.

---

## 1. Architecture

```
apps/mobile ──SSE──▶ POST /v1/agent/stream ─▶ AgentRunner.start()  (detached from the request)
                                                  │
     ▲  GET /v1/agent/runs/:id/stream (reattach)  ├─ planner turn  → `plan`
     │                                            ├─ loop ≤ maxSteps:
     │  RunManager (in-memory event buffer,       │    routeToolTurn (Groq gpt-oss-20b → OpenRouter gpt-oss-120b)
     └─ seq-numbered replay, confirmations)       │    tool_calls → [approval?] → ToolDef.run() → `tool_result`
                                                  │    plan tools: update_plan_step / replan
                                                  └─ final answer → messages + agent_runs (service role)
SchedulerService (60 s tick) ── due scheduled_tasks ─▶ AgentRunner.start()
```

| Piece | File |
|---|---|
| Streaming tool-call parser (OpenAI dialect) | `packages/ai-providers/src/openai-compatible.ts` (`streamTools`, `parseToolStream`) |
| Tool-capable model routing + fallback | `packages/ai-providers/src/agent-router.ts` (`routeToolTurn`) |
| Event / request types | `packages/shared/src/index.ts` (`AgentEvent`, `AgentRequest`, `AgentConfirm`) |
| Loop, planner, approvals, subagents | `services/api/src/agent/agent-runner.service.ts` |
| Live run registry, replay, confirmations | `services/api/src/agent/run-manager.service.ts` |
| Endpoints | `services/api/src/agent/agent.controller.ts` |
| Scheduler | `services/api/src/agent/scheduler.service.ts`, `schedule-util.ts` |
| Tools | `services/api/src/agent/tools/*` |
| Connectors (OAuth, encrypted tokens) | `services/api/src/connect/*` |
| Schema | `supabase/migrations/20261127000002_agent_harness.sql` (**applied** to project `ochdlfnhvpbgmtyqotxb`) |
| Mobile | `app/index.tsx` (agent mode), `app/connections.tsx`, `src/components/AgentCards.tsx`, `ConfirmSheet.tsx`, `src/lib/{agent,api,sse}.ts` |

### Models
Agent turns need `tools` capability: **Groq `openai/gpt-oss-20b`** first, **OpenRouter `openai/gpt-oss-120b`** as
fallback (only if nothing streamed yet). Gemini has no `streamTools` adapter yet, so it is skipped for agent runs.

---

## 2. API

All routes are under `/v1` and need `Authorization: Bearer <supabase access token>` unless noted.

| Method | Path | Purpose |
|---|---|---|
| POST | `/agent/stream` | Start a run. Body `{ messages:[{role,content}], conversationId?, model?='auto', maxSteps? (1-25) }`. Streams SSE. Closing the connection **does not** stop the run. |
| GET | `/agent/runs/:id/stream?after=<seq>` | Re-attach: replays buffered events after `seq`, then streams live. For finished runs evicted from memory, replays the persisted record. |
| POST | `/agent/confirm` | `{ runId, confirmationId, approve }` resolves a `pending_confirmation`. |
| POST | `/agent/runs/:id/cancel` | Cancel a live run. |
| GET | `/agent/runs`, `/agent/runs/:id` | List runs / run + steps (RLS, user's own). |
| GET | `/agent/tools` | Tools available to this user right now. |
| GET / DELETE | `/agent/schedules`, `/agent/schedules/:id` | Scheduled prompts. |
| GET | `/connect/providers` | Providers + connected status (no tokens). |
| GET | `/connect/:provider/start` | `{ url }` authorize URL with signed `state` (HMAC, 10 min). |
| GET | `/connect/:provider/callback` | **No auth header** (state identifies the user). Exchanges code, stores encrypted token, redirects to `trillion://connections?provider=…&status=ok|error`. |
| POST | `/connect/:provider/key` | `{ apiKey }` paste flow: Render API key; Vercel / GitHub personal-token fallback. Validated before saving. |
| DELETE | `/connect/:provider` | Disconnect. |

### SSE events (`data: <json>`; each has `seq`, subagent events have `depth > 0`)
`meta {runId, conversationId, model, provider}` · `plan {steps:[{title,status}]}` · `step_status {index,status}` ·
`delta {text}` · `tool_call {id,name,args}` · `tool_result {id,name,ok,summary}` ·
`pending_confirmation {id,tool,args,summary}` · `confirmation_resolved {id,approved}` ·
`artifact {name,url,mime,size,path}` · `status {status}` · `error {message}` · `done {status}`.
Heartbeat comments (`: ping`) every 15 s keep Render's proxy from closing idle streams.

---

## 3. Tools

| Tool | Approval | Notes |
|---|---|---|
| `get_time` | – | IANA tz, default Africa/Lagos |
| `remember`, `recall` | – | `memories` table; full-text (`fts` tsvector, websearch) with ILIKE fallback. Top-k (≈8: relevant + recent) injected into the system prompt each run. |
| `forget` | ✅ | deletes matching memories |
| `fetch_url` | – | Server fetch, http(s) only, **blocks private/loopback/link-local/metadata IPs** (DNS-resolved, re-checked on every redirect, max 3 hops), 1 MB read cap, 15 s timeout, HTML→text, ≤20k chars |
| `web_search` | – | Only offered if `TAVILY_API_KEY` or `BRAVE_API_KEY` is set |
| `create_file` | – | Uploads to private Storage bucket `artifacts` at `<user_id>/<run_id>/<name>` (≤1 MB), emits `artifact` with a 7-day signed URL |
| `spawn_subtask` | – | Nested loop, own budget (1-8 steps), no plan, no nested spawning/scheduling; returns summary |
| `schedule_task` | ✅ | once / interval (≥15 min) / daily HH:MM + tz |
| `list_scheduled_tasks` | – | |
| `cancel_scheduled_task` | ✅ | |
| `run_code` | ✅ | **Off by default** (see §6) |
| `github_list_repos`, `github_get_file`, `github_list_pull_requests` | – | |
| `github_create_or_update_file`, `github_create_issue`, `github_create_pull_request` | ✅ | |
| `gmail_search`, `gmail_read` | – | |
| `gmail_send` | ✅ | header-injection safe (CR/LF stripped), UTF-8 subject |
| `vercel_list_projects`, `vercel_list_deployments` | – | |
| `vercel_trigger_deploy` | ✅ | redeploys the latest deployment to production |
| `render_list_services`, `render_get_logs` | – | |
| `render_trigger_deploy` | ✅ | |
| `update_plan_step`, `replan` | – | internal planner tools, not shown as cards |

Connector tools are offered only when that provider is connected. The system prompt tells the model to treat
web / email / repo content as untrusted data (prompt-injection guard) and never to retry a declined action.

### Approval flow
Tool with `confirm: true` → runner emits `pending_confirmation`, writes an `agent_steps` row (`kind=confirmation,
status=pending`), sets the run to `waiting_approval` and waits (30 min timeout ⇒ declined). The app shows a bottom
sheet; `POST /agent/confirm` resolves it. Declines go back to the model as a failed tool result.

### Planner
First turn (JSON mode) returns 0-6 steps. Empty for chit-chat/simple questions (no plan card). During the loop
the model marks steps with `update_plan_step` and calls `replan` when a step fails (failed tool results carry a
hint to do so). Completed steps are kept on replan. Plan persists in `agent_runs.plan`.

---

## 4. Data model (all RLS, owner only)

- `agent_runs`: status, goal, plan, model/provider, tokens, result/error, parent/scheduled links. Clients **read only**.
- `agent_steps`: plan / tool_result / confirmation rows per run. Clients **read only**.
- `connections`: per-user provider tokens, **AES-256-GCM** encrypted with `CONNECTOR_ENC_KEY`
  (`v1:` + base64(iv|tag|ct)). `anon`/`authenticated` have **no grant on the ciphertext columns**; users can only
  see provider/label/timestamps and delete their own rows.
- `scheduled_tasks`: owner full access (can disable/delete).
- `memories`: existing table + generated `fts` column and GIN index.
- Storage bucket `artifacts` (private, 5 MB limit), read/delete policies scoped to the `<uid>/` folder.

The API writes these with the **service role** (runs outlive the user's 1-hour JWT); every query filters by `owner_id`.

---

## 5. Environment variables (Render → trillion-api → Environment)

| Var | Required | What |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Agent persistence, connectors, storage, scheduler. Without it agent runs fail to start. |
| `CONNECTOR_ENC_KEY` | **Yes** | `openssl rand -base64 32`. Losing/rotating it invalidates all stored connections. |
| `API_PUBLIC_URL` | default ok | `https://trillion-api.onrender.com` (builds OAuth redirect URIs) |
| `APP_REDIRECT_URL` | default ok | `trillion://connections` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | for GitHub | OAuth App |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for Gmail | Google OAuth client (Web) |
| `VERCEL_CLIENT_ID` / `VERCEL_CLIENT_SECRET` / `VERCEL_INTEGRATION_SLUG` | optional | Vercel integration; without them users paste a token |
| `TAVILY_API_KEY` or `BRAVE_API_KEY` | optional | enables `web_search` |
| `AGENT_MAX_STEPS` (12), `AGENT_MAX_ACTIVE` (20), `AGENT_SCHEDULER` (`off` to disable) | optional | tuning |
| `AGENT_ENABLE_CODE` + `E2B_API_KEY` | optional | code execution (not wired yet) |

Render API keys are **per user** (pasted in the app), not a server env var.

### Create the OAuth apps

**GitHub OAuth App** – github.com → Settings → Developer settings → OAuth Apps → New OAuth App
- Homepage URL: `https://trillion-api.onrender.com`
- Authorization callback URL: `https://trillion-api.onrender.com/v1/connect/github/callback`
- Copy Client ID, generate a Client secret → `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. Scopes requested: `repo read:user`.

**Google (Gmail)** – console.cloud.google.com
1. Create/select a project → APIs & Services → Library → enable **Gmail API**.
2. OAuth consent screen: External, app name TRILLION, support email, add scopes
   `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.send`.
3. Add **test users** (your Gmail addresses). In Testing mode only listed test users (max 100) can connect and
   refresh tokens expire after 7 days.
4. Credentials → Create credentials → OAuth client ID → **Web application** → Authorized redirect URI
   `https://trillion-api.onrender.com/v1/connect/google/callback` → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. Gmail scopes are **restricted**: going public needs Google verification + an annual third-party security
   assessment (CASA). Plan for this before launch.

**Vercel integration** (optional) – vercel.com/dashboard/integrations/console → Create
- Redirect URL: `https://trillion-api.onrender.com/v1/connect/vercel/callback`
- Scopes: Projects (read), Deployments (read/write).
- Copy Client ID / Secret and the integration **slug** (from `vercel.com/integrations/<slug>`).
- Without this, users tap **Add key** and paste a Vercel token (Account → Tokens).

**Render** – nothing to create. Users paste an API key (Render → Account settings → API keys).

---

## 6. Limits, risks and what's missing

**Known limits (by design for Render free)**
- Single instance, in-process runs: a deploy/restart/sleep **kills live runs**; at boot they are marked
  `failed: Server restarted`. Pending approvals are lost too.
- Render free sleeps after ~15 min idle, so **scheduled tasks don't fire while asleep** (they run on the next tick
  after wake-up). Options: paid instance, or an external pinger hitting `/health` (counts against the 750 free hours).
- Event buffer lives in memory (≤5000 events/run, evicted 15 min after finish); after eviction, reattach replays
  the persisted summary (plan, tool results, final text), not every delta.
- Concurrency caps: 3 live runs per user, 20 total.
- `fetch_url` SSRF guard checks DNS before the request; a DNS-rebinding race is theoretically possible.
  Hardening: pin the resolved IP with a custom `undici` dispatcher.

**Not done yet / TODO**
- **Not tested end-to-end against live models or real OAuth apps** (no provider keys or OAuth apps available in
  the build sandbox). Verified: typecheck (api, mobile, ai-providers), Nest boots with all routes mapped, and unit
  smoke tests for the tool-call stream parser, AES-GCM/state signing, schedule math, SSRF guard, HTML stripping.
- `run_code`: interface + gating only. E2B needs its SDK (sandbox create + envd process RPC); add
  `@e2b/code-interpreter` and implement `run()` when enabling. Never run user code on the Render box.
- Approvals for **scheduled/background runs** only reach the app while it is attached to that run. Needs a
  "Tasks" screen (list `GET /agent/runs`, open a `waiting_approval` run, reattach) + push notifications (Expo push).
- Gemini tool calling adapter (function-calling format differs).
- Mobile: no conversation history/resume screen for past runs yet; artifacts open via signed URL in the browser.
- Usage/credits: tokens are stored on `agent_runs`, but nothing is written to `usage_records` yet.
- Scaling path: BullMQ + Redis for runs, Redis pub/sub for events, so multiple instances can share runs.
- Vercel integration flow and Render logs endpoint are coded from API docs and untested.
- CI workflow still parked in `docs/ci/ci.yml` (token lacks `workflow` scope).
