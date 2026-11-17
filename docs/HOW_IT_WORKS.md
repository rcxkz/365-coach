# How it works

## The shape

```
src/app, src/components   UI: routes and tap-first components; reads the database only
src/ai                    plans written ahead of time: prompts, model calls, rules fallback
src/domain                pure TypeScript decisions: readiness, rotation, candidates, meals, ramps
src/data                  Drizzle schema and repositories, the only layer that touches Postgres
src/services              external integrations behind small interfaces (web push)
```

**The UI never waits on the AI.** Plans are written to the database ahead of time: the morning job plans the day, or you tap Plan. Screens only read. When the AI is missing, slow or out of credit, the same inputs go through a rules-only planner, so there's always a plan.

**Rules decide what's allowed; the AI decides which.** For a training session:

1. The rotation picks the next session type from your chosen plan (`domain/rotation`).
2. Readiness is worked out from this morning's check-in, recent journal entries and any pain (`domain/readiness`).
3. The candidate filter removes anything unsafe or unavailable: pain areas, readiness risk, equipment, exercises you've ruled out. Protected areas get cautions attached (`domain/candidates`).
4. The AI picks exercises from that filtered list only, using exercise ids. Anything invented is dropped.
5. Sets and loads are capped in code where needed, for example when easing back in after a break (`domain/comeback`).

Food works the same way. Meals pass the gates for kitchen contents, cooldown, dietary rules and effort, and only then does the AI (or the rules) choose (`domain/meal-candidates`, `domain/week-plan`).

**The profile.** One row of setup answers (`domain/profile`) drives the plan, equipment, session length, protected areas, dietary rules, which modules are on, and the coach's instructions (`ai/voices`). There's one profile per deployment: everyone runs their own app.

## Principles

- **No guilt, no debt.** Frequency is a limit, not a quota. Nothing is ever "missed"; the next session is just the next one.
- **Recommend, then explain briefly.** One suggestion, one short reason, and always a next action.
- **Ask the fewest questions.** Tap-first input, sensible defaults, and the full form only when something's off.
- **Pain changes the plan.** Work around it, never through it, and suggest getting persistent pain looked at.
- **Lowest effort wins for food.** Hands-on minutes matter more than total time. The easiest good option beats a takeaway.
- **A wrong picture is worse than none.** The same goes for confident wrong numbers: no prices without price data, and no patterns from one day of data.

## Doc and decision references in comments

The code was designed from a private playbook. Comments cite it by number:

| Ref | Topic |
|---|---|
| doc 02 | The user's routine and context |
| doc 03 | Fitness goals and starting point |
| doc 04 | Fuel: eating patterns, cooking effort, lunches |
| doc 09 | System architecture: the Today engine, memory |
| doc 10 | Behavioural philosophy: tone, guilt, celebration |
| doc 11–18 | Training system, readiness, the Rebuild block, exercise library, coaching and session engines, templates |
| D*, G*, K*, T*, R*, N*, E*, F*, J*, W*, Y* | Decision records from each build phase, summarised in the [build log](BUILD_LOG.md) |
