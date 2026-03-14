"use client";

import { useState, useEffect } from "react";

export function TwitterCredentialsSave({ agentId }: { agentId: string }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [msgType, setMsgType] = useState<"ok" | "error" | "">("");
  const [status, setStatus] = useState<{ hasAppKeys: boolean; connected: boolean }>({
    hasAppKeys: false,
    connected: false,
  });
  const [showTokenInput, setShowTokenInput] = useState(false);

  const loadStatus = () => {
    fetch(`/api/agents/${agentId}/credentials/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.twitter) setStatus(data.twitter);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadStatus();
  }, [agentId]);

  const saveAppKeys = async () => {
    const cid = clientId.trim();
    const sec = clientSecret.trim();
    if (!cid || !sec) {
      setMessage("Enter Consumer Key and Secret");
      setMsgType("error");
      return;
    }
    setSaving(true);
    setMessage("");
    setMsgType("");
    try {
      const res = await fetch(`/api/agents/${agentId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "twitter",
          payload: JSON.stringify({ client_id: cid, client_secret: sec }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Failed to save");
        setMsgType("error");
        return;
      }
      setMessage("App credentials saved. You can now connect an X account.");
      setMsgType("ok");
      setClientId("");
      setClientSecret("");
      loadStatus();
    } catch {
      setMessage("Request failed");
      setMsgType("error");
    } finally {
      setSaving(false);
    }
  };

  const saveToken = async () => {
    const t = token.trim();
    if (!t) {
      setMessage("Enter the OAuth 2 access token");
      setMsgType("error");
      return;
    }
    setSaving(true);
    setMessage("");
    setMsgType("");
    try {
      const res = await fetch(`/api/agents/${agentId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "twitter",
          payload: JSON.stringify({ access_token: t }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Failed to save");
        setMsgType("error");
        return;
      }
      setMessage("X account token saved.");
      setMsgType("ok");
      setToken("");
      setShowTokenInput(false);
      loadStatus();
    } catch {
      setMessage("Request failed");
      setMsgType("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {status.connected ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2">
          <span className="text-sm text-[var(--oracle-accent)]">✓ This agent’s X account connected</span>
          <button
            type="button"
            onClick={() => setShowTokenInput(true)}
            className="text-sm text-[var(--oracle-muted)] hover:text-[var(--oracle-accent)] underline"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--oracle-muted)]">Twitter app – Consumer Key (Client ID)</label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="From Application Created modal"
              className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
            />
            <label className="block text-xs font-medium text-[var(--oracle-muted)]">Secret Key (Client Secret)</label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="From Application Created modal"
              className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveAppKeys}
                disabled={saving}
                className="rounded-lg bg-[var(--oracle-accent)] px-3 py-1.5 text-sm font-medium text-[var(--oracle-bg)] hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save app credentials"}
              </button>
              {status.hasAppKeys && (
                <a
                  href={`/api/twitter-oauth?agentId=${encodeURIComponent(agentId)}`}
                  className="rounded-lg bg-[#1DA1F2] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Connect this agent to your X account
                </a>
              )}
            </div>
          </div>

          {status.hasAppKeys && (
            <>
              <p className="text-xs text-[var(--oracle-muted)]">Or paste an OAuth 2 access token (with tweet.write) instead of using Connect:</p>
              {showTokenInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="OAuth 2 access token"
                    className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
                  />
                  <button
                    type="button"
                    onClick={saveToken}
                    disabled={saving}
                    className="rounded-lg border border-[var(--oracle-border)] px-3 py-1.5 text-sm hover:bg-[var(--oracle-bg)] disabled:opacity-50"
                  >
                    Save token
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowTokenInput(false); setToken(""); }}
                    className="text-sm text-[var(--oracle-muted)] hover:text-[var(--oracle-text)]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTokenInput(true)}
                  className="text-sm text-[var(--oracle-muted)] hover:text-[var(--oracle-accent)] underline"
                >
                  Paste access token instead
                </button>
              )}
            </>
          )}
        </>
      )}

      {message && (
        <p className={`text-xs ${msgType === "error" ? "text-red-400" : "text-[var(--oracle-accent)]"}`}>
          {message}
        </p>
      )}
      <p className="text-xs text-[var(--oracle-muted)]">
        Enter your Twitter app Consumer Key and Secret here (from the “Application Created” modal). In the Twitter Developer Portal add the callback URL using the same host you use to open this app (e.g. localhost or 127.0.0.1): <code className="rounded bg-black/20 px-1">http://127.0.0.1:3000/api/twitter-oauth/callback</code>. Then click “Connect this agent to your X account.” All credentials are stored encrypted per agent.
      </p>
    </div>
  );
}
