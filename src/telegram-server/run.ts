/**
 * Standalone Telegram bot server using Telegraf with long polling.
 * No webhook or public URL needed — run this process and DM your bot.
 *
 * Run: npm run telegram
 * Requires: DATABASE_URL, CREDENTIAL_SECRET, Z_AI_API_KEY (same as app).
 */

import "dotenv/config";
import { config } from "dotenv";
import path from "path";

config({ path: path.join(process.cwd(), ".env.local") });
config({ path: path.join(process.cwd(), ".env") });

import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { PrismaClient } from "@prisma/client";
import { decryptCredential } from "../lib/encrypt";
import { deleteWebhook } from "../lib/telegram";
import { handleTelegramMessage } from "../lib/telegram-handler";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.CREDENTIAL_SECRET) {
    console.error("[telegram-server] CREDENTIAL_SECRET is not set");
    process.exit(1);
  }
  if (!process.env.Z_AI_API_KEY) {
    console.error("[telegram-server] Z_AI_API_KEY is not set");
    process.exit(1);
  }

  const agents = await prisma.agent.findMany({
    where: { credentials: { some: { provider: "telegram" } } },
    include: { credentials: true },
  });

  if (agents.length === 0) {
    console.log("[telegram-server] No agents with Telegram bot token found. Add a token in the dashboard (Customize → Telegram).");
    process.exit(0);
  }

  const bots: Telegraf[] = [];

  for (const agent of agents) {
    const cred = agent.credentials.find((c) => c.provider === "telegram");
    if (!cred) continue;

    let botToken: string;
    try {
      const raw = decryptCredential(cred.encrypted);
      const parsed = JSON.parse(raw) as { bot_token?: string };
      if (!parsed.bot_token) continue;
      botToken = parsed.bot_token;
    } catch {
      console.warn("[telegram-server] Could not decrypt Telegram token for agent", agent.id);
      continue;
    }

    await deleteWebhook(botToken);

    const bot = new Telegraf(botToken);
    const agentId = agent.id;

    bot.on(message("text"), async (ctx) => {
      const text = ctx.message.text?.trim();
      if (!text) return;
      console.log("[telegram-server] message", { agentId, chatId: ctx.chat.id, text: text.slice(0, 60) });
      await handleTelegramMessage(agentId, ctx.chat.id, text);
    });

    bot.catch((err) => {
      console.error("[telegram-server] bot error", agentId, err);
    });

    bots.push(bot);
    console.log("[telegram-server] polling for agent:", agent.name || agentId);
  }

  if (bots.length === 0) {
    console.log("[telegram-server] No valid Telegram tokens. Exiting.");
    process.exit(0);
  }

  await Promise.all(bots.map((bot) => bot.launch()));

  console.log("[telegram-server] All bots running. DM any of your bots to get replies.");

  process.once("SIGINT", () => {
    bots.forEach((b) => b.stop("SIGINT"));
  });
  process.once("SIGTERM", () => {
    bots.forEach((b) => b.stop("SIGTERM"));
  });
}

main().catch((err) => {
  console.error("[telegram-server]", err);
  process.exit(1);
});
