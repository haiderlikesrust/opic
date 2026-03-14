"use client";

import { useState, useEffect } from "react";

export function TelegramBotTokenSave({ agentId }: { agentId: string }) {
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/agents/${agentId}/credentials`)
      .then((r) => r.json())
      .then((data) => {
        if (data.providers?.includes("telegram")) setSaved(true);
      })
      .catch(() => {});
  }, [agentId]);

  const handleSave = async () => {
    const t = token.trim();
    if (!t) {
      setMessage("Enter the bot token from @BotFather");
      setStatus("error");
      return;
    }
    setStatus("saving");
    setMessage("");
    try {
      const res = await fetch(`/api/agents/${agentId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "telegram",
          payload: JSON.stringify({ bot_token: t }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Failed to save");
        setStatus("error");
        return;
      }
      setStatus("ok");
      setMessage("Saved. Token is stored encrypted.");
      setToken("");
      setSaved(true);
      setShowInput(false);
    } catch {
      setMessage("Request failed");
      setStatus("error");
    }
  };

  return (
    <div className="space-y-2">
      {saved && !showInput ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2">
          <span className="text-sm text-[var(--oracle-accent)]">✓ Telegram bot token saved</span>
          <button
            type="button"
            onClick={() => setShowInput(true)}
            className="text-sm text-[var(--oracle-muted)] hover:text-[var(--oracle-accent)] underline"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="123456:ABC… (from @BotFather)"
            className="w-full rounded-lg border border-[var(--oracle-border)] bg-[var(--oracle-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--oracle-accent)]"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={status === "saving"}
              className="rounded-lg bg-[var(--oracle-accent)] px-3 py-1.5 text-sm font-medium text-[var(--oracle-bg)] hover:opacity-90 disabled:opacity-50"
            >
              {status === "saving" ? "Saving…" : "Save Telegram bot token"}
            </button>
            {saved && (
              <button
                type="button"
                onClick={() => { setShowInput(false); setToken(""); setMessage(""); }}
                className="text-sm text-[var(--oracle-muted)] hover:text-[var(--oracle-text)]"
              >
                Cancel
              </button>
            )}
            {status === "ok" && <span className="text-xs text-[var(--oracle-accent)]">{message}</span>}
            {status === "error" && <span className="text-xs text-red-400">{message}</span>}
          </div>
        </>
      )}
      <p className="text-xs text-[var(--oracle-muted)]">
        Each agent has its own bot. Create one with @BotFather and paste the token here (stored encrypted). To receive DMs and get AI replies, run the Telegram bot server in a separate terminal: <code className="rounded bg-black/20 px-1">npm run telegram</code>. No webhook or public URL needed.
      </p>
    </div>
  );
}
