import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const agent = await prisma.agent.findFirst({
    where: { id, userId: (session.user as unknown as { id: string }).id },
    include: { config: true, subscriptions: { where: { status: "active" }, take: 1 } },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  const sub = agent.subscriptions[0];
  return NextResponse.json({
    id: agent.id,
    name: agent.name,
    tokenName: agent.tokenName,
    tokenMint: agent.tokenMint,
    systemPrompt: agent.systemPrompt,
    status: agent.status,
    createdAt: agent.createdAt.toISOString(),
    config: agent.config
      ? {
          personality: agent.config.personality,
          tweetFrequency: agent.config.tweetFrequency,
          autoReplyRules: agent.config.autoReplyRules,
          mentionMonitoring: agent.config.mentionMonitoring,
          memeGeneration: agent.config.memeGeneration,
          communityEngagement: agent.config.communityEngagement,
          postingBehavior: agent.config.postingBehavior,
          replyBehavior: agent.config.replyBehavior,
          tradingRules: agent.config.tradingRules,
          onChainMonitoring: agent.config.onChainMonitoring,
          customSettings: agent.config.customSettings,
          telegramChatId: agent.config.telegramChatId,
        }
      : null,
    subscription: sub
      ? { status: sub.status, periodEnd: sub.periodEnd.toISOString() }
      : null,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const agent = await prisma.agent.findFirst({
    where: { id, userId: (session.user as unknown as { id: string }).id },
    include: { config: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const updates: { name?: string; systemPrompt?: string; status?: string; tokenMint?: string } = {};
  if (typeof body.name === "string") updates.name = body.name.trim();
  if (typeof body.systemPrompt === "string") updates.systemPrompt = body.systemPrompt.trim();
  if (typeof body.status === "string" && ["draft", "active", "paused"].includes(body.status)) {
    updates.status = body.status;
  }
  if (typeof body.tokenMint === "string") {
    const mint = body.tokenMint.trim();
    if (mint.length < 32) {
      return NextResponse.json(
        { error: "Token mint must be a full Solana/Pump.fun mint address (at least 32 characters)." },
        { status: 400 }
      );
    }
    updates.tokenMint = mint;
  }
  if (Object.keys(updates).length > 0) {
    await prisma.agent.update({ where: { id }, data: updates });
  }
  const configUpdates: Record<string, unknown> = {};
  if (body.config && typeof body.config === "object") {
    const c = body.config as Record<string, unknown>;
    if (typeof c.personality === "string") configUpdates.personality = c.personality;
    if (typeof c.tweetFrequency === "string") configUpdates.tweetFrequency = c.tweetFrequency;
    if (typeof c.autoReplyRules === "string") configUpdates.autoReplyRules = c.autoReplyRules;
    if (typeof c.mentionMonitoring === "boolean") configUpdates.mentionMonitoring = c.mentionMonitoring;
    if (typeof c.memeGeneration === "boolean") configUpdates.memeGeneration = c.memeGeneration;
    if (typeof c.communityEngagement === "string") configUpdates.communityEngagement = c.communityEngagement;
    if (typeof c.postingBehavior === "string") configUpdates.postingBehavior = c.postingBehavior;
    if (typeof c.replyBehavior === "string") configUpdates.replyBehavior = c.replyBehavior;
    if (typeof c.tradingRules === "string") configUpdates.tradingRules = c.tradingRules;
    if (typeof c.onChainMonitoring === "string") configUpdates.onChainMonitoring = c.onChainMonitoring;
    if (typeof c.customSettings === "string") configUpdates.customSettings = c.customSettings;
    if (typeof c.telegramChatId === "string") configUpdates.telegramChatId = c.telegramChatId.trim() || null;
  }
  if (Object.keys(configUpdates).length > 0 && agent.config) {
    await prisma.agentConfig.update({
      where: { agentId: id },
      data: configUpdates,
    });
  }
  return NextResponse.json({ ok: true });
}
