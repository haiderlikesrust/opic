"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function CreateAgentPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    tokenMint: "",
    systemPrompt: "You are a helpful community agent for this token. Engage with the community, answer questions, and share updates in a friendly and professional way.",
    personality: "Professional",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          tokenMint: form.tokenMint,
          systemPrompt: form.systemPrompt,
          personality: form.personality,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create agent");
        return;
      }
      router.push(`/dashboard/agents/${data.id}`);
    } catch {
      setError("Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return <div className="text-[var(--oracle-muted)]">Loading…</div>;
  }
  if (!session) {
    return (
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8 text-center text-[var(--oracle-muted)]">
        Sign in with your wallet to create an agent.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.045] to-white/[0.015] px-5 py-4 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.95)]">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--oracle-muted)]">Agent Builder</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Create Agent</h1>
        <p className="mt-1 text-sm text-[var(--oracle-muted)]">
          Configure your AI product, integrations, and deployment defaults.
        </p>
      </div>
      <form
        onSubmit={handleSubmit}
        className="space-y-5"
      >
        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-5">
          <h2 className="text-lg font-medium text-[var(--oracle-text)]">Agent Info</h2>
          <p className="mb-4 text-sm text-[var(--oracle-muted)]">
            Basic product identity and token details.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">
              Agent Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="My Token Agent"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
              required
            />
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">
              Token Contract Address
            </label>
            <input
              type="text"
              value={form.tokenMint}
              onChange={(e) => setForm((f) => ({ ...f, tokenMint: e.target.value }))}
              placeholder="Paste full Solana/Pump.fun mint"
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm outline-none focus:border-[var(--oracle-accent)]"
              required
            />
            <p className="mt-1 text-xs text-[var(--oracle-muted)]">
              Token name is fetched automatically from Pump.fun using this mint.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-5">
          <h2 className="text-lg font-medium text-[var(--oracle-text)]">AI Configuration</h2>
          <p className="mb-4 text-sm text-[var(--oracle-muted)]">
            Control how the agent behaves when interacting with the community.
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">
              Personality
            </label>
            <select
              value={form.personality}
              onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
            >
              <option>Professional</option>
              <option>Meme</option>
              <option>Community</option>
            </select>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">
              Custom System Prompt
            </label>
            <textarea
              value={form.systemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
              rows={6}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-5">
          <h2 className="text-lg font-medium text-[var(--oracle-text)]">Integrations</h2>
          <p className="text-sm text-[var(--oracle-muted)]">
            Connect Twitter and Telegram after the agent is created from the agent settings page.
          </p>
        </section>

        <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-5">
          <h2 className="text-lg font-medium text-[var(--oracle-text)]">Deployment</h2>
          <p className="mb-2 text-sm text-[var(--oracle-muted)]">
            Agent is created in <span className="text-[var(--oracle-text)]">draft</span> until activation is verified.
          </p>
          <p className="text-xs text-[var(--oracle-muted)]">
            First agent creation is free (1 per user). Additional agents are billed through Opic payment
            flow ($10 USDC activation). Your first agent is activated immediately with no payment step.
          </p>
        </section>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gradient-to-r from-[var(--oracle-accent)] to-[#53abff] px-5 py-2.5 font-semibold text-[#041018] shadow-[0_10px_25px_-16px_rgba(34,211,166,0.85)] hover:brightness-105 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Agent"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-sm hover:border-[var(--oracle-accent)]/35"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
