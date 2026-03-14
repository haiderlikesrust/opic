"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { signAndSendPayment, verifyWithRetries } from "@/lib/payment";

const USDC = {
  label: "USDC",
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  unit: "USDC",
} as const;
const FIXED_USDC_AMOUNT = 10;
const FIXED_USDC_SMALLEST = FIXED_USDC_AMOUNT * 1_000_000;

type Step = "idle" | "building" | "sign" | "sending" | "verifying" | "success" | "error";

const STEP_META: Record<
  Step,
  { label: string; hint: string; progress: number }
> = {
  idle: {
    label: "Ready",
    hint: "Enter your agent mint and continue.",
    progress: 0,
  },
  building: {
    label: "Preparing invoice",
    hint: "Creating a transaction payload on the server.",
    progress: 20,
  },
  sign: {
    label: "Waiting for wallet approval",
    hint: "Approve the transaction in your connected wallet.",
    progress: 40,
  },
  sending: {
    label: "Broadcasting transaction",
    hint: "Submitting signed transaction to the network.",
    progress: 65,
  },
  verifying: {
    label: "Verifying payment",
    hint: "Confirming settlement and invoice match.",
    progress: 85,
  },
  success: {
    label: "Payment confirmed",
    hint: "Your invoice has been paid successfully.",
    progress: 100,
  },
  error: {
    label: "Action required",
    hint: "Please review the error and try again.",
    progress: 100,
  },
};

