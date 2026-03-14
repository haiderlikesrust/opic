"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { signAndSendPayment } from "@/lib/payment";

export function SubscribeButton({
  agentId,
}: {
  agentId: string;
  tokenMint: string;
}) {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const [step, setStep] = useState<"idle" | "building" | "sign" | "sending" | "verifying" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubscribe = async () => {
    if (!connected || !publicKey || !signTransaction) {
      setMessage("Connect your wallet first.");
      setStep("error");
      return;
    }
    setStep("building");
    setMessage("Preparing subscription…");
    try {
      const res = await fetch(`/api/agents/${agentId}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Failed to create subscription");
        setStep("error");
        return;
      }
      setStep("sign");
      setMessage("Approve the transaction in your wallet (10 USDC)…");
      const signature = await signAndSendPayment(
        data.transaction,
        signTransaction,
        connection,
      );
      setStep("verifying");
      setMessage("Verifying payment & activating…");
      const payload = {
        agentId,
        memo: data.memo,
        startTime: data.startTime,
        endTime: data.endTime,
        userWallet: publicKey.toBase58(),
        txSignature: signature,
      };
      for (let i = 0; i < 15; i++) {
        const activateRes = await fetch("/api/subscription/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const act = await activateRes.json();
        if (activateRes.ok) {
          setStep("done");
          setMessage("Subscription active. Reloading…");
          window.location.reload();
          return;
        }
        if (i < 14) await new Promise((r) => setTimeout(r, 2000));
        else setMessage(act.error || "Activation failed. Try again in a minute.");
      }
      setStep("error");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong");
      setStep("error");
    }
  };

  const busy = step !== "idle" && step !== "done" && step !== "error";

  return (
    <div className="rounded-lg bg-[var(--oracle-bg)] p-4">
      <p className="mb-2 text-sm font-medium">Activate additional agent (10 USDC)</p>
      <p className="mb-3 text-xs text-[var(--oracle-muted)]">
        Connect the same wallet you use for the dashboard. After payment is confirmed, this agent
        will be activated.
      </p>
      {step === "done" && (
        <p className="mb-3 text-sm text-[var(--oracle-accent)]">{message}</p>
      )}
      {step === "error" && (
        <p className="mb-3 text-sm text-red-400">{message}</p>
      )}
      {!connected ? (
        <p className="text-xs text-amber-400">Connect your wallet above to subscribe.</p>
      ) : (
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={busy}
          className="rounded-lg bg-[var(--oracle-accent)] px-3 py-1.5 text-sm font-medium text-[var(--oracle-bg)] hover:opacity-90 disabled:opacity-50"
        >
          {busy ? message : "Pay 10 USDC to activate"}
        </button>
      )}
    </div>
  );
}
