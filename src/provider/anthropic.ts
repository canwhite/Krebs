/**
 * Anthropic Claude Provider
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  ChatCompletionOptions,
  ChatCompletionResult,
  EmbeddingResult,
} from "@/types/index.js";
import type { LLMProvider, ProviderConfig } from "./base.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(config: ProviderConfig = {}) {
    if (!config.apiKey) {
      throw new Error("Anthropic API key is required");
    }
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 60000,
    });
  }

  async chat(
    messages: Message[],
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    const response = await this.client.messages.create({
      model: options.model,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      system: messages.find((m) => m.role === "system")?.content,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
    });

    const content =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    return {
      content,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens:
          response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }

  async chatStream(
    messages: Message[],
    options: ChatCompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<ChatCompletionResult> {
    const stream = await this.client.messages.create({
      model: options.model,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      system: messages.find((m) => m.role === "system")?.content,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      stream: true,
    });

    let fullContent = "";
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            fullContent += chunk;
            onChunk(chunk);
          }
          break;
        case "message_start":
          inputTokens = event.message.usage.input_tokens;
          break;
        case "message_delta":
          outputTokens = event.usage.output_tokens;
          break;
      }
    }

    return {
      content: fullContent,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }

  async embed(_text: string): Promise<EmbeddingResult> {
    throw new Error("Anthropic does not support embeddings");
  }

  async embedBatch(_texts: string[]): Promise<EmbeddingResult[]> {
    throw new Error("Anthropic does not support embeddings");
  }
}
