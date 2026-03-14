import { Connection, Transaction } from "@solana/web3.js";

export async function signAndSendPayment(
  txBase64: string,
  signTransaction: (tx: Transaction) => Promise<Transaction>,
  connection: Connection,
): Promise<string> {
  const tx = Transaction.from(Buffer.from(txBase64, "base64"));
  const signedTx = await signTransaction(tx);

  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  return signature;
}

export async function verifyWithRetries(params: {
  userWallet: string;
  amount: number | string;
  memo: number | string;
  startTime: number | string;
  endTime: number | string;
  currencyMint?: string;
  agentMint?: string;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<boolean> {
  const {
    maxAttempts = 10,
    delayMs = 2000,
    ...body
  } = params;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.paid) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}
