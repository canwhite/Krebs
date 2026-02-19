/**
 * DeepSeek Provider
 * DeepSeek 使用 OpenAI 兼容的 API
 */

import OpenAI from "openai";
import type {
  Message,
  ChatCompletionOptions,
  ChatCompletionResult,
  EmbeddingResult,
} from "@/types/index.js";
import type { LLMProvider, ProviderConfig } from "./base.js";
import type { Tool } from "@/agent/tools/index.js";

export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek";
  private client: OpenAI;

  constructor(config: ProviderConfig = {}) {
    if (!config.apiKey) {
      throw new Error("DeepSeek API key is required");
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? "https://api.deepseek.com",
      timeout: config.timeout ?? 60000,
    });
  }

  async chat(
    messages: Message[],
    options: ChatCompletionOptions & { tools?: Tool[] }
  ): Promise<ChatCompletionResult & { toolCalls?: any[] }> {
    // 转换工具格式为 OpenAI 格式
    const openaiTools = options.tools?.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    const response = await this.client.chat.completions.create({
      model: options.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      tools: openaiTools && openaiTools.length > 0 ? openaiTools : undefined,
    });

    const message = response.choices[0]?.message;

    // 检查是否有 tool_calls
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolCalls = message.tool_calls.map((tc) => {
        try {
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          };
        } catch (error) {
          console.error('[DeepSeek] Failed to parse tool arguments:', {
            toolName: tc.function.name,
            arguments: tc.function.arguments,
            argumentsLength: tc.function.arguments?.length,
            error: error instanceof Error ? error.message : error
          });
          throw new Error(
            `Failed to parse arguments for tool ${tc.function.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      });

      return {
        content: "",
        toolCalls,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
      };
    }

    const content = message?.content ?? "";

    return {
      content,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    };
  }

  async chatStream(
    messages: Message[],
    options: ChatCompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<ChatCompletionResult> {
    const stream = await this.client.chat.completions.create({
      model: options.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
    });

    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        fullContent += delta.content;
        onChunk(delta.content);
      }
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }
    }

    return {
      content: fullContent,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    const embedding = response.data[0]?.embedding ?? [];

    return {
      embedding,
      model: response.model,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const response = await this.client.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
    });

    return response.data.map((d) => ({
      embedding: d.embedding,
      model: response.model,
    }));
  }
}
