/**
 * Agent runner worker: loads active agents, runs GLM-5 with tools (Twitter, Telegram), executes actions.
 * Run: npm run worker
 * Requires: DATABASE_URL, Z_AI_API_KEY, CREDENTIAL_SECRET. Each agent has its own Telegram bot token (stored in credentials).
 */

import "dotenv/config";
import { config } from "dotenv";
import path from "path";

config({ path: path.join(process.cwd(), ".env.local") });
config({ path: path.join(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";
import { decryptCredential } from "../lib/encrypt";
import { createChatCompletion, createChatCompletionWithTools } from "../lib/ai/glm";
import {
  getAuthenticatedUser,
  getReplyThreadContext,
  getUserMentions,
  postTweet,
  type TwitterTweet,
} from "../lib/twitter";
import { sendMessageToOwner } from "../lib/telegram";
import type OpenAI from "openai";

const prisma = new PrismaClient();
const DEFAULT_MARKET_CAP_INTERVAL_MS = 120_000;

function safeParseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toRelativeThreadLine(t: TwitterTweet): string {
  const created = t.created_at ? new Date(t.created_at).toISOString() : "unknown-time";
  return `[${created}] ${t.text.replace(/\s+/g, " ").trim()}`;
}

function formatCompactUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

async function fetchTokenMarketCapUsd(tokenMint: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(tokenMint)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as
      | { usd_market_cap?: number; market_cap?: number }
      | null;
    const cap = data?.usd_market_cap ?? data?.market_cap;
    if (typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0) return null;
    return cap;
  } catch {
    return null;
  }
}

async function runMarketCapWatch(agentId: string, minIntervalMs: number): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { credentials: true },
  });
  if (!agent || agent.status !== "active") return;

  const sub = await prisma.subscription.findFirst({
    where: { agentId, status: "active" },
    orderBy: { periodEnd: "desc" },
  });
  if (!sub || new Date(sub.periodEnd) < new Date()) return;

  const twitterCred = agent.credentials.find((c) => c.provider === "twitter");
  if (!twitterCred) return;

  let twitterAccessToken: string | null = null;
  try {
    const raw = decryptCredential(twitterCred.encrypted);
    const parsed = JSON.parse(raw) as { access_token?: string };
    twitterAccessToken = parsed.access_token ?? null;
  } catch {
    await prisma.agentLog.create({
      data: { agentId, level: "warn", action: "market_cap_watch", message: "Failed to decrypt Twitter credentials" },
    });
    return;
  }
  if (!twitterAccessToken) return;

  const lastSampleLog = await prisma.agentLog.findFirst({
    where: { agentId, action: "market_cap_sample" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, metadata: true },
  });
  if (lastSampleLog && Date.now() - lastSampleLog.createdAt.getTime() < minIntervalMs) {
    return;
  }

  const currentCap = await fetchTokenMarketCapUsd(agent.tokenMint);
  if (!currentCap) {
    await prisma.agentLog.create({
      data: {
        agentId,
        level: "warn",
        action: "market_cap_watch",
        message: "Could not fetch token market cap from Pump.fun",
      },
    });
    return;
  }

  const previousCap = safeParseJson<{ marketCapUsd?: number }>(lastSampleLog?.metadata)?.marketCapUsd ?? null;
  if (!previousCap || previousCap <= 0) {
    await prisma.agentLog.create({
      data: {
        agentId,
        level: "info",
        action: "market_cap_sample",
        message: `Market cap baseline set: ${formatCompactUsd(currentCap)}`,
        metadata: JSON.stringify({ marketCapUsd: currentCap }),
      },
    });
    return;
  }

  const ratio = currentCap / previousCap;
  const pct = ((ratio - 1) * 100).toFixed(1);
  const tokenLabel = agent.tokenName || "token";
  const trendDirective =
    ratio > 1.5
      ? "Market cap surged strongly. Write a bullish momentum post celebrating the move."
      : "Market cap did not surge. Write a confidence-building bullish post for the community.";
  const marketCapPrompt = [
    `Token: ${tokenLabel}`,
    `Previous market cap: ${formatCompactUsd(previousCap)}`,
    `Current market cap: ${formatCompactUsd(currentCap)}`,
    `Change: ${pct}% over ~2 minutes`,
    `Ratio (new/old): ${ratio.toFixed(3)}`,
    trendDirective,
    "Constraints: max 260 characters, plain text only, no URLs, no hashtags spam, confident tone, 1-2 emojis max.",
    "Return only the tweet text.",
  ].join("\n");
  let tweetText = "";
  try {
    const aiTweet = await createChatCompletion(agent.systemPrompt, marketCapPrompt);
    tweetText = aiTweet.replace(/\s+/g, " ").trim().slice(0, 280);
  } catch {
    tweetText = "";
  }
  if (!tweetText) {
    tweetText =
      ratio > 1.5
        ? `🚀 ${tokenLabel} market cap jumped ${pct}% in ~2m (${formatCompactUsd(previousCap)} -> ${formatCompactUsd(currentCap)}). Bullish momentum is live.`
        : `📈 ${tokenLabel} market cap is ${formatCompactUsd(currentCap)}. Building steady bullish momentum with the community.`;
  }

  const posted = await postTweet(twitterAccessToken, tweetText.slice(0, 280));
  if (posted.id) {
    await prisma.agentLog.create({
      data: {
        agentId,
        level: "info",
        action: "market_cap_post",
        message: `Posted market-cap update (${pct}%)`,
        metadata: JSON.stringify({
          previousCapUsd: previousCap,
          currentCapUsd: currentCap,
          ratio,
          tweetId: posted.id,
        }),
      },
    });
  } else {
    await prisma.agentLog.create({
      data: {
        agentId,
        level: "error",
        action: "market_cap_post",
        message: posted.error ?? "Failed to post market-cap update",
        metadata: JSON.stringify({
          previousCapUsd: previousCap,
          currentCapUsd: currentCap,
          ratio,
        }),
      },
    });
  }

  await prisma.agentLog.create({
    data: {
      agentId,
      level: "info",
      action: "market_cap_sample",
      message: `Market cap sample: ${formatCompactUsd(currentCap)}`,
      metadata: JSON.stringify({ marketCapUsd: currentCap }),
    },
  });
}

