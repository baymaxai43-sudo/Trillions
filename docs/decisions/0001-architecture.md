# ADR 0001: Modular monolith + workers

- Core API is one NestJS app with feature modules; long jobs go to BullMQ workers.
- Supabase for Postgres, Auth, Storage; pgvector for retrieval.
- Provider abstraction in `packages/ai-providers`; product code never imports vendor SDKs.
- Multiple keys per provider are a resilience pool within each provider's terms, not quota evasion.
