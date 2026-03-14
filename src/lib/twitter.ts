/**
 * Twitter/X API v2 - post tweets on behalf of the agent's connected account.
 * Credentials (OAuth 2 access token) are stored per-agent and decrypted at runtime.
 */

const TWITTER_API_BASE = "https://api.twitter.com/2";

export type TwitterCredentials = {
  access_token: string;
};

export type TwitterTweet = {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  conversation_id?: string;
  referenced_tweets?: { type: "retweeted" | "quoted" | "replied_to"; id: string }[];
};

type TwitterApiError = { detail?: string; message?: string };

async function twitterRequest<T>(
  accessToken: string,
  endpoint: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const res = await fetch(`${TWITTER_API_BASE}${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json()) as T & { error?: TwitterApiError };
  if (!res.ok) {
    const err = data.error as TwitterApiError | undefined;
    return { ok: false, error: err?.detail ?? err?.message ?? `HTTP ${res.status}` };
  }
  return { ok: true, data };
}

export async function postTweet(
  accessToken: string,
  text: string,
  options?: { replyToTweetId?: string }
): Promise<{ id?: string; error?: string }> {
  if (!text || text.length > 280) {
    return { error: "Tweet must be 1–280 characters" };
  }
  const payload: { text: string; reply?: { in_reply_to_tweet_id: string } } = { text };
  if (options?.replyToTweetId) {
    payload.reply = { in_reply_to_tweet_id: options.replyToTweetId };
  }
  const res = await twitterRequest<{ data?: { id: string }; error?: { detail: string } }>(
    accessToken,
    "/tweets",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    return { error: res.error };
  }
  return { id: res.data.data?.id };
}

export async function getAuthenticatedUser(
  accessToken: string
): Promise<{ id?: string; username?: string; error?: string }> {
  const res = await twitterRequest<{ data?: { id: string; username: string } }>(
    accessToken,
    "/users/me"
  );
  if (!res.ok) return { error: res.error };
  return { id: res.data.data?.id, username: res.data.data?.username };
}

export async function getUserMentions(
  accessToken: string,
  userId: string,
  sinceId?: string
): Promise<{ mentions?: TwitterTweet[]; error?: string }> {
  const query = new URLSearchParams({
    max_results: "20",
    "tweet.fields": "author_id,conversation_id,created_at,referenced_tweets",
  });
  if (sinceId) query.set("since_id", sinceId);
  const res = await twitterRequest<{ data?: TwitterTweet[] }>(
    accessToken,
    `/users/${userId}/mentions?${query.toString()}`
  );
  if (!res.ok) return { error: res.error };
  return { mentions: res.data.data ?? [] };
}

export async function getTweetById(
  accessToken: string,
  tweetId: string
): Promise<{ tweet?: TwitterTweet; error?: string }> {
  const query = new URLSearchParams({
    "tweet.fields": "author_id,conversation_id,created_at,referenced_tweets",
  });
  const res = await twitterRequest<{ data?: TwitterTweet }>(
    accessToken,
    `/tweets/${tweetId}?${query.toString()}`
  );
  if (!res.ok) return { error: res.error };
  return { tweet: res.data.data };
}

export async function getReplyThreadContext(
  accessToken: string,
  mention: TwitterTweet,
  maxDepth = 8
): Promise<TwitterTweet[]> {
  const chain: TwitterTweet[] = [mention];
  let current = mention;
  for (let i = 0; i < maxDepth; i++) {
    const parentId = current.referenced_tweets?.find((r) => r.type === "replied_to")?.id;
    if (!parentId) break;
    const parent = await getTweetById(accessToken, parentId);
    if (!parent.tweet) break;
    chain.push(parent.tweet);
    current = parent.tweet;
  }
  return chain.reverse();
}
