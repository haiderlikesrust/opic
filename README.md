# Agent Platform + The Oracle

Two parts:

1. **The Oracle** — No-code UI for Pump Tokenized Agent payments (home page).
2. **Agent Platform** — Create and manage AI agents for your crypto tokens; $10 USDC/month per agent.

## Quick start

```bash
npm install
cp .env.example .env.local   # edit DATABASE_URL, NEXTAUTH_SECRET, etc.
npx prisma generate
npx prisma db push
npm run dev
```

## Docker (VPS)

1. Create `.env` from `.env.example` and fill required values (`NEXTAUTH_SECRET`, `CREDENTIAL_SECRET`, `Z_AI_API_KEY`, `PLATFORM_AGENT_MINT`, RPC URLs).
2. Run:

```bash
docker compose up -d --build
```

Services:
- `web` (Next.js app on port `3000`)
- `worker` (agent runner + market-cap watcher)
- `telegram` (optional; start with `docker compose --profile telegram up -d`)

The default compose setup uses SQLite in a persistent Docker volume (`oracle_data`) via:
- `DATABASE_URL=file:/app/data/prod.db`

- **Home:** [http://localhost:3000](http://localhost:3000) — Pay any agent (Oracle).
- **Dashboard:** [http://localhost:3000/dashboard](http://localhost:3000/dashboard) — Create agents, customize, billing, logs.

## Environment

See `.env.example`. Main variables:

- **RPC:** `SOLANA_RPC_URL`, `NEXT_PUBLIC_SOLANA_RPC_URL`
- **DB:** `DATABASE_URL` (Postgres)
- **Auth:** `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- **Billing:** `PLATFORM_AGENT_MINT` — your platform’s tokenized agent mint (receives $10 USDC subscription payments)
- **Secrets:** `CREDENTIAL_SECRET` — used to encrypt Twitter/Telegram/Discord credentials
- **Agent runtime:** `Z_AI_API_KEY` (Z.AI/GLM-5), `AGENT_RUN_INTERVAL_MS` (default 300000). Telegram: per-agent bot token in dashboard.
- **Market-cap watcher:** `AGENT_MARKET_CAP_INTERVAL_MS` (default 120000 / 2 minutes)
- **Worker:** `REDIS_URL` (optional)

## Agent platform

- **Sign in:** Connect Solana wallet on the dashboard, then “Sign in with wallet”.
- **Create agent:** Token name, token contract (mint), optional Twitter/Telegram/Discord, custom system prompt.
- **Customize:** System prompt, personality, tweet frequency, mention monitoring, meme generation, posting/reply behavior, auto-reply rules, trading/on-chain rules.
- **Logs:** Activity log per agent (filled when the worker runs).
- **Billing:** $10 USDC/month per agent. Pay via “Pay 10 USDC & activate” on the agent’s Billing tab (uses same Pump payment flow to `PLATFORM_AGENT_MINT`). Subscription activates when payment is verified; agent is paused when the period ends.

## Running agents (worker)

Run in a separate terminal: `npm run worker`.

- **AI:** GLM-5 via Z.AI (OpenAI-compatible), using `Z_AI_API_KEY`. All agents use this key.
- **Twitter:** Agents post via Twitter API v2. Store OAuth 2 `access_token` per agent with `POST /api/agents/:id/credentials` body `{ "provider": "twitter", "payload": "{\"access_token\":\"...\"}" }`.
- **Telegram:** Each agent has its own bot. In the agent Customize tab: add the **Telegram bot token** (from @BotFather for that agent’s bot) and the **Telegram owner chat ID** (your chat ID from @userinfobot). The worker uses that bot to send you messages. To let users DM the bot and get AI replies (token info, post tweet, etc.), run the **Telegram bot server** in a separate terminal: `npm run telegram`. It uses long polling (Telegraf) — no webhook or public URL needed.

The worker runs every `AGENT_RUN_INTERVAL_MS` ms (default 5 min), loads active agents, calls GLM-5 with tools `post_tweet` and `send_telegram_to_owner`, executes tool calls, and writes to the agent Logs. Credentials are decrypted only in process for that agent.

## The Oracle (payments)

1. User connects wallet and enters **agent mint**, **currency** (USDC/SOL), **amount**.
2. Clicks **Pay** → server builds the invoice and returns a transaction.
3. User signs and sends; server verifies payment.

All payment verification is done on the server.
