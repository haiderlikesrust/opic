import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { decryptCredential } from "@/lib/encrypt";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
  const cred = await prisma.credential.findUnique({
    where: { agentId_provider: { agentId, provider: "twitter" } },
    select: { encrypted: true },
  });
  let twitter = { hasAppKeys: false, connected: false };
  if (cred) {
    try {
      const raw = decryptCredential(cred.encrypted);
      const p = JSON.parse(raw) as { client_id?: string; client_secret?: string; access_token?: string };
      twitter = {
        hasAppKeys: !!(p.client_id && p.client_secret),
        connected: !!p.access_token,
      };
    } catch {
      // leave false
    }
  }
  return NextResponse.json({ twitter });
}
