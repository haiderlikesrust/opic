import "dotenv/config";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";

const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

function readEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readOptionalEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function parsePositiveBigInt(value: string, fieldName: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${fieldName} must be a valid integer string`);
  }
  if (parsed <= BigInt(0)) {
    throw new Error(`${fieldName} must be greater than 0`);
  }
  return parsed;
}

function parseSecretKeyFromJsonArray(raw: string): Uint8Array | null {
  if (!raw.startsWith("[")) return null;
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return null;
  const bytes = parsed.map((n) => Number(n));
  if (bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return Uint8Array.from(bytes);
}

function parseSecretKeyFromCsv(raw: string): Uint8Array | null {
  if (!raw.includes(",")) return null;
  const pieces = raw.split(",").map((p) => p.trim());
  if (!pieces.length) return null;
  const bytes = pieces.map((n) => Number(n));
  if (bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return Uint8Array.from(bytes);
}

function parseSecretKeyFromBase64(raw: string): Uint8Array | null {
  try {
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length === 0) return null;
    return Uint8Array.from(bytes);
  } catch {
    return null;
  }
}

function decodeBase58(raw: string): Uint8Array | null {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const base = 58;
  if (!raw.length) return null;

  let bytes = [0];
  for (const char of raw) {
    const value = alphabet.indexOf(char);
    if (value < 0) return null;

    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * base;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (let i = 0; i < raw.length && raw[i] === "1"; i++) {
    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}

function parseSecretKeyFromBase58(raw: string): Uint8Array | null {
  try {
    return decodeBase58(raw);
  } catch {
    return null;
  }
}

async function parsePayerKeypair(rawPrivateKey: string): Promise<Keypair> {
  let secretKey =
    parseSecretKeyFromJsonArray(rawPrivateKey) ||
    parseSecretKeyFromCsv(rawPrivateKey) ||
    parseSecretKeyFromBase64(rawPrivateKey);

  if (!secretKey) {
    secretKey = parseSecretKeyFromBase58(rawPrivateKey);
  }

  if (!secretKey) {
    throw new Error(
      "Could not parse PAYER_PRIVATE_KEY. Supported formats: JSON array, comma-separated bytes, base64, base58.",
    );
  }

  if (secretKey.length !== 64) {
    throw new Error(
      `PAYER_PRIVATE_KEY must decode to 64 bytes (got ${secretKey.length}).`,
    );
  }

  return Keypair.fromSecretKey(secretKey);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const rpcUrl = readOptionalEnv(
    "SOLANA_RPC_URL",
    "https://rpc.solanatracker.io/public",
  );
  const network = readOptionalEnv("SOLANA_ENVIRONMENT", "mainnet");
  if (network !== "mainnet" && network !== "devnet") {
    throw new Error("SOLANA_ENVIRONMENT must be 'mainnet' or 'devnet'");
  }

  const agentMintRaw = readEnv("AGENT_TOKEN_MINT_ADDRESS");
  const currencyMintRaw = readOptionalEnv("CURRENCY_MINT", WRAPPED_SOL_MINT);
  const paymentAmountRaw = readEnv("PAYMENT_AMOUNT");
  const privateKeyRaw = readEnv("PAYER_PRIVATE_KEY");

  const amount = parsePositiveBigInt(paymentAmountRaw, "PAYMENT_AMOUNT");
  const now = Math.floor(Date.now() / 1000);
  const memo =
    process.env.INVOICE_MEMO?.trim() ||
    String(Math.floor(Math.random() * 900000000000) + 100000);
  const startTime = String(now);
  const durationSeconds = Number(
    readOptionalEnv("INVOICE_DURATION_SECONDS", "3600"),
  );
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("INVOICE_DURATION_SECONDS must be a positive number");
  }
  const endTime = String(now + Math.floor(durationSeconds));
  if (BigInt(endTime) <= BigInt(startTime)) {
    throw new Error("endTime must be greater than startTime");
  }

  const agentMint = new PublicKey(agentMintRaw);
  const currencyMint = new PublicKey(currencyMintRaw);
  const payer = await parsePayerKeypair(privateKeyRaw);

  const connection = new Connection(rpcUrl, "confirmed");
  const agent = new PumpAgent(agentMint, network, connection);

  const lamports = await connection.getBalance(payer.publicKey, "confirmed");
  console.log(`Payer wallet: ${payer.publicKey.toBase58()}`);
  console.log(`SOL balance: ${(lamports / 1_000_000_000).toFixed(9)} SOL`);

  // Keep a small SOL buffer for transaction fees and temporary account rent.
  const feeAndRentBufferLamports = BigInt(20_000_000);
  const minimumLamportsNeeded =
    currencyMint.toBase58() === WRAPPED_SOL_MINT
      ? amount + feeAndRentBufferLamports
      : feeAndRentBufferLamports;

  if (BigInt(lamports) < minimumLamportsNeeded) {
    throw new Error(
      `Insufficient SOL. Need at least ${(
        Number(minimumLamportsNeeded) / 1_000_000_000
      ).toFixed(9)} SOL, have ${(lamports / 1_000_000_000).toFixed(9)} SOL.`,
    );
  }

  const instructions = await agent.buildAcceptPaymentInstructions({
    user: payer.publicKey,
    currencyMint,
    amount: amount.toString(),
    memo,
    startTime,
    endTime,
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: blockhash,
  });
  tx.add(...instructions);
  tx.sign(payer);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  console.log(`Payment signature: ${signature}`);
  console.log(`Invoice memo: ${memo}`);
  console.log(`Invoice window: ${startTime} -> ${endTime}`);

  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("PAYMENT_AMOUNT exceeds Number.MAX_SAFE_INTEGER for verify");
  }

  const verifyAmount = Number(amount);
  const verifyMemo = Number(memo);
  const verifyStart = Number(startTime);
  const verifyEnd = Number(endTime);

  if (
    !Number.isSafeInteger(verifyMemo) ||
    !Number.isSafeInteger(verifyStart) ||
    !Number.isSafeInteger(verifyEnd)
  ) {
    throw new Error("memo/startTime/endTime must be safe integers for verify");
  }

  let paid = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    paid = await agent.validateInvoicePayment({
      user: payer.publicKey,
      currencyMint,
      amount: verifyAmount,
      memo: verifyMemo,
      startTime: verifyStart,
      endTime: verifyEnd,
    });
    if (paid) break;
    await sleep(2000);
  }

  console.log(`Payment verified: ${paid ? "yes" : "no"}`);
  if (!paid) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Payment script failed: ${message}`);
  process.exit(1);
});
