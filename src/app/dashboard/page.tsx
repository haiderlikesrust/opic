"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

type Agent = {
  id: string;
  name: string;
  tokenName: string;
  tokenMint: string;
  status: string;
  createdAt: string;
  providers: string[];
  metrics: { tweetsToday: number; repliesSent: number; lastActivity: string };
  subscription?: { status: string; periodEnd: string } | null;
};

function toRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardAgentsPage() {
  const { data: session, status } = useSession();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setLoading(false);
      return;
    }
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        setAgents(Array.isArray(data) ? data : data.agents ?? []);
      })
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, [status]);

  const toggleStatus = async (agent: Agent) => {
    const nextStatus = agent.status === "paused" ? "active" : "paused";
    setUpdatingId(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setAgents((prev) =>
          prev.map((a) => (a.id === agent.id ? { ...a, status: nextStatus } : a)),
        );
      }
    } finally {
      setUpdatingId(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-[var(--oracle-border)] bg-slate-900/70 p-5"
          >
            <div className="mb-3 h-5 w-40 rounded bg-[var(--oracle-border)]" />
            <div className="mb-4 h-4 w-52 rounded bg-[var(--oracle-border)]" />
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="h-8 rounded bg-[var(--oracle-border)]" />
              <div className="h-8 rounded bg-[var(--oracle-border)]" />
              <div className="h-8 rounded bg-[var(--oracle-border)]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-surface)] p-8 text-center">
        <p className="mb-4 text-[var(--oracle-muted)]">
          Connect your wallet and sign in to create and manage agents.
        </p>
        <p className="text-sm text-[var(--oracle-muted)]">
          Use the wallet button above, then click &quot;Sign in with wallet&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.045] to-white/[0.015] px-5 py-4 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.95)]">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--oracle-muted)]">Control Center</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Your Agents</h1>
          <p className="mt-1 text-sm text-[var(--oracle-muted)]">
            Manage your live AI products, integrations, and activity.
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="rounded-xl bg-gradient-to-r from-[var(--oracle-accent)] to-[#53abff] px-4 py-2 text-sm font-semibold text-[#041018] shadow-[0_14px_35px_-20px_rgba(34,211,166,0.85)] hover:brightness-105"
        >
          + New Agent
        </Link>
      </div>
      {agents.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-10 text-center shadow-[0_24px_60px_-36px_rgba(0,0,0,0.95)]">
          <p className="mb-1 text-lg font-medium">No agents yet</p>
          <p className="mb-4 text-[var(--oracle-muted)]">
            Create your first AI agent and activate it via Opic billing.
          </p>
          <Link
            href="/dashboard/create"
            className="inline-block rounded-xl bg-gradient-to-r from-[var(--oracle-accent)] to-[#53abff] px-4 py-2 font-semibold text-[#041018] shadow-[0_14px_35px_-20px_rgba(34,211,166,0.85)] hover:brightness-105"
          >
            Create your first agent
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {agents.map((a) => (
            <li
              key={a.id}
              className={`group rounded-2xl border bg-gradient-to-b from-white/[0.045] to-white/[0.015] p-5 shadow-[0_16px_40px_-30px_rgba(0,0,0,0.95)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_56px_-32px_rgba(34,211,166,0.38)] ${
                a.status === "active"
                  ? "border-[var(--oracle-accent)]/35 hover:border-[var(--oracle-accent)]/55"
                  : "border-white/10 hover:border-[var(--oracle-accent)]/40"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold ${
                    a.status === "active"
                      ? "border-[var(--oracle-accent)]/60 bg-[var(--oracle-accent)]/10 text-[var(--oracle-accent)]"
                      : "border-[var(--oracle-border)] bg-[var(--oracle-bg)] text-[var(--oracle-muted)]"
                  }`}>
                    {a.tokenName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-base font-semibold">{a.name}</p>
                    <p className="text-sm text-[var(--oracle-muted)]">{a.tokenName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--oracle-muted)]">
                      <span className={`rounded-full border px-2 py-0.5 font-medium ${
                        a.providers.includes("twitter")
                          ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                          : "border-white/10 bg-[var(--oracle-bg)]/60"
                      }`}>
                        X {a.providers.includes("twitter") ? "connected" : "not connected"}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 font-medium ${
                        a.providers.includes("telegram")
                          ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                          : "border-white/10 bg-[var(--oracle-bg)]/60"
                      }`}>
                        Telegram {a.providers.includes("telegram") ? "connected" : "not connected"}
                      </span>
                    </div>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs ${
                    a.status === "active"
                      ? "border border-emerald-500/35 bg-emerald-500/15 text-emerald-300"
                      : a.status === "paused"
                        ? "border border-amber-500/35 bg-amber-500/15 text-amber-300"
                        : "border border-white/10 bg-[var(--oracle-bg)] text-[var(--oracle-muted)]"
                  }`}
                >
                  {a.status}
                </span>
              </div>

              <div className="mt-4 grid gap-2 text-xs text-[var(--oracle-muted)] sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                  <p className="text-lg font-semibold text-[var(--oracle-text)]">{a.metrics.tweetsToday}</p>
                  <p>Tweets today</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                  <p className="text-lg font-semibold text-[var(--oracle-text)]">{a.metrics.repliesSent}</p>
                  <p>Replies sent</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                  <p className="text-lg font-semibold text-[var(--oracle-text)]">
                    {toRelativeTime(a.metrics.lastActivity)}
                  </p>
                  <p>Last activity</p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Link
                  href={`/dashboard/agents/${a.id}`}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-[var(--oracle-text)] hover:border-[var(--oracle-accent)]/40"
                >
                  Manage
                </Link>
                <button
                  type="button"
                  onClick={() => toggleStatus(a)}
                  disabled={updatingId === a.id}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-[var(--oracle-text)] hover:border-amber-400/40 disabled:opacity-50"
                >
                  {updatingId === a.id
                    ? "Updating..."
                    : a.status === "paused"
                      ? "Resume"
                      : "Pause"}
                </button>
                <Link
                  href={`/dashboard/agents/${a.id}?tab=logs`}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-[var(--oracle-text)] hover:border-sky-400/40"
                >
                  Analytics
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