export default function OpicPage() {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [mounted, setMounted] = useState(false);
  const [agentMint, setAgentMint] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState("");
  const [txSignature, setTxSignature] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const amountSmallest = FIXED_USDC_SMALLEST;

  const handlePay = async () => {
    if (!publicKey || !signTransaction) {
      setMessage("Connect your wallet first.");
      setStep("error");
      return;
    }
    if (!agentMint.trim()) {
      setMessage("Enter the agent token mint address.");
      setStep("error");
      return;
    }
    setStep("building");
    setMessage("Building payment…");

    try {
      const res = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: publicKey.toBase58(),
          amount: String(amountSmallest),
          currencyMint: USDC.mint,
          agentMint: agentMint.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Failed to create invoice");
        setStep("error");
        return;
      }

      setStep("sign");
      setMessage("Approve the transaction in your wallet…");

      const sig = await signAndSendPayment(
        data.transaction,
        signTransaction,
        connection,
      );
      setTxSignature(sig);
      setStep("sending");
      setMessage("Transaction submitted.");
      setStep("verifying");
      setMessage("Verifying payment…");

      const paid = await verifyWithRetries({
        userWallet: publicKey.toBase58(),
        amount: data.amount,
        memo: data.memo,
        startTime: data.startTime,
        endTime: data.endTime,
        currencyMint: data.currencyMint,
        agentMint: data.agentMint,
      });

      if (paid) {
        setStep("success");
        setMessage("Payment confirmed.");
      } else {
        setStep("error");
        setMessage("Payment not confirmed yet. Check your wallet; the tx may still be settling.");
      }
    } catch (e) {
      setStep("error");
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    }
  };

  const isBusy =
    step === "building" ||
    step === "sign" ||
    step === "sending" ||
    step === "verifying";
  const meta = STEP_META[step];
  const amountPreview = FIXED_USDC_AMOUNT;

  return (
    <div className="min-h-screen bg-[var(--oracle-bg)] text-[var(--oracle-text)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,212,170,0.16),transparent_40%),radial-gradient(circle_at_80%_25%,rgba(59,130,246,0.14),transparent_35%)]" />
      <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start lg:py-14">
        <section>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--oracle-border)] bg-[var(--oracle-surface)]/80 px-3 py-1 text-xs">
            <Image
              src="/oracle-logo.svg"
              alt="Opic logo"
              width={16}
              height={16}
              className="h-4 w-4"
            />
            <span className="font-mono font-semibold tracking-wide text-[var(--oracle-accent)]">Opic</span>
            <span className="text-[var(--oracle-border)]">/</span>
            <span className="text-[var(--oracle-muted)]">Tokenized agents, code-free</span>
          </div>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
            Create Tokenized Agents
            <span className="block bg-gradient-to-r from-[var(--oracle-accent)] to-[#54a8ff] bg-clip-text font-mono text-transparent">
              1 free agent per user. Then $10 activation.
            </span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-[var(--oracle-muted)] md:text-lg">
            No coding required. Your first agent is free, and you only pay $10 for each additional
            agent to unlock GLM-5 and Twitter/Telegram infrastructure.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/dashboard/create"
              className="rounded-xl bg-gradient-to-r from-[var(--oracle-accent)] to-[#4ec2ff] px-4 py-2 text-sm font-semibold text-[var(--oracle-bg)] hover:brightness-105"
            >
              Claim Your Free Agent
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-surface)]/75 px-4 py-2 text-sm font-medium text-[var(--oracle-text)] hover:border-[var(--oracle-accent)]/40"
            >
              Go to Dashboard
            </Link>
          </div>
          <div className="mt-8 grid gap-3 text-sm text-[var(--oracle-muted)] sm:grid-cols-3">
            <div className="rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-surface)]/80 p-3">
              <p className="text-[var(--oracle-text)]">First agent free</p>
              <p className="mt-1 text-xs">1 free agent creation per user.</p>
            </div>
            <div className="rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-surface)]/80 p-3">
              <p className="text-[var(--oracle-text)]">Then $10 activation</p>
              <p className="mt-1 text-xs">Applies to each additional agent.</p>
            </div>
            <div className="rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-surface)]/80 p-3">
              <p className="text-[var(--oracle-text)]">Twitter + Telegram</p>
              <p className="mt-1 text-xs">Communication infra ready.</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--oracle-border)] bg-[var(--oracle-surface)]/95 p-6 shadow-[0_20px_55px_-30px_rgba(0,0,0,0.9)] backdrop-blur-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--oracle-muted)]">Activation panel</p>
              <p className="text-lg font-medium">Additional agents only</p>
            </div>
            {mounted ? (
              <WalletMultiButton />
            ) : (
              <button type="button" className="wallet-adapter-button" disabled>
                Select Wallet
              </button>
            )}
          </div>

          {!connected ? (
            <p className="rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-bg)]/70 p-4 text-center text-sm text-[var(--oracle-muted)]">
              Connect your wallet to continue.
            </p>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">
                    Agent token mint
                  </label>
                  <input
                    type="text"
                    value={agentMint}
                    onChange={(e) => setAgentMint(e.target.value)}
                    placeholder="Paste pump.fun tokenized agent mint"
                    className="w-full rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 font-mono text-sm outline-none transition focus:border-[var(--oracle-accent)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">
                      Currency
                    </label>
                    <input
                      type="text"
                      value={USDC.label}
                      disabled
                      className="w-full rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm text-[var(--oracle-text)] opacity-80"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">
                      Amount ({USDC.unit})
                    </label>
                    <input
                      type="text"
                      value={String(FIXED_USDC_AMOUNT)}
                      disabled
                      className="w-full rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm text-[var(--oracle-text)] opacity-80"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-bg)]/60 p-3 text-sm">
                <div className="mb-2 flex items-center justify-between text-[var(--oracle-muted)]">
                  <span>Status</span>
                  <span>{meta.label}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--oracle-border)]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      step === "error"
                        ? "bg-red-500"
                        : "bg-gradient-to-r from-[var(--oracle-accent)] to-[#54a8ff]"
                    }`}
                    style={{ width: `${meta.progress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--oracle-muted)]">{isBusy ? message : meta.hint}</p>
              </div>

              <button
                onClick={handlePay}
                disabled={isBusy}
                className="mt-5 w-full rounded-xl bg-gradient-to-r from-[var(--oracle-accent)] to-[#4ec2ff] px-4 py-3 font-semibold text-[var(--oracle-bg)] transition hover:brightness-105 disabled:opacity-50"
              >
                {isBusy ? "Processing..." : `Pay ${amountPreview} ${USDC.unit} (additional agent)`}
              </button>
            </>
          )}

          {step === "success" && (
            <div className="mt-4 rounded-xl border border-[var(--oracle-accent)]/40 bg-[var(--oracle-accent)]/10 p-4 text-sm text-[var(--oracle-text)]">
              <p className="font-medium text-[var(--oracle-accent)]">{message}</p>
              {txSignature && (
                <a
                  href={`https://solscan.io/tx/${txSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center text-sm text-[var(--oracle-accent)] underline"
                >
                  View transaction on Solscan
                </a>
              )}
            </div>
          )}

          {step === "error" && (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
              {message}
            </div>
          )}
        </section>
      </div>
      <div className="relative mx-auto max-w-6xl px-4 pb-10">
        <p className="text-center text-xs text-[var(--oracle-muted)]">
          1 free agent per user. Additional agents require $10 activation with GLM-5 + Twitter/Telegram.
        </p>
      </div>
    </div>
  );
}
