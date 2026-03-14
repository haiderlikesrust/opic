"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AgentBilling = {
  id: string;
  name: string;
  tokenName: string;
  status: string;
  subscription?: { status: string; periodEnd: string } | null;
};

export default function BillingPage() {
  const [agents, setAgents] = useState<AgentBilling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => setAgents(Array.isArray(data) ? data : []))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.045] to-white/[0.015] px-5 py-4 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.95)]">
        <p className="text-xs uppercase tracking-[0.16em] text-[var(--oracle-muted)]">Billing Center</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-[var(--oracle-muted)]">
          First agent is free. Manage paid activation status for additional agents.
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8 text-[var(--oracle-muted)]">
          Loading billing data…
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8 text-center">
          <p className="mb-3 text-[var(--oracle-muted)]">No agents yet to bill.</p>
          <Link
            href="/dashboard/create"
            className="inline-block rounded-xl bg-gradient-to-r from-[var(--oracle-accent)] to-[#53abff] px-4 py-2 font-semibold text-[#041018] shadow-[0_14px_35px_-20px_rgba(34,211,166,0.85)]"
          >
            Create Agent
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {agents.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-white/[0.015] p-4"
            >
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-sm text-[var(--oracle-muted)]">{a.tokenName}</p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs ${
                  a.subscription?.status === "active"
                    ? "border border-emerald-500/35 bg-emerald-500/15 text-emerald-300"
                    : "border border-amber-500/35 bg-amber-500/15 text-amber-300"
                }`}>
                  {a.subscription?.status === "active" ? "Active" : "Inactive"}
                </span>
                <span className="text-[var(--oracle-muted)]">
                  {a.subscription?.periodEnd
                    ? `Until ${new Date(a.subscription.periodEnd).toLocaleDateString()}`
                    : "No active activation"}
                </span>
                <Link
                  href={`/dashboard/agents/${a.id}?tab=billing`}
                  className="rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 hover:border-[var(--oracle-accent)]/40"
                >
                  Manage
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

