import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { decryptCredential } from "@/lib/encrypt";
import { randomBytes, createHash } from "crypto";

const TWITTER_AUTH_URL = "https://twitter.com/i/oauth2/authorize";
const SCOPE = "tweet.read tweet.write users.read offline.access";
const COOKIE_NAME = "twitter_oauth";
const COOKIE_MAX_AGE = 600;

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  const agentId = req.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }
  const agent = await prisma.agent.findFirst({
    where: { id: agentId, userId: (session.user as unknown as { id: string }).id },
    include: { credentials: true },
  });
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  const twitterCred = agent.credentials.find((c) => c.provider === "twitter");
  if (!twitterCred) {
    return NextResponse.json(
      { error: "Add Twitter app credentials (Consumer Key and Secret) in the Customize tab first." },
      { status: 400 }
    );
  }
  let clientId: string;
  let clientSecret: string;
  try {
    const raw = decryptCredential(twitterCred.encrypted);
    const p = JSON.parse(raw) as { client_id?: string; client_secret?: string };
    clientId = p.client_id?.trim() ?? "";
    clientSecret = p.client_secret?.trim() ?? "";
  } catch {
    return NextResponse.json(
      { error: "Could not read Twitter app credentials. Save Consumer Key and Secret in Customize first." },
      { status: 400 }
    );
  }
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Add Twitter app Consumer Key and Secret in the agent Customize tab, then try Connect again." },
      { status: 400 }
    );
  }

  const origin = req.nextUrl.origin;
  const callbackPath = "/api/twitter-oauth/callback";
  const redirectUri = `${origin}${callbackPath}`;

  const codeVerifier = base64UrlEncode(randomBytes(32));
  const codeChallenge = base64UrlEncode(
    createHash("sha256").update(codeVerifier).digest()
  );
  const state = agentId;

  const cookieValue = JSON.stringify({ codeVerifier, state });
  const authUrl = new URL(TWITTER_AUTH_URL);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
