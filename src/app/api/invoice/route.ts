import {
  Connection,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstructionWithDerivation } from "@solana/spl-token";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";
import { NextRequest, NextResponse } from "next/server";

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userWallet,
      amount,
      currencyMint,
      agentMint,
    }: {
      userWallet: string;
      amount: string;
      currencyMint?: string;
      agentMint?: string;
    } = body;

    if (!userWallet || !amount) {
      return NextResponse.json(
        { error: "userWallet and amount are required" },
        { status: 400 },
      );
    }
    if (!agentMint?.trim()) {
      return NextResponse.json(
        { error: "agentMint is required (enter on the website)" },
        { status: 400 },
      );
    }
    if (!currencyMint?.trim()) {
      return NextResponse.json(
        { error: "currencyMint is required (choose currency on the website)" },
        { status: 400 },
      );
    }

    const amt = BigInt(amount);
    if (amt <= BigInt(0)) {
      return NextResponse.json(
        { error: "amount must be greater than 0" },
        { status: 400 },
      );
    }

    const rpcUrl =
      process.env.SOLANA_RPC_URL || "https://rpc.solanatracker.io/public";
    const mint = new PublicKey(agentMint.trim());
    const currency = new PublicKey(currencyMint.trim());
    const connection = new Connection(rpcUrl);
    const agent = new PumpAgent(mint, "mainnet", connection);
    const userPublicKey = new PublicKey(userWallet);

    const memo = String(
      Math.floor(Math.random() * 900000000000) + 100000,
    );
    const now = Math.floor(Date.now() / 1000);
    const startTime = String(now);
    const endTime = String(now + 86400);

    const instructions = await agent.buildAcceptPaymentInstructions({
      user: userPublicKey,
      currencyMint: currency,
      amount: amount,
      memo,
      startTime,
      endTime,
    });

    // For SPL (e.g. USDC), ensure user has a token account; SDK expects it to exist.
    const currencyMintStr = currencyMint.trim();
    const createAtaIxs =
      currencyMintStr !== WRAPPED_SOL_MINT
        ? [
            createAssociatedTokenAccountIdempotentInstructionWithDerivation(
              userPublicKey,
              userPublicKey,
              currency,
            ),
          ]
        : [];

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = userPublicKey;
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
      ...createAtaIxs,
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
      amount,
      currencyMint: currency.toBase58(),
      agentMint: mint.toBase58(),
    });
  } catch (e) {
    console.error("Invoice error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to build invoice" },
      { status: 500 },
    );
  }
}
