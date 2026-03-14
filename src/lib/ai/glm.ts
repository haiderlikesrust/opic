/**
 * GLM-5 via Z.AI (OpenAI-compatible API).
 * Uses platform API key from env; all agents use this key.
 */

import OpenAI from "openai";

const BASE_URL = "https://api.z.ai/api/paas/v4";
const MODEL = "glm-5";

function getClient(): OpenAI {
  const apiKey = process.env.Z_AI_API_KEY;
  if (!apiKey) throw new Error("Z_AI_API_KEY is not set");
  return new OpenAI({
    apiKey,
    baseURL: BASE_URL,
  });
}

export type Message = { role: "system" | "user" | "assistant"; content: string };

export async function createChatCompletion(
  systemContent: string,
  userContent: string,
  history: Message[] = []
): Promise<string> {
  const client = getClient();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
  ];
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages,
  });
  const content = completion.choices[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

export async function createChatCompletionWithTools(
  systemContent: string,
  userContent: string,
  tools: OpenAI.Chat.ChatCompletionTool[],
  history: Message[] = []
): Promise<{ content: string | null; toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] }> {
  const client = getClient();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userContent },
  ];
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
  });
  const msg = completion.choices[0]?.message;
  const content = msg?.content ?? null;
  const toolCalls = msg?.tool_calls ?? [];
  return {
    content: typeof content === "string" ? content : null,
    toolCalls,
  };
}

export type ConversationTurn = { role: "user" | "assistant"; content: string };

/**
 * Run a chat with tools, executing tool calls and re-calling the model until it returns a final text reply.
 * executeTool(name, argsJson) should return a string (result for the model).
 * conversationHistory: optional prior turns (oldest first) so the model keeps context.
 */
export async function runChatWithTools(
  systemContent: string,
  userContent: string,
  tools: OpenAI.Chat.ChatCompletionTool[],
  executeTool: (name: string, argsJson: string) => Promise<string>,
  conversationHistory: ConversationTurn[] = []
): Promise<string> {
  const client = getClient();
  const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = conversationHistory.map(
    (t) => ({ role: t.role, content: t.content })
  );
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    ...historyMessages,
    { role: "user", content: userContent },
  ];

  for (let iter = 0; iter < 10; iter++) {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
    });
    const msg = completion.choices[0]?.message;
    if (!msg) return "I couldn't generate a reply.";

    const content = msg.content;
    const toolCalls = msg.tool_calls ?? [];

    if (toolCalls.length === 0) {
      return typeof content === "string" && content.trim() ? content : "Done.";
    }

    messages.push({
      role: "assistant",
      content: content ?? null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "{}" },
      })),
    });

    for (const tc of toolCalls) {
      const name = tc.function?.name ?? "";
      const args = tc.function?.arguments ?? "{}";
      let result: string;
      try {
        result = await executeTool(name, args);
      } catch (e) {
        result = e instanceof Error ? e.message : "Tool error";
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id ?? "",
        content: result,
      });
    }
  }

  return "I hit the reply limit. Try a shorter request.";
}
