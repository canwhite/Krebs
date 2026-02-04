/**
 * Provider 基础接口
 * 所有模型提供者必须实现这个接口
 */

import type {
  Message,
  ChatCompletionOptions,
  ChatCompletionResult,
  EmbeddingResult,
} from "@/types/index.js";

export interface LLMProvider {
  /**
   * 提供者名称
   */
  readonly name: string;

  /**
   * 聊天完成
   */
  chat(
    messages: Message[],
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult>;

  /**
   * 流式聊天
   */
  chatStream(
    messages: Message[],
    options: ChatCompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<ChatCompletionResult>;

  /**
   * 生成嵌入向量
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * 批量生成嵌入向量
   */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}

export type ProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
};
