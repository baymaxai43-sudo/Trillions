# TRILLION

One intelligent workspace. More ways to get things done.

Android-first AI workspace: chat, projects & memory, bounded agent tasks, and an AI web-app builder.

## Monorepo layout

| Path | Purpose |
|---|---|
| `apps/mobile` | Expo (React Native + TypeScript) Android app |
| `apps/admin` | Web admin console (later phase) |
| `services/api` | NestJS API: auth, chat streaming, projects, memory, tasks, billing |
| `workers/ai` | BullMQ worker for AI and agent jobs |
| `workers/build` | Isolated app build worker (Phase 5) |
| `packages/ai-providers` | Provider adapters (Gemini, Groq, OpenRouter), key pool, model registry, router |
| `packages/shared` | Shared types and zod schemas |
| `supabase/migrations` | Versioned schema + RLS policies |
| `docs` | PRD, architecture, decisions, runbooks |

## Getting started

```bash
npm install
cp .env.example .env        # fill in Supabase + provider keys (never commit)
npx supabase start          # local Postgres/Auth (requires Supabase CLI + Docker)
npx supabase db reset       # applies supabase/migrations
npm run dev:api             # http://localhost:4000/health
npm run dev:mobile          # Expo dev server; press "a" for Android
```

## Roadmap

1. **Foundation**: monorepo, auth, schema, CI  ← *we are here*
2. **AI MVP**: provider adapters, streaming chat, history, usage
3. **Workspace**: projects, files, memory controls
4. **Agent beta**: task state, permissions, approvals, logs
5. **Builder beta**: app spec, sandbox build, preview
6. **Commercial beta**: plans, credits, payments (Paystack), admin

## Rules

- Provider keys live server-side only. Never in the app bundle, logs, or git.
- Every user-owned table has RLS. The API also checks ownership.
- Consequential agent actions require user approval.
- Feature branches + PR review; CI must pass before merge.

## CI

The GitHub Actions workflow lives at `docs/ci/ci.yml` until a token with `workflow` scope moves it to `.github/workflows/`.
