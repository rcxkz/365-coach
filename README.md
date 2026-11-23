<sub>● A Rykz build · No. 03 · v1.0</sub>

# Project 365

A calm personal coach for training and food that you run yourself. It plans each day's session around how you feel, plans the week's meals around what's in your kitchen, and never makes you feel behind.

Built with [Claude Code](https://claude.com/claude-code): designed, written, tested and reviewed phase by phase. See [the build log](docs/BUILD_LOG.md).

**[Try the demo](https://365-coach.vercel.app)** · **[Deploy your own](#deploy-your-own)** · [How it works](docs/HOW_IT_WORKS.md)

<img src="docs/screenshots/desktop.png" width="820" alt="On a desktop the app runs in a phone-sized frame beside a QR code to open it on your phone">

<p>
  <img src="docs/screenshots/today.png" width="200" alt="Today: the day's session and dinner">
  <img src="docs/screenshots/train.png" width="200" alt="Train: a session with set logging">
  <img src="docs/screenshots/week.png" width="200" alt="This week: meals and an aisle-grouped shopping list">
  <img src="docs/screenshots/journal.png" width="200" alt="Journal: how you feel">
</p>

## What it does

- **Today:** one short list for the day: the session, tonight's dinner, tomorrow's lunch.
- **Train:**
  - **Planning:** sessions are planned from your chosen plan, your equipment, your session length and how you feel this morning.
  - **Logging:** one tap per set, and it works offline in the gym.
  - **Guides:** tap any exercise for start/finish photos and a demo link.
  - **Breaks:** if you're ill or take a break, pause. When you're back, the first three sessions ease you in.
- **Fuel:**
  - **Kitchen:** tap through what's in (in / running low / out).
  - **Week plan:** plans the week's dinners and lunch preps around what you have.
  - **Shopping:** one shopping list grouped by aisle.
  - **Your meals:** add your own by hand, or describe one and let the AI fill it in.
- **Journal:** tap how you feel (mood, stress, energy, soreness, stomach) plus anything you choose to track. High stress means a lighter session and an easier dinner; the weekly review looks for patterns.
- **Weekly review:** "step up / repeat / ease off" for each exercise, with a short written summary.
- **Built for your phone:** full screen on a phone and installable like an app. On a desktop it runs in a phone-sized frame, with a QR code to open it on your phone.
- **Make it yours:** a two-minute setup covering your plan, days a week, equipment, areas to look after, dietary rules, household and which parts you want.

### Principles

- **No guilt:** days a week is a limit, never a target, and nothing is ever "missed" or owed back.
- **The AI never blocks you:** it writes plans ahead of time, and if it's slow or unavailable, rules-based planning takes over. The app always has a plan.
- **Rules decide what's safe, the AI decides what's best:** pain, readiness, equipment and dietary rules filter the options in code before the AI picks among them.

## Demo

The demo is a made-up person, Alex, with two weeks of history. It's open to everyone, resets every night, and runs rules-only (no AI). **→ [365-coach.vercel.app](https://365-coach.vercel.app)**

To run the demo locally:

```bash
npm install
DEMO_MODE=1 npm run demo   # builds Alex in a local database (PGlite, no setup)
DEMO_MODE=1 npm run dev    # http://localhost:3000
```

## Deploy your own

Your own app, your own database, your own data. One person per deployment, protected by a passcode.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frcxkz%2F365-coach&project-name=365-coach&repository-name=365-coach&env=APP_PASSCODE&envDescription=A%20passphrase%20you%27ll%20type%20to%20unlock%20your%20copy.%20Only%20someone%20with%20it%20can%20open%20the%20app.&envLink=https%3A%2F%2Fgithub.com%2Frcxkz%2F365-coach%23deploy-your-own&stores=%5B%7B%22type%22%3A%22integration%22,%22integrationSlug%22%3A%22neon%22,%22productSlug%22%3A%22neon%22,%22protocol%22%3A%22storage%22%7D%5D)

**About five minutes, one value to type:**

1. **Click the button.** Vercel copies the repo to your GitHub and creates a free Neon database for it. Sign in or sign up for each when asked.
2. **Choose a passcode** when it asks for `APP_PASSCODE`. Use a passphrase you'll remember, not a short PIN. That's the only value you type.
3. **Wait for the deploy to finish,** then open your new app. Its first build creates the database tables.
4. **Unlock it** with your passcode, tap **Make it yours** (two minutes of taps), then **Plan today**.
5. **On iPhone:** open it in Safari → Share → **Add to Home Screen**, so it opens like an app.

If something is missing, for example the database wasn't created, the app shows a **Finish setting up** page that says exactly what to do. It doesn't show an error.

**Optional extras,** each one an environment variable in Vercel (Settings → Environment Variables), then a redeploy:

- **The AI coach:** your own key from Claude, ChatGPT, Gemini or another provider. See [AI coach](#ai-coach). Without one, everything works rules-only.
- **Morning planning and reminder:** add `CRON_SECRET` (any long random text, e.g. from a password manager) so the day plans itself before you wake. Without it, the day plans when you tap **Plan today**. For the notification, also add the two VAPID keys below.
- **Your time zone:** `APP_TIME_ZONE`, e.g. `America/New_York`.

### Environment

| Variable | Needed for |
|---|---|
| `APP_PASSCODE` | **Required.** The passcode you type to unlock the app. Use a passphrase, not a PIN. |
| `DATABASE_URL` | **Required, set for you** by the Neon database the Deploy button creates. Locally, leave it unset and the app uses a built-in database. |
| `CRON_SECRET` | Optional. Switches on the morning job: plans the day before you wake, and sends the reminder. Any long random text. |
| `AUTH_SECRET` | Optional. Signs the login cookie. Without it, the cookie is signed with the database's connection string, so it's still a long secret only your server knows. |
| `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY` / `AI_API_KEY` | Optional. Your own key for the AI coach, from Claude (default), ChatGPT or another provider: see [AI coach](#ai-coach). |
| `APP_TIME_ZONE` | Optional. Your time zone, e.g. `America/New_York`. Defaults to `Europe/London`. |
| `MAKER_STAMP` | Optional. Set to `1` to show the maker's stamp in Settings. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Optional. The morning push notification (needs `CRON_SECRET` too). Generate them with `npx web-push generate-vapid-keys`. |

**Changing the passcode** signs every device out. That's the way to lock out a lost phone.

### AI coach

Your copy only ever uses accounts you add yourself: your own Vercel project, your own database, and your own AI key. Nothing connects back to the original.

The app was built and tuned on **Claude**, which is the default. It also runs on any provider that speaks OpenAI's chat format. Results on other models may vary. If a reply comes back unusable, the rules-based planner steps in, so nothing breaks.

In your Vercel project, open **Settings → Environment Variables**, add the lines for your provider, and redeploy:

| Provider | Environment variables |
|---|---|
| **Claude** (default) | `ANTHROPIC_API_KEY` = your key from the [Claude Console](https://console.anthropic.com). Runs on Claude Sonnet 5.5; set `AI_MODEL` to use another Claude model. |
| **ChatGPT / OpenAI** | `OPENAI_API_KEY` = your key from [platform.openai.com](https://platform.openai.com). Optional: `AI_MODEL` (default `gpt-5-mini`). |
| **Gemini** | `AI_API_KEY` = your key from [Google AI Studio](https://aistudio.google.com) · `AI_BASE_URL` = `https://generativelanguage.googleapis.com/v1beta/openai` · `AI_MODEL` = e.g. `gemini-2.5-flash` |
| **OpenRouter** (hundreds of models) | `AI_API_KEY` = your key from [openrouter.ai](https://openrouter.ai) · `AI_BASE_URL` = `https://openrouter.ai/api/v1` · `AI_MODEL` = e.g. `meta-llama/llama-3.3-70b-instruct` |
| **Groq** | `AI_API_KEY` · `AI_BASE_URL` = `https://api.groq.com/openai/v1` · `AI_MODEL` |
| **A local model** (running it on your own computer) | `AI_API_KEY` = anything · `AI_BASE_URL` = `http://localhost:11434/v1` (Ollama) · `AI_MODEL` = e.g. `llama3.2` |

Once a key is set, the plan button on Today says "Plan tomorrow with AI".

**Choosing a Claude model.** Set `AI_MODEL` to any Claude model and redeploy:

| `AI_MODEL` | Good for | Price per million tokens (in / out) |
|---|---|---|
| `claude-haiku-5-5` | The cheapest. Fine for picking meals; plans are simpler. | $0.10 / $0.50 |
| `claude-sonnet-5-5` *(default)* | The balance this app is tuned for. | $2 / $10 |
| `claude-opus-5-5` | More careful planning, for a little more. | $4 / $20 |
| `claude-fable-5-2` | Anthropic's most capable model. More than this app needs, at the top price. | $8 / $40 |

Prices are Anthropic's list prices in November 2026, so check the [current prices](https://www.anthropic.com/pricing). When the model you pick is rate limited, the app tries `AI_MODEL_FALLBACK` if you set one, and otherwise plans rules-only for that request.

**Good to know:**

- **API keys only.** A Claude Pro or Max subscription doesn't cover the API, and nor does ChatGPT Plus. Each is billed separately, pay as you go.
- **Keys stay with you.** They live in your Vercel settings and are never written into the code. If a key is missing or out of credit, the app says so on Today and plans rules-only.
- **Two keys set?** Claude is used. Set `AI_PROVIDER=openai` to use the other one.
- **Backup model.** `AI_MODEL_FALLBACK` names a second model to try when the first is rate limited.
- **Smaller models** follow the format less reliably. When a reply doesn't fit, that feature falls back to the rules for the day.

**Morning job timing:** `vercel.json` runs it at 06:00 and 07:00 UTC, which lands in the 7am hour in the UK all year round. For another time zone, change those two hours so one of them falls in your 7am hour. On Vercel's free plan each job runs at some point within its hour.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000, no database or passcode needed locally
npm test        # unit and end-to-end tests
npm run build
```

The stack is Next.js (App Router), TypeScript, Tailwind, Postgres via Drizzle (Neon in production, PGlite locally) and Claude via the Anthropic SDK, with an adapter for OpenAI-compatible providers (`src/ai/client.ts`). The layer rules are in [AGENTS.md](AGENTS.md) and each `src/*` folder's README.

## Make the look yours

The whole look lives in one folder, `src/theme/`:

| File | What it holds |
|---|---|
| `theme.css` | Every colour and the corner radius. Change the palette block at the top. |
| `fonts.ts` | The three typefaces (headings, text, figures). Any Google font works. |
| `brand.ts` | The small maker's stamp in Settings, hidden on your copy unless you set `MAKER_STAMP=1`. |

The rest of the app only uses names like `--background` and `--highlight`, never a colour value, and a test fails if one creeps in. Keep text at 4.5:1 contrast or better against your background.

The look it ships with is the Rykz Design DNA, dark version:

| | |
|---|---|
| Display | DM Serif Display, with Source Serif 4 for text and Geist Mono for labels and figures |
| Accent | Brass #C99A2E on ink #181818 |
| Mood | Calm, steady, unhurried |

It's one dark theme, with square edges and no shadows. Colour is kept for meaning: brass marks where you are, and the readiness dots are go, ease and stop.

## Licence

[MIT](LICENSE)
