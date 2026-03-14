import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const agent = await prisma.agent.findFirst({
    where: { id, userId: (session.user as unknown as { id: string }).id },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  const logs = await prisma.agentLog.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(
    logs.map((l) => ({
      id: l.id,
      level: l.level,
      action: l.action,
      message: l.message,
      createdAt: l.createdAt.toISOString(),
    })),
  );
}
