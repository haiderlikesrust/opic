import { getServerSession } from "next-auth";
import {
  Connection,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstructionWithDerivation } from "@solana/spl-token";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const PLATFORM_MINT = process.env.PLATFORM_AGENT_MINT;
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SUB_AMOUNT = "10000000";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!PLATFORM_MINT) {
    return NextResponse.json(
      { error: "Platform subscription not configured (PLATFORM_AGENT_MINT)" },
      { status: 503 },
    );
  }
  const userId = (session.user as unknown as { id: string }).id;
  const { id: agentId } = await params;
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const userWallet = (body.wallet ?? (session.user as unknown as { walletAddress?: string }).walletAddress) as string | undefined;
  if (!userWallet) {
    return NextResponse.json(
      { error: "Wallet address required. Connect wallet and retry." },
      { status: 400 },
    );
  }

  const memo = String(Math.floor(Math.random() * 900000000000) + 100000);
  const now = Math.floor(Date.now() / 1000);
  const startTime = String(now);
  const endTime = String(now + 86400);
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.pendingSubscription.create({
    data: {
      agentId,
      userId,
      memo,
      amount: SUB_AMOUNT,
      periodEnd,
    },
  });

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://rpc.solanatracker.io/public";
  const connection = new Connection(rpcUrl);
  const mint = new PublicKey(PLATFORM_MINT);
  const currency = new PublicKey(USDC_MINT);
  const agentSdk = new PumpAgent(mint, "mainnet", connection);
  const userPublicKey = new PublicKey(userWallet);

  const instructions = await agentSdk.buildAcceptPaymentInstructions({
    user: userPublicKey,
    currencyMint: currency,
    amount: SUB_AMOUNT,
    memo,
    startTime,
    endTime,
  });

  const createAtaIx = createAssociatedTokenAccountIdempotentInstructionWithDerivation(
    userPublicKey,
    userPublicKey,
    currency,
  );

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = userPublicKey;
  tx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    createAtaIx,
    ...instructions,
  );

  const serializedTx = tx
    .serialize({ requireAllSignatures: false })
    .toString("base64");

  return NextResponse.json({
    transaction: serializedTx,
    memo,
    startTime,
    endTime,
    amount: SUB_AMOUNT,
    periodEnd: periodEnd.toISOString(),
    message: "Pay 10 USDC (platform subscription). After payment, use the verify endpoint to activate.",
  });
}