async function getMentionCursor(agentId: string): Promise<string | null> {
  const log = await prisma.agentLog.findFirst({
    where: { agentId, action: "twitter_mentions_cursor" },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  const parsed = safeParseJson<{ since_id?: string }>(log?.metadata);
  return parsed?.since_id ?? null;
}

async function saveMentionCursor(agentId: string, sinceId: string): Promise<void> {
  await prisma.agentLog.create({
    data: {
      agentId,
      level: "info",
      action: "twitter_mentions_cursor",
      message: `Updated mention cursor: ${sinceId}`,
      metadata: JSON.stringify({ since_id: sinceId }),
    },
  });
}

async function processTwitterReplies(args: {
  agentId: string;
  agentName: string;
  systemPrompt: string;
  replyBehavior?: string | null;
  personality?: string | null;
  accessToken: string;
}): Promise<void> {
  const { agentId, agentName, systemPrompt, replyBehavior, personality, accessToken } = args;
  const me = await getAuthenticatedUser(accessToken);
  if (!me.id) {
    await prisma.agentLog.create({
      data: {
        agentId,
        level: "error",
        action: "twitter_mentions",
        message: me.error ?? "Failed to resolve authenticated Twitter user",
      },
    });
    return;
  }

  const sinceId = await getMentionCursor(agentId);
  const mentionsResult = await getUserMentions(accessToken, me.id, sinceId ?? undefined);
  if (!mentionsResult.mentions) {
    await prisma.agentLog.create({
      data: {
        agentId,
        level: "error",
        action: "twitter_mentions",
        message: mentionsResult.error ?? "Failed to fetch mentions",
      },
    });
    return;
  }
  const fetchedMentions = mentionsResult.mentions
    .filter((m) => m.author_id !== me.id)
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));

  // First run: initialize cursor to latest mention and DO NOT backfill old mentions.
  if (!sinceId) {
    const newest = fetchedMentions[fetchedMentions.length - 1];
    if (newest?.id) {
      await saveMentionCursor(agentId, newest.id);
      await prisma.agentLog.create({
        data: {
          agentId,
          level: "info",
          action: "twitter_mentions",
          message: "Initialized mention cursor; skipping historical mentions",
          metadata: JSON.stringify({ initialized_since_id: newest.id }),
        },
      });
    }
    return;
  }

  const mentions = fetchedMentions;

  if (mentions.length === 0) return;

  for (const mention of mentions) {
    const thread = await getReplyThreadContext(accessToken, mention, 8);
    const threadLines = thread.map((t) => `- ${toRelativeThreadLine(t)}`).join("\n");
    const prompt = [
      `You are replying on X for agent "${agentName}".`,
      "Reply to the latest tweet in this thread while respecting the prior context.",
      "Keep it concise, under 260 characters, plain text only, no hashtags unless naturally needed.",
      `Thread context (oldest to newest):\n${threadLines}`,
      `Latest mention tweet id: ${mention.id}`,
      "Return only the final reply text.",
    ].join("\n\n");
    const replySystem = [
      systemPrompt,
      personality && `Personality: ${personality}`,
      replyBehavior && `Reply behavior: ${replyBehavior}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const replyTextRaw = await createChatCompletion(replySystem, prompt);
    const replyText = replyTextRaw.replace(/\s+/g, " ").trim().slice(0, 280);
    if (!replyText) continue;

    const sent = await postTweet(accessToken, replyText, { replyToTweetId: mention.id });
    if (sent.id) {
      await prisma.agentLog.create({
        data: {
          agentId,
          level: "info",
          action: "twitter_reply",
          message: `Replied to mention ${mention.id}`,
          metadata: JSON.stringify({
            mention_id: mention.id,
            reply_tweet_id: sent.id,
            reply_url: `https://x.com/i/web/status/${sent.id}`,
            reply_preview: replyText.slice(0, 200),
          }),
        },
      });
    } else {
      await prisma.agentLog.create({
        data: {
          agentId,
          level: "error",
          action: "twitter_reply",
          message: sent.error ?? `Failed to reply to mention ${mention.id}`,
          metadata: JSON.stringify({ mention_id: mention.id }),
        },
      });
    }
  }

  const newestId = mentions[mentions.length - 1]?.id;
  if (newestId) {
    await saveMentionCursor(agentId, newestId);
  }
}

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "post_tweet",
      description: "Post a tweet on the agent's connected X (Twitter) account. Use for announcements, updates, or engagement.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Tweet content, 1-280 characters" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_telegram_to_owner",
      description: "Send a message to the agent owner on Telegram. Use for alerts, questions, or reporting.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Message to send to the owner" },
        },
        required: ["message"],
      },
    },
  },
];

