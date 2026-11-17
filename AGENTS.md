<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project 365 — agent guidance

- **Design notes:** `docs/HOW_IT_WORKS.md` explains the architecture and the principles the code follows. Code comments cite numbered design docs ("doc 10") and decision ids ("D11", "G4"); that guide maps them to topics.
- **User-facing copy follows the behavioural principles:** calm, no guilt language, recommend before instructing, explain why briefly, always end with a next action.
- **Layer rules:** `src/domain` is pure TypeScript (no React/DB/AI imports); `src/data` is the only layer touching the database; AI writes durable artifacts via `src/data`, and the UI never blocks on live AI. Each layer folder has a README with its import rules.
- **Workflow:** small reviewable phases; tests alongside every change (`npm test`); keep the rules-only fallback working whenever AI behaviour changes.
