# data — persistence layer

Drizzle schema and repositories for Neon Postgres. The only layer that touches the database.

**Rules:** Exposes typed repository functions; no business logic, no AI calls, no React. May import from `domain` (types only); never from `app`, `components`, `ai`, or `services`.