async function runAgentTurn(agentId: string): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { config: true, credentials: true },
  });
  if (!agent || agent.status !== "active") return;

  const sub = await prisma.subscription.findFirst({
    where: { agentId, status: "active" },
    orderBy: { periodEnd: "desc" },
  });
  if (!sub || new Date(sub.periodEnd) < new Date()) {
    await prisma.agent.update({ where: { id: agentId }, data: { status: "paused" } });
    return;
  }

  const config = agent.config;
  const systemPrompt = [
    agent.systemPrompt,
    config?.personality && `Personality: ${config.personality}`,
    config?.postingBehavior && `Posting behavior: ${config.postingBehavior}`,
    config?.tweetFrequency && `Tweet frequency preference: ${config.tweetFrequency}`,
    "You have access to tools: post_tweet (post on X), send_telegram_to_owner (message the owner on Telegram). Use them when appropriate.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const userPrompt = "Current time: " + new Date().toISOString() + ". Decide if you should post a tweet or send a short update to the owner. If yes, use the appropriate tool with one clear action. If no, reply with a brief reason.";

  let twitterAccessToken: string | null = null;
  const twitterCred = agent.credentials.find((c) => c.provider === "twitter");
  if (twitterCred) {
    try {
      const raw = decryptCredential(twitterCred.encrypted);
      const parsed = JSON.parse(raw) as { access_token?: string };
      twitterAccessToken = parsed.access_token ?? null;
    } catch {
      await prisma.agentLog.create({
        data: { agentId, level: "warn", action: "credentials", message: "Failed to decrypt Twitter credentials" },
      });
    }
  }

  const telegramChatId = config?.telegramChatId ?? null;
  let telegramBotToken: string | null = null;
  const telegramCred = agent.credentials.find((c) => c.provider === "telegram");
  if (telegramCred) {
    try {
      const raw = decryptCredential(telegramCred.encrypted);
      const parsed = JSON.parse(raw) as { bot_token?: string };
      telegramBotToken = parsed.bot_token ?? null;
    } catch {
      await prisma.agentLog.create({
        data: { agentId, level: "warn", action: "credentials", message: "Failed to decrypt Telegram credentials" },
      });
    }
  }

  try {
    const { content, toolCalls } = await createChatCompletionWithTools(
      systemPrompt,
      userPrompt,
      TOOLS,
      []
    );

    if (content) {
      await prisma.agentLog.create({
        data: { agentId, level: "info", action: "reply", message: content.slice(0, 500) },
      });
    }

    for (const tc of toolCalls) {
      if (tc.function.name === "post_tweet" && twitterAccessToken) {
        const args = JSON.parse(tc.function.arguments ?? "{}") as { text?: string };
        const text = typeof args.text === "string" ? args.text.trim() : "";
        if (text) {
          const result = await postTweet(twitterAccessToken, text);
          if (result.id) {
            await prisma.agentLog.create({
              data: { agentId, level: "info", action: "post_tweet", message: `Posted: ${text.slice(0, 80)}…` },
            });
          } else {
            await prisma.agentLog.create({
              data: { agentId, level: "error", action: "post_tweet", message: result.error ?? "Failed" },
            });
          }
        }
      } else if (tc.function.name === "send_telegram_to_owner" && telegramChatId && telegramBotToken) {
        const args = JSON.parse(tc.function.arguments ?? "{}") as { message?: string };
        const message = typeof args.message === "string" ? args.message.trim() : "";
        if (message) {
          const result = await sendMessageToOwner(telegramChatId, message, telegramBotToken);
          if (result.ok) {
            await prisma.agentLog.create({
              data: { agentId, level: "info", action: "telegram_owner", message: `Sent: ${message.slice(0, 80)}…` },
            });
          } else {
            await prisma.agentLog.create({
              data: { agentId, level: "error", action: "telegram_owner", message: result.error ?? "Failed" },
            });
          }
        }
      }
    }
  } catch (e) {
    await prisma.agentLog.create({
      data: {
        agentId,
        level: "error",
        action: "run",
        message: e instanceof Error ? e.message : "Agent run failed",
      },
    });
  }

  // Monitor and reply to new mentions/replies with thread context.
  if (twitterAccessToken && (config?.mentionMonitoring ?? true)) {
    try {
      await processTwitterReplies({
        agentId,
        agentName: agent.name,
        systemPrompt: agent.systemPrompt,
        replyBehavior: config?.replyBehavior,
        personality: config?.personality,
        accessToken: twitterAccessToken,
      });
    } catch (e) {
      await prisma.agentLog.create({
        data: {
          agentId,
          level: "error",
          action: "twitter_mentions",
          message: e instanceof Error ? e.message : "Mention monitoring failed",
        },
      });
    }
  }
}

