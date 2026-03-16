/**
 * OpenAI Provider
 */

import OpenAI from "openai";
import type {
  Message,
  ChatCompletionOptions,
  ChatCompletionResult,
  EmbeddingResult,
} from "@/types/index.js";
import type { LLMProvider, ProviderConfig } from "./base.js";
import { isContextOverflowError } from "@/agent/errors.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(config: ProviderConfig = {}) {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required");
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 60000,
    });
  }

  async chat(
    messages: Message[],
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    // 自动重试机制（针对上下文溢出错误）
    let lastError: Error | null = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: options.model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: options.temperature,
          max_tokens: options.maxTokens,
        });

        const content = response.choices[0]?.message.content ?? "";

        return {
          content,
          usage: {
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
            totalTokens: response.usage?.total_tokens ?? 0,
          },
        };

      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || String(error);

        // 检查是否为上下文溢出错误
        if (isContextOverflowError(errorMessage) && attempt < maxRetries) {
          console.warn(
            `[OpenAI] Context overflow detected (attempt ${attempt + 1}/${maxRetries + 1}), ` +
            `please compress messages and retry. Error: ${errorMessage}`
          );

          // 等待一小段时间后重试
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        // 其他错误直接抛出
        throw error;
      }
    }

    // 所有重试都失败
    throw lastError || new Error("Max retries exceeded");
  }

  async chatStream(
    messages: Message[],
    options: ChatCompletionOptions & { tools?: any[] },
    onChunk: (chunk: string) => void
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

    const stream = await this.client.chat.completions.create({
      model: options.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
      tools: openaiTools && openaiTools.length > 0 ? openaiTools : undefined,
    });

    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;
    const toolCalls: any[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // 处理文本内容
      if (delta?.content) {
        fullContent += delta.content;
        onChunk(delta.content);
      }

      // 处理工具调用
      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;

          // 确保有足够的空间
          while (toolCalls.length <= index) {
            toolCalls.push({});
          }

          if (toolCallDelta.id) {
            toolCalls[index].id = toolCallDelta.id;
          }

          if (toolCallDelta.type) {
            toolCalls[index].type = toolCallDelta.type;
          }

          if (toolCallDelta.function?.name) {
            toolCalls[index].name = toolCallDelta.function.name;
          }

          if (toolCallDelta.function?.arguments) {
            if (!toolCalls[index].arguments) {
              toolCalls[index].arguments = "";
            }
            toolCalls[index].arguments += toolCallDelta.function.arguments;
          }
        }
      }

      // 处理使用量信息
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
      }
    }

    // 解析工具调用参数
    const parsedToolCalls = toolCalls
      .filter((tc) => tc.name && tc.arguments)
      .map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: JSON.parse(tc.arguments),
      }));

    return {
      content: fullContent,
      toolCalls: parsedToolCalls.length > 0 ? parsedToolCalls : undefined,
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
