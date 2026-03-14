import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { encryptCredential } from "@/lib/encrypt";

function fallbackTokenNameFromMint(mint: string): string {
  return `TOKEN-${mint.slice(0, 6).toUpperCase()}`;
}

async function fetchTokenNameFromPumpFun(mint: string): Promise<string | null> {
  const url = `https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(mint)}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;

    const data = (await response.json()) as
      | { symbol?: string; name?: string; tokenName?: string; ticker?: string }
      | null;

    const name =
      data?.symbol?.trim() ||
      data?.tokenName?.trim() ||
      data?.ticker?.trim() ||
      data?.name?.trim();

    return name || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ agents: [] });
  }
  const userId = (session.user as unknown as { id: string }).id;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const agents = await prisma.agent.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      subscriptions: {
        where: { status: "active" },
        orderBy: { periodEnd: "desc" },
        take: 1,
      },
      credentials: {
        select: { provider: true },
      },
      logs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const list = await Promise.all(
    agents.map(async (a) => {
      const tweetsToday = await prisma.agentLog.count({
        where: { agentId: a.id, action: "post_tweet", createdAt: { gte: dayStart } },
      });
      const repliesSent = await prisma.agentLog.count({
        where: {
          agentId: a.id,
          createdAt: { gte: dayStart },
          OR: [{ action: "reply" }, { action: "telegram_owner" }],
        },
      });
      return {
        id: a.id,
        name: a.name,
        tokenName: a.tokenName,
        tokenMint: a.tokenMint,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
        providers: a.credentials.map((c) => c.provider),
        metrics: {
          tweetsToday,
          repliesSent,
          lastActivity: (a.logs[0]?.createdAt ?? a.updatedAt).toISOString(),
        },
        subscription: a.subscriptions[0]
          ? {
              status: a.subscriptions[0].status,
              periodEnd: a.subscriptions[0].periodEnd.toISOString(),
            }
          : null,
      };
    }),
  );
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as unknown as { id: string }).id;
  let body: {
    name?: string;
    tokenMint?: string;
    systemPrompt?: string;
    personality?: string;
    twitterAccessToken?: string;
    telegramBotToken?: string;
    telegramChatId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = body.name?.trim();
  const tokenMint = body.tokenMint?.trim();
  const systemPrompt = body.systemPrompt?.trim() ?? "You are a helpful community agent for this token.";
  if (!name || !tokenMint) {
    return NextResponse.json(
      { error: "name and tokenMint are required" },
      { status: 400 },
    );
  }
  if (tokenMint.length < 32) {
    return NextResponse.json(
      { error: "Token mint must be a full Solana/Pump.fun mint address (at least 32 characters). Paste the full mint from the token page." },
      { status: 400 },
    );
  }
  const tokenName = (await fetchTokenNameFromPumpFun(tokenMint)) ?? fallbackTokenNameFromMint(tokenMint);
  const twitterAccessToken = body.twitterAccessToken?.trim();
  const telegramBotToken = body.telegramBotToken?.trim();
  const telegramChatId = body.telegramChatId?.trim();
  const personality = body.personality?.trim();
  const needsCredentialSecret = !!(twitterAccessToken || telegramBotToken);
  if (needsCredentialSecret && !process.env.CREDENTIAL_SECRET) {
    return NextResponse.json(
      { error: "Server credential encryption not configured (CREDENTIAL_SECRET missing)." },
      { status: 503 },
    );
  }
  const bypassPayment = process.env.BYPASS_PAYMENT === "true";
  const existingAgentCount = await prisma.agent.count({ where: { userId } });
  const isFirstFreeAgent = existingAgentCount === 0;
  const autoActivate = bypassPayment || isFirstFreeAgent;
  const agent = await prisma.agent.create({
    data: {
      userId,
      name,
      tokenName,
      tokenMint,
      systemPrompt,
      status: autoActivate ? "active" : "draft",
    },
  });
  await prisma.agentConfig.create({
    data: {
      agentId: agent.id,
      personality: personality || null,
      telegramChatId: telegramChatId || null,
    },
  });
  if (twitterAccessToken) {
    await prisma.credential.upsert({
      where: { agentId_provider: { agentId: agent.id, provider: "twitter" } },
      create: {
        agentId: agent.id,
        provider: "twitter",
        encrypted: encryptCredential(JSON.stringify({ access_token: twitterAccessToken })),
      },
      update: {
        encrypted: encryptCredential(JSON.stringify({ access_token: twitterAccessToken })),
      },
    });
  }
  if (telegramBotToken) {
    await prisma.credential.upsert({
      where: { agentId_provider: { agentId: agent.id, provider: "telegram" } },
      create: {
        agentId: agent.id,
        provider: "telegram",
        encrypted: encryptCredential(JSON.stringify({ bot_token: telegramBotToken })),
      },
      update: {
        encrypted: encryptCredential(JSON.stringify({ bot_token: telegramBotToken })),
      },
    });
  }
  if (autoActivate) {
    const periodEnd = new Date();
    if (isFirstFreeAgent) {
      // Free first-agent activation: keep it active long-term without immediate billing.
      periodEnd.setFullYear(periodEnd.getFullYear() + 100);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }
    await prisma.subscription.upsert({
      where: { agentId: agent.id },
      create: {
        userId,
        agentId: agent.id,
        status: "active",
        periodStart: new Date(),
        periodEnd,
        txSignature: isFirstFreeAgent ? "free-first-agent" : "bypass",
      },
      update: {
        status: "active",
        periodEnd,
      },
    });
  }
  return NextResponse.json({
    id: agent.id,
    name: agent.name,
    tokenName: agent.tokenName,
    tokenMint: agent.tokenMint,
    status: agent.status,
    createdAt: agent.createdAt.toISOString(),
    isFirstFreeAgent,
  });
}
