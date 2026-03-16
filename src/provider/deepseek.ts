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
import { isContextOverflowError } from "@/agent/errors.js";

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

      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || String(error);

        // 检查是否为上下文溢出错误
        if (isContextOverflowError(errorMessage) && attempt < maxRetries) {
          console.warn(
            `[DeepSeek] Context overflow detected (attempt ${attempt + 1}/${maxRetries + 1}), ` +
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
    // 转换工具格式为 DeepSeek/OpenAI 格式
    const deepseekTools = options.tools?.map((tool) => ({
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
      tools: deepseekTools && deepseekTools.length > 0 ? deepseekTools : undefined,
    });

    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;
    const toolCalls: any[] = [];
    let chunkCount = 0;

    console.log(`[DeepSeek] ============ chatStream START ============`);
    console.log(`[DeepSeek] Model: ${options.model}`);
    console.log(`[DeepSeek] Messages count: ${messages.length}`);
    console.log(`[DeepSeek] User message: "${messages[messages.length - 1]?.content?.substring(0, 100)}..."`);
    console.log(`[DeepSeek] Tools: ${deepseekTools?.length || 0}`);
    if (deepseekTools) {
      deepseekTools.forEach((t, i) => {
        console.log(`[DeepSeek]   Tool ${i + 1}: ${t.function.name}`);
        console.log(`[DeepSeek]     Description: ${t.function.description?.substring(0, 80)}...`);
        console.log(`[DeepSeek]     Parameters: ${JSON.stringify(t.function.parameters).substring(0, 100)}...`);
      });
    }

    for await (const chunk of stream) {
      chunkCount++;
      const delta = chunk.choices[0]?.delta;

      // 每50个chunk打印一次状态
      if (chunkCount % 50 === 0) {
        console.log(`[DeepSeek] Chunk ${chunkCount}, content so far: ${fullContent.length} chars`);
      }

      // 处理文本内容
      if (delta?.content) {
        fullContent += delta.content;
        onChunk(delta.content);
      }

      // 处理工具调用
      if (delta?.tool_calls) {
        console.log(`[DeepSeek] 🔧 Tool calls detected in chunk ${chunkCount}!`);
        console.log(`[DeepSeek]    tool_calls count: ${delta.tool_calls.length}`);

        for (const toolCallDelta of delta.tool_calls) {
          const index = toolCallDelta.index;
          console.log(`[DeepSeek]    Tool call delta at index ${index}:`, JSON.stringify(toolCallDelta).substring(0, 200));

          // 确保有足够的空间
          while (toolCalls.length <= index) {
            toolCalls.push({});
          }

          if (toolCallDelta.id) {
            toolCalls[index].id = toolCallDelta.id;
            console.log(`[DeepSeek]      Tool ID: ${toolCallDelta.id}`);
          }

          if (toolCallDelta.type) {
            toolCalls[index].type = toolCallDelta.type;
            console.log(`[DeepSeek]      Tool type: ${toolCallDelta.type}`);
          }

          if (toolCallDelta.function?.name) {
            toolCalls[index].name = toolCallDelta.function.name;
            console.log(`[DeepSeek]      Tool name: ${toolCallDelta.function.name}`);
          }

          if (toolCallDelta.function?.arguments) {
            if (!toolCalls[index].arguments) {
              toolCalls[index].arguments = "";
            }
            toolCalls[index].arguments += toolCallDelta.function.arguments;
            console.log(`[DeepSeek]      Tool args fragment: "${toolCallDelta.function.arguments}"`);
          }
        }
      }

      // 处理使用量信息
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens;
        completionTokens = chunk.usage.completion_tokens;
        console.log(`[DeepSeek] 📊 Usage: prompt=${promptTokens}, completion=${completionTokens}`);
      }
    }

    console.log(`[DeepSeek] ============ Stream completed ============`);
    console.log(`[DeepSeek] Total chunks: ${chunkCount}`);
    console.log(`[DeepSeek] Content length: ${fullContent.length}`);
    console.log(`[DeepSeek] Tool calls collected: ${toolCalls.length}`);

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
