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
import type { Tool } from "@/agent/tools/index.js";
import { isContextOverflowError } from "@/agent/errors.js";

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
    options: ChatCompletionOptions & { tools?: Tool[] }
  ): Promise<ChatCompletionResult & { toolCalls?: any[] }> {
    // 转换工具格式为 Anthropic 格式
    const anthropicTools = options.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as any, // Type assertion: our tools conform to Anthropic's format
    }));

    // 自动重试机制（针对上下文溢出错误）
    let lastError: Error | null = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
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
          tools: anthropicTools && anthropicTools.length > 0 ? anthropicTools : undefined,
        });

        // 检查是否有 tool_use
        const toolUseBlocks = response.content.filter((block) => block.type === "tool_use");

        if (toolUseBlocks.length > 0) {
          // 有工具调用
          const toolCalls = toolUseBlocks.map((block: any) => ({
            id: block.id,
            name: block.name,
            arguments: block.input,
          }));

          return {
            content: "",
            toolCalls,
            usage: {
              promptTokens: response.usage.input_tokens,
              completionTokens: response.usage.output_tokens,
              totalTokens:
                response.usage.input_tokens + response.usage.output_tokens,
            },
          };
        }

        // 普通文本响应
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

      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || String(error);

        // 检查是否为上下文溢出错误
        if (isContextOverflowError(errorMessage) && attempt < maxRetries) {
          console.warn(
            `[Anthropic] Context overflow detected (attempt ${attempt + 1}/${maxRetries + 1}), ` +
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
    options: ChatCompletionOptions & { tools?: Tool[] },
    onChunk: (chunk: string) => void
  ): Promise<ChatCompletionResult & { toolCalls?: any[] }> {
    console.log(`[Anthropic] ============ chatStream START ============`);
    console.log(`[Anthropic] Model: ${options.model}`);
    console.log(`[Anthropic] Messages count: ${messages.length}`);
    console.log(`[Anthropic] Tools provided: ${options.tools?.length || 0}`);

    // 转换工具格式为 Anthropic 格式
    const anthropicTools = options.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as any,
    }));

    if (anthropicTools && anthropicTools.length > 0) {
      console.log(`[Anthropic] Converted ${anthropicTools.length} tools to Anthropic format`);
      anthropicTools.forEach((t, i) => {
        console.log(`[Anthropic]   Tool ${i + 1}: ${t.name}`);
      });
    }

    console.log(`[Anthropic] 📤 Creating stream request...`);

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
      tools: anthropicTools && anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    console.log(`[Anthropic] ✅ Stream created, starting to read events...`);

    let fullContent = "";
    let inputTokens = 0;
    let outputTokens = 0;
    const toolCalls: any[] = [];
    let currentToolUse: any = null;
    let eventCount = 0;

    for await (const event of stream) {
      eventCount++;
      switch (event.type) {
        case "content_block_start":
          console.log(`[Anthropic] Event: content_block_start (type: ${event.content_block.type})`);
          if (event.content_block.type === "tool_use") {
            // 开始一个新的工具调用
            console.log(`[Anthropic] 🔧 Tool use started: ${event.content_block.name}`);
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              arguments: "",
            };
          }
          break;

        case "content_block_delta":
          if (event.delta.type === "text_delta") {
            const chunk = event.delta.text;
            fullContent += chunk;
            onChunk(chunk);
            if (fullContent.length % 100 === 0) {
              console.log(`[Anthropic] 📦 Text content: ${fullContent.length} chars`);
            }
          } else if (event.delta.type === "input_json_delta" && currentToolUse) {
            // 累积工具参数（JSON 片段）
            currentToolUse.arguments += event.delta.partial_json;
            console.log(`[Anthropic] 🔧 Tool args fragment: "${event.delta.partial_json}"`);
          }
          break;

        case "content_block_stop":
          if (currentToolUse) {
            // 工具调用完成，解析参数
            console.log(`[Anthropic] 🔧 Tool use stopped, parsing args...`);
            try {
              currentToolUse.arguments = JSON.parse(currentToolUse.arguments);
              toolCalls.push({
                id: currentToolUse.id,
                name: currentToolUse.name,
                arguments: currentToolUse.arguments,
              });
              console.log(`[Anthropic] ✅ Tool parsed: ${currentToolUse.name}`);
            } catch (error) {
              console.error("[Anthropic] ❌ Failed to parse tool arguments:", error);
            }
            currentToolUse = null;
          }
          break;

        case "message_start":
          inputTokens = event.message.usage.input_tokens;
          console.log(`[Anthropic] 📊 Message start - input tokens: ${inputTokens}`);
          break;

        case "message_delta":
          outputTokens = event.usage.output_tokens;
          console.log(`[Anthropic] 📊 Message delta - output tokens: ${outputTokens}`);
          break;

        default:
          if (eventCount % 50 === 0) {
            console.log(`[Anthropic] Event: ${event.type} (count: ${eventCount})`);
          }
          break;
      }
    }

    console.log(`[Anthropic] ============ Stream completed ============`);
    console.log(`[Anthropic] Total events: ${eventCount}`);
    console.log(`[Anthropic] Content length: ${fullContent.length}`);
    console.log(`[Anthropic] Tool calls found: ${toolCalls.length}`);
    if (toolCalls.length > 0) {
      toolCalls.forEach((tc, i) => {
        console.log(`[Anthropic]   Tool ${i + 1}: ${tc.name}`);
      });
    }

    return {
      content: fullContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
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
