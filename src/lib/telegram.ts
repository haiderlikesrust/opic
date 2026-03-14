/**
 * Telegram Bot API - send messages to the agent owner (or a group).
 * Each agent has its own bot: pass botToken from the agent's stored credentials.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

export async function sendMessageToOwner(
  chatId: string,
  text: string,
  botToken: string
): Promise<{ ok: boolean; error?: string }> {
  if (!botToken.trim()) {
    return { ok: false, error: "Telegram bot token required" };
  }
  const res = await fetch(`${TELEGRAM_API_BASE}${botToken.trim()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) {
    return { ok: false, error: data.description ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

/**
 * Register webhook URL with Telegram so the bot receives incoming updates (DMs).
 * Call this when the user enables "DM replies" for an agent. URL must be HTTPS.
 */
export async function setWebhook(
  botToken: string,
  webhookUrl: string
): Promise<{ ok: boolean; error?: string }> {
  if (!botToken.trim()) {
    return { ok: false, error: "Telegram bot token required" };
  }
  const res = await fetch(
    `${TELEGRAM_API_BASE}${botToken.trim()}/setWebhook?url=${encodeURIComponent(webhookUrl)}&allowed_updates=${encodeURIComponent(JSON.stringify(["message"]))}`,
    { method: "GET" }
  );
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) {
    return { ok: false, error: data.description ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

/**
 * Remove webhook so the bot stops receiving updates at our URL.
 */
export async function deleteWebhook(botToken: string): Promise<{ ok: boolean; error?: string }> {
  if (!botToken.trim()) {
    return { ok: false, error: "Telegram bot token required" };
  }
  const res = await fetch(`${TELEGRAM_API_BASE}${botToken.trim()}/deleteWebhook`, {
    method: "POST",
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) {
    return { ok: false, error: data.description ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}
