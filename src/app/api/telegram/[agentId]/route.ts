/**
 * Telegram webhook: receives updates when Telegram POSTs here (optional, for HTTPS deployments).
 * For local dev or no-HTTPS, use the polling server instead: npm run telegram
 */

import { NextRequest, NextResponse } from "next/server";
import { handleTelegramMessage } from "@/lib/telegram-handler";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id: number };
  };
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  if (!agentId) {
    return NextResponse.json({ error: "Missing agentId" }, { status: 400 });
  }

  let body: TelegramUpdate;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.message?.text?.trim();
  const chatId = body.message?.chat?.id;
  if (!text || chatId == null) {
    return NextResponse.json({ ok: true });
  }

  await handleTelegramMessage(agentId, chatId, text);
  return NextResponse.json({ ok: true });
}
