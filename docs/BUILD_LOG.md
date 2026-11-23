# Build log

365 Coach was built with Claude Code from July to November 2026: about 70 commits, each one a small reviewable phase with tests. The author decided what mattered; Claude proposed designs, wrote the code and tests, checked each change in a real browser, and asked before every major decision. This is the story in phases.

## Foundations (July)

- **App shell and layers:** Next.js App Router, a pure `domain` layer, `data` as the only database layer, `ai` for model calls. Postgres via Drizzle: Neon in production, embedded PGlite locally, so it runs with zero setup.
- **Today and logging:** a single Today list; tap-first set logging (a tap logs the planned reps, a second tap undoes); a reversible "30-minute version".
- **Durable AI plans:** the AI writes the day's plan into the database ahead of time. The first time the AI was unavailable, a rules-only planner went in, so mornings are never empty.
- **The training engine:**
  - an exercise library of about 100 movements, each with pain, readiness and equipment attributes;
  - session templates and a rotation planner;
  - the AI chooses only from a filtered candidate list, by id, and anything invented is dropped.
- **Readiness:** a one-tap check-in ("Feeling good / Something's off") adapts the day's session straight away, with no AI involved.
- **Weekly review:** per-exercise "step up / repeat / ease off" calls, decided in code and written up by the AI.
- **Offline:** the app is installable, works offline in the gym, and queues set logs until there's signal.
- **Fuel v1:** a meal library and kitchen contents, plus one dinner decision with a lower-effort alternative.
- **A week of food:** five dinners as a pool rather than a rota, chosen for shared ingredients so the shop stays small, with at least two that leave lunches.

## Hardening (October)

- **Security review:** Claude found that server actions could be invoked through the public unlock page, proved it against a production build, and closed it. Every action now checks the session, and a test enforces that for new ones. Auth also fails closed in production if its secrets are missing.
- **Coming back:** the app went unused after an illness, so a pause ("I'm unwell / taking a break") stops planning, and the first three sessions after a gap ease back in, with loads capped in code.
- **Morning reminder:** one web push between 7 and 8am, scheduled to fit a free hosting plan's once-a-day crons across BST and GMT.
- **Daily friction:** sets measured in seconds and metres, a bottom tab bar, safe seeding, and migrations that run on deploy.
- **Correcting what the coach knows:** editable coach notes, plus a "not for me" button that removes an exercise from future plans.
- **Journal:** tap mood, stress, energy, soreness and stomach. Stress lightens the session and simplifies dinner, and the weekly review only reports a pattern when there's enough data behind it.
- **Fuel, rebuilt:**
  - ingredients are open-ended, with "running low" and a "start fresh" recount;
  - your own meals, entered by hand or described and drafted by the AI;
  - dinners plus dedicated lunch preps;
  - an aisle-grouped in-store list that ticks off instantly.

## Polish (November)

- **iPhone fixes:** an iOS 26 viewport bug left the tab bar floating above the bottom; it's fixed with the workaround other projects confirmed on device. Silent AI timeouts are fixed too: pages get time limits, buttons show they're working, and the AI client gives up after 60 seconds so the rules fallback can take over.
- **Exercise guides:** start/finish photos for 69 exercises (public-domain images, each matched by hand) and a demo link for every exercise.

## Make it yours (November)

- **Profile and setup:** two minutes of taps, covering plan, days a week, session length, equipment, areas to look after, dietary rules, household, and which parts are on.
- **The coach's instructions are built from the setup**, not written about one person. A test checks that the defaults contain no personal details.
- **Five plans**, and days a week works as a limit: once the week has its sessions, the remaining days are rest. Nothing is ever owed back.
- **Your own journal trackers:** a 1–5 scale, yes/no, or a number with a unit.
- **Demo mode and deploy-your-own:** a made-up person rebuilt nightly through the real planners, rules-only so the demo costs nothing, with a guarded reset that refuses to run on any real deployment.

## Rykz look (November)

- **One dark theme** in the Rykz Design DNA: ink background, paper type, brass as the one accent. Every text colour passes 4.5:1 contrast; colours that don't (green, red) only mark dots and rules, never words.
- **Type:** DM Serif Display headings, Source Serif 4 text, Geist Mono kickers and figures. Square edges, no shadows, and a tab bar with no icons.

## Any AI, any screen (November)

- **Built for your phone:** full screen on a phone. On a desktop it runs in a phone-sized frame, with a QR code to open it on your phone.
- **Bring your own AI:** Claude stays the default, and a small adapter (`src/ai/client.ts`) also runs the app on any OpenAI-compatible provider: ChatGPT, Gemini, OpenRouter, Groq, or a local model. Replies are still checked against the same formats and the same allowed ids, and the rules-based planner still covers any failure.

## Copy it in five minutes (November)

- **Nothing to type to deploy:** the Deploy button creates the database alongside the copy, and the owner chooses a passcode in the app on first open (only a salted hash is stored). The login cookie is signed with the database's own secret unless you set one, and the morning job is an optional extra.
- **Builds anywhere:** the fonts are bundled in the repo, so a build doesn't need to reach Google Fonts. An AI assistant building it in a locked-down sandbox no longer trips over them.
- **No dead ends:** a copy missing its database, its tables or its passcode shows a "Finish setting up" page with the exact next step, never an error. A local copy runs with `npm install && npm run dev` and nothing else.
- **Review fixes:** offline sets can't be lost or come back after an undo. Failed taps no longer crash a page. Re-planning keeps what's done. Progress follows your plan.

## How the work was run

- **Propose before building:** every phase started with a short design and its trade-offs, then a decision record (`D*`, `G*`, `Y*`…).
- **Rules in code, judgment in the AI:** anything safety- or correctness-critical is decided in tested code, and the AI chooses within it.
- **Checked like a user would:** tests run on every change, plus a phone-sized browser walkthrough of each feature before it shipped.
