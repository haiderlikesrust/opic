"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { TelegramBotTokenSave } from "@/components/TelegramBotTokenSave";
import { TwitterCredentialsSave } from "@/components/TwitterCredentialsSave";
import { SubscribeButton } from "@/components/SubscribeButton";

type AgentDetail = {
  id: string;
  name: string;
  tokenName: string;
  tokenMint: string;
  systemPrompt: string;
  status: string;
  createdAt: string;
  config: {
    personality?: string;
    tweetFrequency?: string;
    autoReplyRules?: string;
    mentionMonitoring?: boolean;
    memeGeneration?: boolean;
    communityEngagement?: string;
    postingBehavior?: string;
    replyBehavior?: string;
    tradingRules?: string;
    onChainMonitoring?: string;
    customSettings?: string;
    telegramChatId?: string;
  } | null;
  subscription: { status: string; periodEnd: string } | null;
};

type Tab = "overview" | "customize" | "logs" | "billing";

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: session, status } = useSession();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<Partial<AgentDetail>>({});
  const [logs, setLogs] = useState<{ id: string; level: string; action: string | null; message: string; createdAt: string }[]>([]);
  const [twitterOk, setTwitterOk] = useState(false);
  const [twitterError, setTwitterError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "customize" || t === "overview" || t === "logs" || t === "billing") setTab(t);
    const tw = params.get("twitter");
    if (tw === "ok") setTwitterOk(true);
    if (tw === "missing") setTwitterError("Connection lost (cookie not sent). Use the same URL to open the app as in your Twitter callback—e.g. always use http://localhost:3000 or always http://127.0.0.1:3000, then try Connect again.");
    if (tw === "token") setTwitterError("Could not get access token: " + (params.get("message") || "Twitter returned an error."));
    if (tw === "error" || tw === "config" || tw === "invalid") setTwitterError(params.get("message") || "Connection failed. Check your app’s callback URL in the Twitter portal matches exactly.");
  }, []);

  useEffect(() => {
    if (!id || status !== "authenticated") {
      setLoading(false);
      return;
    }
    fetch(`/api/agents/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setAgent(null);
          return;
        }
        setAgent(data);
        setEdit({
          name: data.name,
          tokenMint: data.tokenMint,
          systemPrompt: data.systemPrompt,
          config: data.config ? { ...data.config } : null,
        });
      })
      .catch(() => setAgent(null))
      .finally(() => setLoading(false));
  }, [id, status]);

  useEffect(() => {
    if (tab === "logs" && id) {
      fetch(`/api/agents/${id}/logs`)
        .then((r) => r.json())
        .then((data) => setLogs(Array.isArray(data) ? data : data.logs ?? []))
        .catch(() => setLogs([]));
    }
  }, [tab, id]);

  const saveAgent = async () => {
    if (!id || !edit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: edit.name,
          tokenMint: edit.tokenMint,
          systemPrompt: edit.systemPrompt,
          config: edit.config,
        }),
      });
      if (res.ok) {
        const data = await fetch(`/api/agents/${id}`).then((r) => r.json());
        setAgent(data);
      }
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return <div className="text-[var(--oracle-muted)]">Loading…</div>;
  }
  if (!session) {
    return (
      <div className="rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-surface)] p-8 text-center text-[var(--oracle-muted)]">
        Sign in to view this agent.
      </div>
    );
  }
  if (!agent) {
    return (
      <div className="rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-surface)] p-8 text-center">
        <p className="mb-4 text-[var(--oracle-muted)]">Agent not found.</p>
        <Link href="/dashboard" className="text-[var(--oracle-accent)] hover:underline">
          Back to agents
        </Link>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "customize", label: "Customize" },
    { id: "logs", label: "Logs" },
    { id: "billing", label: "Billing" },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{agent.name}</h1>
          <p className="text-sm text-[var(--oracle-muted)]">
            {agent.tokenName} · {agent.tokenMint.slice(0, 12)}…
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm ${
            agent.status === "active"
              ? "bg-green-500/20 text-green-400"
              : agent.status === "paused"
                ? "bg-amber-500/20 text-amber-400"
                : "bg-[var(--oracle-border)] text-[var(--oracle-muted)]"
          }`}
        >
          {agent.status}
        </span>
      </div>

      <nav className="mb-6 flex gap-2 border-b border-[var(--oracle-border)]">
        {tabs.map(({ id: t, label }) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? "border-[var(--oracle-accent)] text-[var(--oracle-accent)]"
                : "border-transparent text-[var(--oracle-muted)] hover:text-[var(--oracle-text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-4 rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-surface)] p-6">
          <div>
            <h2 className="mb-2 text-sm font-medium text-[var(--oracle-muted)]">System prompt</h2>
            <p className="whitespace-pre-wrap text-sm">{agent.systemPrompt?.slice(0, 400)}{agent.systemPrompt && agent.systemPrompt.length > 400 ? "…" : ""}</p>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-medium text-[var(--oracle-muted)]">Subscription</h2>
            {agent.subscription ? (
              <p className="text-sm">
                Active until {new Date(agent.subscription.periodEnd).toLocaleDateString()}.{" "}
                <Link href={`/dashboard/agents/${id}?tab=billing`} className="text-[var(--oracle-accent)] hover:underline">
                  Manage billing
                </Link>
              </p>
            ) : (
              <p className="text-sm text-amber-400">
                No active activation. Pay 10 USDC to activate this agent.{" "}
                <Link href={`/dashboard/agents/${id}?tab=billing`} className="text-[var(--oracle-accent)] hover:underline">
                  Subscribe
                </Link>
              </p>
            )}
          </div>
          <p className="text-xs text-[var(--oracle-muted)]">
            Created {new Date(agent.createdAt).toLocaleString()}
          </p>
        </div>
      )}

      {tab === "customize" && (
        <div className="space-y-6 rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-surface)] p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">Agent name</label>
            <input
              type="text"
              value={edit.name ?? ""}
              onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))}
              className="w-full max-w-md rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">Token contract address (mint)</label>
            <input
              type="text"
              value={edit.tokenMint ?? ""}
              onChange={(e) => setEdit((x) => ({ ...x, tokenMint: e.target.value }))}
              placeholder="Full Pump.fun / Solana mint (e.g. 7k8d4bRKGcWVH3xusDNrNX5MsvVDNRYdDm9bWiwnpump)"
              className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--oracle-accent)]"
            />
            <p className="mt-1 text-xs text-[var(--oracle-muted)]">Used when users ask about “the token” in Telegram. Must be at least 32 characters. Get it from the token’s page on pump.fun.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">System prompt</label>
            <textarea
              value={edit.systemPrompt ?? ""}
              onChange={(e) => setEdit((x) => ({ ...x, systemPrompt: e.target.value }))}
              rows={6}
              className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">Personality</label>
            <textarea
              value={edit.config?.personality ?? ""}
              onChange={(e) =>
                setEdit((x) => ({
                  ...x,
                  config: { ...x.config, personality: e.target.value },
                }))
              }
              placeholder="e.g. Friendly, professional, uses emojis sparingly"
              rows={2}
              className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">Tweet frequency</label>
              <select
                value={edit.config?.tweetFrequency ?? ""}
                onChange={(e) =>
                  setEdit((x) => ({
                    ...x,
                    config: { ...x.config, tweetFrequency: e.target.value },
                  }))
                }
                className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
              >
                <option value="">Not set</option>
                <option value="hourly">Hourly</option>
                <option value="every_4_hours">Every 4 hours</option>
                <option value="daily">Daily</option>
                <option value="manual">Manual only</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="mentionMonitoring"
                checked={edit.config?.mentionMonitoring ?? true}
                onChange={(e) =>
                  setEdit((x) => ({
                    ...x,
                    config: { ...x.config, mentionMonitoring: e.target.checked },
                  }))
                }
                className="h-4 w-4 rounded border-[var(--oracle-border)]"
              />
              <label htmlFor="mentionMonitoring" className="text-sm">Monitor mentions</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="memeGeneration"
                checked={edit.config?.memeGeneration ?? false}
                onChange={(e) =>
                  setEdit((x) => ({
                    ...x,
                    config: { ...x.config, memeGeneration: e.target.checked },
                  }))
                }
                className="h-4 w-4 rounded border-[var(--oracle-border)]"
              />
              <label htmlFor="memeGeneration" className="text-sm">Meme generation</label>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">Twitter / X credentials (optional)</label>
            {twitterError && (
              <p className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {twitterError}
              </p>
            )}
            {twitterOk && (
              <p className="mb-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-400">
                Twitter connected. This agent can now post tweets.
              </p>
            )}
            <TwitterCredentialsSave agentId={id} key={twitterOk ? "ok" : "pending"} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">Telegram bot token (this agent’s bot)</label>
            <TelegramBotTokenSave agentId={id} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">Telegram owner chat ID</label>
            <input
              type="text"
              value={edit.config?.telegramChatId ?? ""}
              onChange={(e) =>
                setEdit((x) => ({
                  ...x,
                  config: { ...x.config, telegramChatId: e.target.value },
                }))
              }
              placeholder="e.g. 123456789 (get from @userinfobot in Telegram)"
              className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
            />
            <p className="mt-1 text-xs text-[var(--oracle-muted)]">Your chat ID so this agent’s bot can message you. Get ID from @userinfobot after starting a chat with your bot.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">Posting behavior</label>
            <textarea
              value={edit.config?.postingBehavior ?? ""}
              onChange={(e) =>
                setEdit((x) => ({
                  ...x,
                  config: { ...x.config, postingBehavior: e.target.value },
                }))
              }
              placeholder="When to post, tone, topics to avoid…"
              rows={2}
              className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">Reply behavior</label>
            <textarea
              value={edit.config?.replyBehavior ?? ""}
              onChange={(e) =>
                setEdit((x) => ({
                  ...x,
                  config: { ...x.config, replyBehavior: e.target.value },
                }))
              }
              placeholder="Auto-reply rules, when to reply, max replies per hour…"
              rows={2}
              className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--oracle-muted)]">Auto-reply rules (JSON or text)</label>
            <textarea
              value={edit.config?.autoReplyRules ?? ""}
              onChange={(e) =>
                setEdit((x) => ({
                  ...x,
                  config: { ...x.config, autoReplyRules: e.target.value },
                }))
              }
              placeholder='e.g. Reply to mentions with token name, thank new followers'
              rows={2}
              className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--oracle-accent)]"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={saveAgent}
              disabled={saving}
              className="rounded-lg bg-[var(--oracle-accent)] px-4 py-2 font-medium text-[var(--oracle-bg)] hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-lg border border-[var(--oracle-border)] px-4 py-2 text-sm hover:bg-[var(--oracle-border)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {tab === "logs" && (
        <div className="rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-surface)] p-6">
          <h2 className="mb-4 text-sm font-medium text-[var(--oracle-muted)]">Agent activity</h2>
          {logs.length === 0 ? (
            <p className="text-sm text-[var(--oracle-muted)]">No logs yet. Activity will appear here once the agent is active.</p>
          ) : (
            <ul className="space-y-2 font-mono text-sm">
              {logs.map((log) => (
                <li key={log.id} className="flex gap-3 border-b border-[var(--oracle-border)]/50 py-2">
                  <span className="text-[var(--oracle-muted)]">{new Date(log.createdAt).toLocaleString()}</span>
                  <span className={log.level === "error" ? "text-red-400" : log.level === "warn" ? "text-amber-400" : ""}>
                    [{log.level}]
                  </span>
                  {log.action && <span className="text-[var(--oracle-accent)]">{log.action}</span>}
                  <span>{log.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "billing" && (
        <div className="rounded-xl border border-[var(--oracle-border)] bg-[var(--oracle-surface)] p-6">
          <h2 className="mb-2 text-lg font-semibold">Billing</h2>
          <p className="mb-4 text-sm text-[var(--oracle-muted)]">
            First agent is free (1 per user). Additional agents require a 10 USDC activation.
          </p>
          {agent.subscription ? (
            <div className="mb-4 rounded-lg border border-[var(--oracle-border)] p-4">
              <p className="text-sm">
                <strong>Status:</strong> Active
              </p>
              <p className="text-sm text-[var(--oracle-muted)]">
                Active until: {new Date(agent.subscription.periodEnd).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <p className="mb-4 text-sm text-amber-400">No active activation. Pay 10 USDC to activate this agent.</p>
          )}
          <SubscribeButton agentId={agent.id} tokenMint={agent.tokenMint} />
        </div>
      )}
    </div>
  );
}
