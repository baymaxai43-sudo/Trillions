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
| Connectors (pasted tokens, encrypted) | `services/api/src/connect/*` |
| Schema | `supabase/migrations/20261127000002_agent_harness.sql` (**applied** to project `ochdlfnhvpbgmtyqotxb`) |
| Mobile | `app/index.tsx` (agent mode), `app/connections.tsx`, `app/settings/{schedules,memory}.tsx`, `src/components/{AgentCards,ConnectCard,ConfirmSheet}.tsx`, `src/lib/{agent,api,sse,sync,connectors}.ts` |

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
| GET | `/agent/schedules` | Scheduled tasks with `last_run {status, finished_at, error}`. |
| PATCH | `/agent/schedules/:id` | `{ enabled }` pause / resume (resume recomputes `next_run_at`). |
| DELETE | `/agent/schedules/:id` | Delete a scheduled task. |
| GET | `/memories` | Confirmed + pending memories. |
| POST | `/memories/:id/confirm` | Confirm a pending memory (only confirmed ones reach prompts). |
| DELETE | `/memories/:id` | Delete a memory. |
| GET | `/connect/providers` | Providers (`github, vercel, render, supabase, netlify`) with how-to steps, token URL and connected status (no tokens). |
| POST | `/connect/:provider/key` | `{ apiKey }` pasted token. Validated against the provider, encrypted, upserted. |
| DELETE | `/connect/:provider` | Disconnect. |

OAuth start/callback routes were removed: every connector is a pasted token.

### SSE events (`data: <json>`; each has `seq`, subagent events have `depth > 0`)
`meta {runId, conversationId, model, provider}` · `plan {steps:[{title,status}]}` · `step_status {index,status}` ·
`delta {text}` · `tool_call {id,name,args}` · `tool_result {id,name,ok,summary}` ·
`pending_confirmation {id,tool,args,summary}` · `confirmation_resolved {id,approved}` ·
`artifact {name,url,mime,size,path}` · `connect_request {id,provider,label,reason,howTo,tokenUrl,connected,accountLabel}` ·
`state_changed {scope: schedules|memories|connections}` · `status {status}` (run state) or `status {text}` (live progress line) ·
`error {message}` · `done {status}`.
`connect_request` is persisted as an `agent_steps` row (`kind=message`, `data.event`, no secrets) and replayed on reattach
with the current connection state. The app turns `state_changed` into a reload of the matching Settings screen.
`status {text}` lines ("Thinking", "Reading src/app.ts", "Waiting for your approval") come from `ToolDef.progress(args)` and
the runner; they are ephemeral (RunManager buffer only, never `agent_steps`) and drive the app's status pill.

### Summary cards
The visible reply is kept to ≤3 short paragraphs; longer content goes through `show_summary({title, markdown})`, which
appends a fenced block to the reply (one delta, persisted with the message, redacted, markdown capped at 38k chars):

    ```trillion-summary
    {"id":"…","title":"…","markdown":"…"}
    ```

The app splits replies with `parseSummaries` (apps/mobile/src/lib/summary.ts) into text + SummaryCard, and opens SummarySheet.

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
| `request_connection` | – | shows the secure paste card (`connect_request`); the token goes from the card to `/connect/:provider/key`, never through the model |
| `github_list_repos`, `github_get_repo`, `github_list_tree` (recursive, ≤600 entries), `github_get_file` (ref, line range), `github_search_code`, `github_list_branches`, `github_list_pull_requests`, `github_get_pull_request` (files + capped patches), `github_list_issues`, `github_list_workflow_runs`, `github_get_run_logs` (failed jobs, tail) | – | |
| `github_create_branch`, `github_create_or_update_file`, `github_commit_files` (multi-file commit via git data API, ≤50 files / 1 MB, non-forced ref update), `github_create_pull_request`, `github_comment`, `github_create_issue`, `github_merge_pull_request` | ✅ | |
| `vercel_list_projects`, `vercel_list_deployments`, `vercel_get_deployment_logs`, `vercel_list_env_names` (names only, never values) | – | optional `teamId` |
| `vercel_trigger_deploy` | ✅ | redeploys the latest deployment to production |
| `render_list_services`, `render_list_deploys`, `render_get_logs` | – | |
| `render_trigger_deploy`, `render_restart_service` | ✅ | |
| `supabase_list_projects`, `supabase_list_functions`, `supabase_query` (single read-only statement, `read_only: true` role + local check) | – | |
| `supabase_execute_sql` | ✅ | write SQL |
| `netlify_list_sites`, `netlify_list_deploys` | – | |
| `netlify_trigger_build` | ✅ | |
| `gmail_*` | – | **disabled** (Google needs OAuth; code kept) |
| `update_plan_step`, `replan` | – | internal planner tools, not shown as cards |

