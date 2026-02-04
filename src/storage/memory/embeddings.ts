/**
 * Embedding Provider 实现
 *
 * 支持本地 Ollama 和远程 OpenAI
 */

import type { IEmbeddingProvider, EmbeddingResult } from "./types.js";

/**
 * Ollama Embedding Provider（本地）
 *
 * 使用 Ollama 本地服务生成向量
 * 默认模型：nomic-embed-text 或 mxbai-embed-large
 */
export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  readonly name = "ollama";

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeout: number;

  constructor(options: {
    baseUrl?: string;
    model?: string;
    timeout?: number;
  } = {}) {
    this.baseUrl = options.baseUrl || "http://localhost:11434";
    this.model = options.model || "nomic-embed-text";
    this.timeout = options.timeout || 60000; // 60秒
  }

  /**
   * 生成单个文本的向量
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(this.timeout),
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama embedding failed: ${error}`);
    }

    const data = await response.json() as OllamaEmbedResponse;
    const embedding = data.embedding;

    return {
      embedding,
      dims: embedding.length,
      model: this.model,
    };
  }

  /**
   * 批量生成向量
   * Ollama 不支持原生批量，我们使用并发请求
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // 并发请求，限制并发数为 4
    const concurrency = 4;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((text) => this.embed(text))
      );
      results.push(...batchResults);
    }

    return results;
  }
}

/**
 * OpenAI Embedding Provider（远程备用）
 *
 * 使用 OpenAI API 生成向量
 */
export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  readonly name = "openai";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(options: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    timeout?: number;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model || "text-embedding-3-small";
    this.baseUrl = options.baseUrl || "https://api.openai.com/v1";
    this.timeout = options.timeout || 60000;
  }

  /**
   * 生成单个文本的向量
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      signal: AbortSignal.timeout(this.timeout),
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = await response.json() as OpenAIEmbedResponse;
    const embedding = data.data[0].embedding;

    return {
      embedding,
      dims: embedding.length,
      model: this.model,
    };
  }

  /**
   * 批量生成向量
   * OpenAI 支持原生批量（最多 2048 个文本）
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const batchSize = 2048;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(this.timeout),
        body: JSON.stringify({
          model: this.model,
          input: batch,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI batch embedding failed: ${error}`);
      }

      const data = await response.json() as OpenAIEmbedResponse;

      results.push(
        ...data.data.map((item) => ({
          embedding: item.embedding,
          dims: item.embedding.length,
          model: this.model,
        }))
      );
    }

    return results;
  }
}

/**
 * 创建 Embedding Provider
 *
 * 根据配置自动选择合适的 Provider
 */
export async function createEmbeddingProvider(options: {
  type: "ollama" | "openai" | "auto";
  ollama?: OllamaEmbeddingProvider;
  openai?: OpenAIEmbeddingProvider;
}): Promise<IEmbeddingProvider> {
  const { type, ollama, openai } = options;

  if (type === "ollama") {
    if (ollama) return ollama;
    return new OllamaEmbeddingProvider();
  }

  if (type === "openai") {
    if (!openai) {
      throw new Error("OpenAI provider options required");
    }
    return openai;
  }

  // auto: 先尝试 Ollama，失败则使用 OpenAI
  if (type === "auto") {
    if (ollama) {
      try {
        // 测试 Ollama 连接
        await ollama.embed("test");
        return ollama;
      } catch {
        // Ollama 不可用，尝试 OpenAI
      }
    }

    if (openai) return openai;

    // 都不可用，返回默认 Ollama provider
    return new OllamaEmbeddingProvider();
  }

  throw new Error(`Unknown provider type: ${type}`);
}

// ========== 类型定义 ==========

interface OllamaEmbedResponse {
  embedding: number[];
}

interface OpenAIEmbedResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}
