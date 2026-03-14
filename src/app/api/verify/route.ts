import { PublicKey } from "@solana/web3.js";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userWallet,
      amount,
      memo,
      startTime,
      endTime,
      currencyMint,
      agentMint,
    }: {
      userWallet: string;
      amount: number | string;
      memo: number | string;
      startTime: number | string;
      endTime: number | string;
      currencyMint?: string;
      agentMint?: string;
    } = body;

    if (
      userWallet == null ||
      amount == null ||
      memo == null ||
      startTime == null ||
      endTime == null
    ) {
      return NextResponse.json(
        { error: "userWallet, amount, memo, startTime, endTime required" },
        { status: 400 },
      );
    }
    if (!agentMint || !currencyMint) {
      return NextResponse.json(
        { error: "agentMint and currencyMint required (from invoice response)" },
        { status: 400 },
      );
    }

    const mint = new PublicKey(agentMint);
    const currency = new PublicKey(currencyMint);
    const agent = new PumpAgent(mint);

    const numAmount = typeof amount === "string" ? parseInt(amount, 10) : amount;
    const numMemo = typeof memo === "string" ? parseInt(memo, 10) : memo;
    const numStart =
      typeof startTime === "string" ? parseInt(startTime, 10) : startTime;
    const numEnd =
      typeof endTime === "string" ? parseInt(endTime, 10) : endTime;

    const paid = await agent.validateInvoicePayment({
      user: new PublicKey(userWallet),
      currencyMint: currency,
      amount: numAmount,
      memo: numMemo,
      startTime: numStart,
      endTime: numEnd,
    });

    return NextResponse.json({ paid });
  } catch (e) {
    console.error("Verify error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Verification failed" },
      { status: 500 },
    );
  }
}