async function main(): Promise<void> {
  console.log("[worker] Starting agent runner…");
  const intervalMs = parseInt(process.env.AGENT_RUN_INTERVAL_MS ?? "300000", 10); // 5 min default
  const marketCapIntervalMs = parseInt(
    process.env.AGENT_MARKET_CAP_INTERVAL_MS ?? String(DEFAULT_MARKET_CAP_INTERVAL_MS),
    10,
  );

  const tick = async () => {
    const agents = await prisma.agent.findMany({
      where: { status: "active" },
      select: { id: true },
    });
    for (const a of agents) {
      await runAgentTurn(a.id);
    }
  };

  const marketCapTick = async () => {
    const agents = await prisma.agent.findMany({
      where: { status: "active" },
      select: { id: true },
    });
    for (const a of agents) {
      await runMarketCapWatch(a.id, marketCapIntervalMs);
    }
  };

  await tick();
  await marketCapTick();
  setInterval(tick, intervalMs);
  setInterval(marketCapTick, marketCapIntervalMs);
  console.log(`[worker] Running every ${intervalMs / 1000}s`);
  console.log(`[worker] Market-cap watch every ${marketCapIntervalMs / 1000}s`);
}

main().catch((err) => {
  console.error("[worker]", err);
  process.exit(1);
});
