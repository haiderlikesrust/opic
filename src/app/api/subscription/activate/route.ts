import { getServerSession } from "next-auth";
import { PublicKey } from "@solana/web3.js";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const PLATFORM_MINT = process.env.PLATFORM_AGENT_MINT;
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SUB_AMOUNT = 10_000_000;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!PLATFORM_MINT) {
    return NextResponse.json(
      { error: "Platform subscription not configured" },
      { status: 503 },
    );
  }
  const userId = (session.user as unknown as { id: string }).id;
  const body = await req.json().catch(() => ({}));
  const { agentId, memo, startTime, endTime, userWallet } = body as {
    agentId?: string;
    memo?: string;
    startTime?: number | string;
    endTime?: number | string;
    userWallet?: string;
  };
  if (!agentId || !memo) {
    return NextResponse.json(
      { error: "agentId and memo required" },
      { status: 400 },
    );
  }
  const wallet = userWallet ?? (session.user as unknown as { walletAddress?: string }).walletAddress;
  if (!wallet) {
    return NextResponse.json(
      { error: "Wallet address required" },
      { status: 400 },
    );
  }

  const pending = await prisma.pendingSubscription.findFirst({
    where: { memo, agentId, userId },
  });
  if (!pending) {
    return NextResponse.json(
      { error: "Pending subscription not found for this memo and agent" },
      { status: 404 },
    );
  }

  const mint = new PublicKey(PLATFORM_MINT);
  const agent = new PumpAgent(mint);
  const numStart = typeof startTime === "string" ? parseInt(startTime, 10) : startTime;
  const numEnd = typeof endTime === "string" ? parseInt(endTime, 10) : endTime;

  const paid = await agent.validateInvoicePayment({
    user: new PublicKey(wallet),
    currencyMint: new PublicKey(USDC_MINT),
    amount: SUB_AMOUNT,
    memo: parseInt(memo, 10),
    startTime: numStart ?? Math.floor(Date.now() / 1000) - 86400,
    endTime: numEnd ?? Math.floor(Date.now() / 1000) + 86400,
  });

  if (!paid) {
    return NextResponse.json(
      { error: "Payment not confirmed yet. Wait a moment and retry." },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.subscription.upsert({
      where: { agentId },
      create: {
        userId,
        agentId,
        status: "active",
        periodStart: new Date(),
        periodEnd: pending.periodEnd,
        txSignature: body.txSignature ?? null,
      },
      update: {
        status: "active",
        periodStart: new Date(),
        periodEnd: pending.periodEnd,
        txSignature: body.txSignature ?? undefined,
      },
    }),
    prisma.agent.update({
      where: { id: agentId },
      data: { status: "active" },
    }),
    prisma.pendingSubscription.delete({ where: { id: pending.id } }),
  ]);

  return NextResponse.json({
    ok: true,
    periodEnd: pending.periodEnd.toISOString(),
    message: "Subscription activated. Agent is now active.",
  });
}
