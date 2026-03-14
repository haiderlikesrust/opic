import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptCredential, decryptCredential } from "@/lib/encrypt";

const TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const COOKIE_NAME = "twitter_oauth";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/twitter-oauth/callback`;
  const dashboardOrigin = process.env.NEXTAUTH_URL ?? origin;
  const agentPath = state
    ? `/dashboard/agents/${state}?tab=customize`
    : "/dashboard";

  const clearCookie = (res: NextResponse) => {
    res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return res;
  };

  if (error) {
    const res = NextResponse.redirect(
      `${dashboardOrigin}${agentPath}&twitter=error&message=${encodeURIComponent(error)}`
    );
    return clearCookie(res);
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (!code || !state || !cookie) {
    const res = NextResponse.redirect(`${dashboardOrigin}${agentPath}&twitter=missing`);
    return clearCookie(res);
  }

  let codeVerifier: string;
  try {
    const parsed = JSON.parse(cookie) as { codeVerifier?: string; state?: string };
    codeVerifier = parsed.codeVerifier ?? "";
    if (parsed.state !== state) throw new Error("state mismatch");
  } catch {
    const res = NextResponse.redirect(`${dashboardOrigin}${agentPath}&twitter=invalid`);
    return clearCookie(res);
  }

  const agentId = state;
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: { credentials: true },
  });
  if (!agent) {
    const res = NextResponse.redirect(`${dashboardOrigin}${agentPath}&twitter=agent`);
    return clearCookie(res);
  }
  const twitterCred = agent.credentials.find((c) => c.provider === "twitter");
  if (!twitterCred) {
    const res = NextResponse.redirect(`${dashboardOrigin}${agentPath}&twitter=config`);
    return clearCookie(res);
  }
  let clientId: string;
  let clientSecret: string;
  try {
    const raw = decryptCredential(twitterCred.encrypted);
    const p = JSON.parse(raw) as { client_id?: string; client_secret?: string };
    clientId = p.client_id?.trim() ?? "";
    clientSecret = p.client_secret?.trim() ?? "";
  } catch {
    const res = NextResponse.redirect(`${dashboardOrigin}${agentPath}&twitter=config`);
    return clearCookie(res);
  }
  if (!clientId || !clientSecret) {
    const res = NextResponse.redirect(`${dashboardOrigin}${agentPath}&twitter=config`);
    return clearCookie(res);
  }

  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch(TWITTER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${authHeader}`,
    },
    body: body.toString(),
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };

  if (!tokenRes.ok || !tokenData.access_token) {
    const msg = tokenData.error ?? "Token exchange failed";
    const res = NextResponse.redirect(
      `${dashboardOrigin}${agentPath}&twitter=token&message=${encodeURIComponent(msg)}`
    );
    return clearCookie(res);
  }

  let merged: { client_id: string; client_secret: string; access_token: string };
  try {
    const raw = decryptCredential(twitterCred.encrypted);
    const p = JSON.parse(raw) as { client_id?: string; client_secret?: string; access_token?: string };
    merged = {
      client_id: p.client_id ?? clientId,
      client_secret: p.client_secret ?? clientSecret,
      access_token: tokenData.access_token,
    };
  } catch {
    merged = {
      client_id: clientId,
      client_secret: clientSecret,
      access_token: tokenData.access_token,
    };
  }
  const payload = JSON.stringify(merged);
  const encrypted = encryptCredential(payload);
  await prisma.credential.upsert({
    where: { agentId_provider: { agentId, provider: "twitter" } },
    create: { agentId, provider: "twitter", encrypted },
    update: { encrypted },
  });

  const res = NextResponse.redirect(
    `${dashboardOrigin}/dashboard/agents/${agentId}?tab=customize&twitter=ok`
  );
  return clearCookie(res);
}
