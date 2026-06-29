/**
 * Memory Consolidation - LLM Summarization
 *
 * Uses completeSimple from @mariozechner/pi-ai
 */

import type { Model, UserMessage, TextContent } from "@mariozechner/pi-ai";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { completeSimple } from "@mariozechner/pi-ai";

const SUMMARIZATION_SYSTEM_PROMPT = `You are a terse summarizer. If the conversation contains nothing worth preserving (small talk, errors, debugging noise), respond with exactly "SKIP".

Otherwise extract in bullet points:
- Key decisions or facts
- Open questions or follow-ups
- One-line context if needed

Keep output under 200 characters. Be ruthless about excluding noise.`;

const MAX_TOKENS = 8192;

function extractTextContent(msg: AgentMessage): string {
  // Only handle messages with string or array content
  if ("content" in msg) {
    const content = msg.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .filter((c): c is TextContent => c.type === "text")
        .map((c) => c.text)
        .join("\n");
    }
  }
  return "";
}

export async function summarizeMessages(
  messages: AgentMessage[],
  model: Model<any>,
  apiKey: string,
  signal?: AbortSignal
): Promise<string> {
  if (messages.length === 0) {
    return "SKIP";
  }

  // Format messages for summarization
  const formattedMessages = messages.map((msg, i) => {
    const role = "role" in msg ? msg.role : "unknown";
    const content = extractTextContent(msg);
    return `[${i}] ${role}: ${content}`;
  });

  const userMessage: UserMessage = {
    role: "user",
    content: [{ type: "text", text: `Summarize this conversation:\n\n${formattedMessages.join("\n\n")}` }],
    timestamp: Date.now(),
  };

  const response = await completeSimple(
    model,
    {
      systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
      messages: [userMessage],
    },
    { maxTokens: MAX_TOKENS, signal, apiKey }
  );

  const textContent = response.content.find((c): c is TextContent => c.type === "text");
  return textContent?.text?.trim() ?? "";
}