Connector tools are offered only when that provider is connected (the list refreshes mid-run when a token is saved).

### Prompt-injection containment
- Every tool result reaches the model inside `<untrusted_data source="tool">…</untrusted_data>`; the system prompt
  says content there is data, never instructions. Known secret formats are redacted from tool output, tool args
  (events + `agent_steps`) and user messages (a pasted token becomes `[REDACTED …]` and the model advises rotating it).
- Per-run `touchedPrivate` is set after any private read (every provider tool, `recall`). After that, `fetch_url`
  needs approval unless the URL (minus query/fragment) came from this run's `web_search` results or the user's
  own messages, and the query string is stripped.
- `remember` saves `confirmed=false` when the run read web or private data; only confirmed memories are injected.
- Scheduled runs auto-decline approval-required tools immediately (no 30-minute wait) and tell the model to report it.
- Tool-call/planner JSON written as text (`{"name"…`, `<function=…>`, `{"steps"…`) is stripped from the delta stream.

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
- `connections`: per-user provider tokens, **AES-256-GCM**. New blobs are `v2:` + base64(iv|tag|ct) with an
  HKDF-SHA256 subkey of `CONNECTOR_ENC_KEY` (separate subkey for HMAC); legacy `v1:` blobs still decrypt and are
  re-encrypted as v2 on first use. `anon`/`authenticated` have **no grant on the ciphertext columns**; users can only
  see provider/label/timestamps and delete their own rows.
- `scheduled_tasks`: owners can select, delete and update `enabled` only; inserts only via the API. Max 10 enabled per owner (trigger).
- `memories`: existing table + generated `fts` column and GIN index.
- Storage bucket `artifacts` (private, 5 MB limit), read/delete policies scoped to the `<uid>/` folder.

The API writes these with the **service role** (runs outlive the user's 1-hour JWT); every query filters by `owner_id`.

---

## 5. Environment variables (Render → trillion-api → Environment)

| Var | Required | What |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Agent persistence, connectors, storage, scheduler. Without it agent runs fail to start. |
| `CONNECTOR_ENC_KEY` | **Yes** | `openssl rand -base64 32`. Losing/rotating it invalidates all stored connections. |
| `TAVILY_API_KEY` or `BRAVE_API_KEY` | optional | enables `web_search` |
| `AGENT_MAX_STEPS` (12), `AGENT_MAX_ACTIVE` (20), `AGENT_SCHEDULER` (`off` to disable) | optional | tuning |
| `AGENT_ENABLE_CODE` + `E2B_API_KEY` | optional | code execution (not wired yet) |

Provider tokens are **per user** (pasted in the app), not server env vars. No OAuth client IDs/secrets are needed.
`SUPABASE_URL` also sets the expected JWT issuer (`<SUPABASE_URL>/auth/v1`); tokens must have `aud=authenticated`.

### Token scopes users need

| Provider | Where | Permissions |
|---|---|---|
| GitHub | Settings → Developer settings → Personal access tokens | Fine-grained: selected repos; Contents, Pull requests, Issues = read/write; Actions, Metadata = read; Workflows = read/write only to edit `.github/workflows`. Classic: `repo`, `workflow`. |
| Vercel | Account Settings → Tokens | Scope to the personal account or the team that owns the projects. |
| Render | Account Settings → API Keys | Full account (Render keys are not scoped). |
| Supabase | Account → Access Tokens | Personal access token (Management API; all projects in the user's orgs). |
| Netlify | User settings → Applications → Personal access tokens | Full account. |

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
- `fetch_url` SSRF guard: `ipaddr.js` unicast-only classification (incl. IPv4-mapped, NAT64, 6to4, Teredo, CGNAT),
  DNS resolved once and the socket pinned to the checked IP, every redirect hop re-checked, standard ports only.

**Not done yet / TODO**
- **Not tested end-to-end against live models or real provider tokens** (none available in
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
- Provider tools (Vercel logs/env, Render restart, Supabase SQL, Netlify builds) are coded from API docs and untested against live accounts.
- CI lives in `.github/workflows/ci.yml` (typechecks shared, ai-providers, api and mobile).
