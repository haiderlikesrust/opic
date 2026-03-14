/**
 * Shared Telegram message handler: runs GLM with tools (Pump.fun, Twitter, etc.) and sends reply.
 * Used by both the webhook route and the Telegraf polling server.
 */

import type OpenAI from "openai";
import { prisma } from "@/lib/db";
import { decryptCredential } from "@/lib/encrypt";
import { runChatWithTools, type ConversationTurn } from "@/lib/ai/glm";
import { getCoinData } from "@/lib/pump";
import { postTweet } from "@/lib/twitter";
import { sendMessageToOwner } from "@/lib/telegram";

const MEMORY_LIMIT = 20;
const MEMORY_PRUNE_KEEP = 50;

export const TELEGRAM_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_token_info",
      description:
        "Fetch live token/coin data from Pump.fun for a given mint. Use this when the user asks about a token's price, market cap, description, supply, creator, social links, etc. If no mint is provided, use this agent's token mint.",
      parameters: {
        type: "object",
        properties: {
          mint: {
            type: "string",
            description:
              "Pump.fun token mint address. Omit to use this agent's token.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "post_tweet",
      description:
        "Post a tweet on the agent's connected X (Twitter) account. Use when the user asks to post something on Twitter.",
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
      description: "Send a message to the agent owner on Telegram.",
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

/**
 * Handle an incoming Telegram message: load agent, run AI with tools, send reply.
 * chatId can be number or string (Telegram accepts both).
 */
export async function handleTelegramMessage(
  agentId: string,
  chatId: string | number,
  text: string
): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { config: true, credentials: true },
  });
  if (!agent) {
    console.log("[telegram-handler] agent not found", agentId);
    return;
  }

  const telegramCred = agent.credentials.find((c) => c.provider === "telegram");
  if (!telegramCred) return;

  let botToken: string;
  try {
    const raw = decryptCredential(telegramCred.encrypted);
    const parsed = JSON.parse(raw) as { bot_token?: string };
    if (!parsed.bot_token) return;
    botToken = parsed.bot_token;
  } catch {
    return;
  }

  let twitterAccessToken: string | null = null;
  const twitterCred = agent.credentials.find((c) => c.provider === "twitter");
  if (twitterCred) {
    try {
      const raw = decryptCredential(twitterCred.encrypted);
      const parsed = JSON.parse(raw) as { access_token?: string };
      twitterAccessToken = parsed.access_token ?? null;
    } catch {
      // continue without Twitter
    }
  }

  const telegramChatId = agent.config?.telegramChatId ?? null;
  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const dashboardUrl = baseUrl
    ? `${baseUrl.replace(/\/$/, "")}/dashboard/agents/${agentId}`
    : "";

  const systemParts = [
    agent.systemPrompt,
    agent.config?.personality && `Personality: ${agent.config.personality}`,
    agent.config?.replyBehavior && `Reply behavior: ${agent.config.replyBehavior}`,
    "You reply in this agent's Telegram bot. You can fetch token data (get_token_info), post tweets, or message the owner. Reply in plain text only.",
    "Formatting rules: Keep replies SHORT—usually 2–4 sentences. No long bullet lists, no 'Available commands' or 'What I can do' sections unless the user explicitly asks what you can do. When sharing token info, give a brief readable summary (name, symbol, market cap, one-line description); do not paste the raw mint address or ATH unless asked. Only mention the dashboard or settings link when the user asks how to connect Twitter or change settings. Avoid emoji unless one fits naturally. Sound like a helpful person, not a help menu.",
    "You have conversation history above. Use it: if you just asked for tweet content and the user sends a short message like 'hehe' or 'hello world', treat that as the tweet text and post it. If you asked a question, treat the next message as the answer. Stay in context—do not reset to a generic greeting when the user is continuing the same thread.",
    "After a successful post_tweet tool call, include the tweet URL in your reply. If the user later asks for the link, return that latest tweet URL from context.",
    agent.tokenMint &&
      `This agent's token mint: ${agent.tokenMint}. Use get_token_info with this mint when the user asks about 'the token' or 'this token' without specifying another.`,
    dashboardUrl &&
      "Dashboard for settings/Twitter (only share when asked): " + dashboardUrl,
  ].filter(Boolean);
  const systemContent = systemParts.join("\n\n");

  const executeTool = async (name: string, argsJson: string): Promise<string> => {
    const args = (() => {
      try {
        return JSON.parse(argsJson || "{}") as Record<string, unknown>;
      } catch {
        return {};
      }
    })();

    if (name === "get_token_info") {
      const mint =
        (typeof args.mint === "string" ? args.mint.trim() : null) || agent.tokenMint;
      if (!mint) return JSON.stringify({ error: "No token mint configured for this agent." });
      const data = await getCoinData(mint);
      if (!data) return JSON.stringify({ error: "Token not found or API error." });
      return JSON.stringify(data);
    }

    if (name === "post_tweet") {
      const tweetText = typeof args.text === "string" ? args.text.trim() : "";
      if (!tweetText) return JSON.stringify({ error: "Tweet text is required." });
      if (!twitterAccessToken) {
        return JSON.stringify({
          error: "Twitter is not connected. Add Twitter keys in the dashboard: " + dashboardUrl,
        });
      }
      const result = await postTweet(twitterAccessToken, tweetText);
      if (result.id) {
        return JSON.stringify({
          ok: true,
          tweet_id: result.id,
          tweet_url: `https://x.com/i/web/status/${result.id}`,
        });
      }
      return JSON.stringify({ error: result.error ?? "Failed to post." });
    }

    if (name === "send_telegram_to_owner") {
      const message = typeof args.message === "string" ? args.message.trim() : "";
      if (!message) return JSON.stringify({ error: "Message is required." });
      if (!telegramChatId) {
        return JSON.stringify({ error: "Owner Telegram chat ID is not set in the dashboard." });
      }
      const result = await sendMessageToOwner(telegramChatId, message, botToken);
      return result.ok ? JSON.stringify({ ok: true }) : JSON.stringify({ error: result.error });
    }

    return JSON.stringify({ error: "Unknown tool." });
  };

  const chatIdStr = String(chatId);

  const recent = await prisma.conversationMessage.findMany({
    where: { agentId, chatId: chatIdStr },
    orderBy: { createdAt: "asc" },
    take: MEMORY_LIMIT * 2,
  });
  const lastN = recent.slice(-MEMORY_LIMIT);
  const conversationHistory: ConversationTurn[] = lastN.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  try {
    const reply = await runChatWithTools(
      systemContent,
      text,
      TELEGRAM_TOOLS,
      executeTool,
      conversationHistory
    );
    const toSend = (reply || "I'm here.").slice(0, 4000);
    await sendMessageToOwner(chatIdStr, toSend, botToken);

    await prisma.conversationMessage.createMany({
      data: [
        { agentId, chatId: chatIdStr, role: "user", content: text },
        { agentId, chatId: chatIdStr, role: "assistant", content: toSend },
      ],
    });

    const count = await prisma.conversationMessage.count({
      where: { agentId, chatId: chatIdStr },
    });
    if (count > MEMORY_PRUNE_KEEP) {
      const toDelete = count - MEMORY_PRUNE_KEEP;
      const oldest = await prisma.conversationMessage.findMany({
        where: { agentId, chatId: chatIdStr },
        orderBy: { createdAt: "asc" },
        take: toDelete,
        select: { id: true },
      });
      if (oldest.length > 0) {
        await prisma.conversationMessage.deleteMany({
          where: { id: { in: oldest.map((r: { id: string }) => r.id) } },
        });
      }
    }
  } catch (e) {
    console.error("[telegram-handler]", e);
    try {
      await sendMessageToOwner(
        chatIdStr,
        "Something went wrong. Please try again later.",
        botToken
      );
    } catch {}
  }
}
