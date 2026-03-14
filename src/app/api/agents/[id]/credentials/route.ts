import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptCredential, decryptCredential } from "@/lib/encrypt";

const ALLOWED_PROVIDERS = ["twitter", "telegram", "discord"] as const;

type TwitterPayload = { client_id?: string; client_secret?: string; access_token?: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: agentId } = await params;
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId: (session.user as unknown as { id: string }).id },
    select: { id: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  const creds = await prisma.credential.findMany({
    where: { agentId },
    select: { provider: true },
  });
  return NextResponse.json({
    providers: creds.map((c) => c.provider),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as unknown as { id: string }).id;
  const { id: agentId } = await params;
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  let body: { provider?: string; payload?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const provider = body.provider?.toLowerCase();
  const payload = body.payload;
  if (!provider || !ALLOWED_PROVIDERS.includes(provider as (typeof ALLOWED_PROVIDERS)[number])) {
    return NextResponse.json(
      { error: "provider must be one of: twitter, telegram, discord" },
      { status: 400 },
    );
  }
  if (typeof payload !== "string") {
    return NextResponse.json(
      { error: "payload must be a string (e.g. JSON stringified credentials)" },
      { status: 400 },
    );
  }
  try {
    let finalPayload = payload;
    if (provider === "twitter") {
      const existing = await prisma.credential.findUnique({
        where: { agentId_provider: { agentId, provider: "twitter" } },
        select: { encrypted: true },
      });
      const current: TwitterPayload = existing
        ? (() => {
            try {
              return JSON.parse(decryptCredential(existing.encrypted)) as TwitterPayload;
            } catch {
              return {};
            }
          })()
        : {};
      const incoming = (() => {
        try {
          return JSON.parse(payload) as TwitterPayload;
        } catch {
          return {};
        }
      })();
      const merged: TwitterPayload = {
        ...current,
        ...(incoming.client_id !== undefined && { client_id: incoming.client_id.trim() || undefined }),
        ...(incoming.client_secret !== undefined && { client_secret: incoming.client_secret.trim() || undefined }),
        ...(incoming.access_token !== undefined && { access_token: incoming.access_token.trim() || undefined }),
      };
      finalPayload = JSON.stringify(merged);
    }
    const encrypted = encryptCredential(finalPayload);
    await prisma.credential.upsert({
      where: { agentId_provider: { agentId, provider } },
      create: { agentId, provider, encrypted },
      update: { encrypted },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message.includes("CREDENTIAL_SECRET")) {
      return NextResponse.json(
        { error: "Server credential encryption not configured" },
        { status: 503 },
      );
    }
    throw e;
  }
}
