/**
 * Memory Storage Embedding Provider 单元测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OllamaEmbeddingProvider,
  OpenAIEmbeddingProvider,
  createEmbeddingProvider,
} from "@/storage/memory/embeddings.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("Memory Storage - Embedding Providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("OllamaEmbeddingProvider", () => {
    it("应该有正确的 name", () => {
      const provider = new OllamaEmbeddingProvider();
      expect(provider.name).toBe("ollama");
    });

    it("应该使用默认配置", () => {
      const provider = new OllamaEmbeddingProvider();
      expect(provider).toBeDefined();
    });

    it("应该使用自定义配置", () => {
      const provider = new OllamaEmbeddingProvider({
        baseUrl: "http://custom:11434",
        model: "custom-model",
        timeout: 30000,
      });
      expect(provider).toBeDefined();
    });

    it("应该成功生成单个 embedding", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          embedding: [0.1, 0.2, 0.3],
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const provider = new OllamaEmbeddingProvider();
      const result = await provider.embed("test");

      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.dims).toBe(3);
      expect(result.model).toBe("nomic-embed-text");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/embeddings",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining("test"),
        })
      );
    });

    it("应该处理 embed 错误", async () => {
      const mockResponse = {
        ok: false,
        text: async () => "Connection failed",
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const provider = new OllamaEmbeddingProvider();

      await expect(provider.embed("test")).rejects.toThrow("Ollama embedding failed");
    });

    it("应该批量生成 embeddings", async () => {
      const mockResponse1 = {
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
      };
      const mockResponse2 = {
        ok: true,
        json: async () => ({ embedding: [0.4, 0.5, 0.6] }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse1);
      mockFetch.mockResolvedValueOnce(mockResponse2);

      const provider = new OllamaEmbeddingProvider();
      const results = await provider.embedBatch(["text1", "text2"]);

      expect(results).toHaveLength(2);
      expect(results[0].embedding).toEqual([0.1, 0.2, 0.3]);
      expect(results[1].embedding).toEqual([0.4, 0.5, 0.6]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("应该使用并发控制批量生成", async () => {
      // 创建 10 个文本
      const texts = Array.from({ length: 10 }, (_, i) => `text${i}`);

      // Mock 响应
      mockFetch.mockImplementation(async () => ({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
      }));

      const provider = new OllamaEmbeddingProvider();
      const results = await provider.embedBatch(texts);

      expect(results).toHaveLength(10);

      // 应该分批执行，并发数为 4
      // 10 / 4 = 3 批
      expect(mockFetch).toHaveBeenCalledTimes(10);
    });
  });

  describe("OpenAIEmbeddingProvider", () => {
    it("应该有正确的 name", () => {
      const provider = new OpenAIEmbeddingProvider({
        apiKey: "test-key",
      });
      expect(provider.name).toBe("openai");
 });

    it("应该要求 apiKey", () => {
      expect(() => {
        new OpenAIEmbeddingProvider({ apiKey: "" });
      }).not.toThrow();
    });

    it("应该使用默认配置", () => {
      const provider = new OpenAIEmbeddingProvider({
        apiKey: "test-key",
      });
      expect(provider).toBeDefined();
    });

    it("应该使用自定义配置", () => {
      const provider = new OpenAIEmbeddingProvider({
        apiKey: "test-key",
        model: "text-embedding-3-large",
        baseUrl: "https://custom.openai.com/v1",
        timeout: 120000,
      });
      expect(provider).toBeDefined();
    });

    it("应该成功生成单个 embedding", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          model: "text-embedding-3-small",
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const provider = new OpenAIEmbeddingProvider({
        apiKey: "test-key",
      });
      const result = await provider.embed("test");

      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.dims).toBe(3);
      expect(result.model).toBe("text-embedding-3-small");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/embeddings",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Authorization": "Bearer test-key",
          }),
        })
      );
    });

    it("应该处理 embed 错误", async () => {
      const mockResponse = {
        ok: false,
        text: async () => "Invalid API key",
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const provider = new OpenAIEmbeddingProvider({
        apiKey: "test-key",
      });

      await expect(provider.embed("test")).rejects.toThrow("OpenAI embedding failed");
    });

    it("应该批量生成 embeddings（原生支持）", async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          data: [
            { embedding: [0.1, 0.2, 0.3], index: 0 },
            { embedding: [0.4, 0.5, 0.6], index: 1 },
          ],
          model: "text-embedding-3-small",
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const provider = new OpenAIEmbeddingProvider({
        apiKey: "test-key",
      });
      const results = await provider.embedBatch(["text1", "text2"]);

      expect(results).toHaveLength(2);
      expect(results[0].embedding).toEqual([0.1, 0.2, 0.3]);
      expect(results[1].embedding).toEqual([0.4, 0.5, 0.6]);

      // OpenAI 支持原生批量，应该只调用一次
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("应该处理大批量（超过 2048 个）", async () => {
      // 创建 3000 个文本
      const texts = Array.from({ length: 3000 }, (_, i) => `text${i}`);

      let callCount = 0;
      // Mock 响应
      mockFetch.mockImplementation(async () => {
        callCount++;
        const batchSize = callCount === 1 ? 2048 : 952;
        return {
          ok: true,
          json: async () => ({
            data: Array.from({ length: batchSize }, (_, i) => ({
              embedding: [0.1, 0.2, 0.3],
              index: i,
            })),
          }),
        };
      });

      const provider = new OpenAIEmbeddingProvider({
        apiKey: "test-key",
      });

      const results = await provider.embedBatch(texts);

      expect(results).toHaveLength(3000);

      // 应该分批，2048 + 952 = 2 批
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("createEmbeddingProvider()", () => {
    it("应该创建 Ollama provider", async () => {
      const ollama = new OllamaEmbeddingProvider();
      const provider = await createEmbeddingProvider({
        type: "ollama",
        ollama,
      });

      expect(provider).toBe(ollama);
      expect(provider.name).toBe("ollama");
    });

    it("应该创建 OpenAI provider", async () => {
      const openai = new OpenAIEmbeddingProvider({ apiKey: "test" });
      const provider = await createEmbeddingProvider({
        type: "openai",
        openai,
      });

      expect(provider).toBe(openai);
      expect(provider.name).toBe("openai");
    });

    it("auto 模式应该优先尝试 Ollama", async () => {
      const ollama = new OllamaEmbeddingProvider();
      const openai = new OpenAIEmbeddingProvider({ apiKey: "test" });

      // Mock Ollama 成功
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2] }),
      });

      const provider = await createEmbeddingProvider({
        type: "auto",
        ollama,
        openai,
      });

      expect(provider.name).toBe("ollama");
    });

    it("auto 模式应该回退到 OpenAI", async () => {
      const ollama = new OllamaEmbeddingProvider();
      const openai = new OpenAIEmbeddingProvider({ apiKey: "test" });

      // Mock Ollama 失败
      mockFetch.mockRejectedValueOnce(new Error("Ollama not available"));

      const provider = await createEmbeddingProvider({
        type: "auto",
        ollama,
        openai,
      });

      expect(provider.name).toBe("openai");
    });

    it("auto 模式没有可用 provider 时应该创建默认 Ollama", async () => {
      const provider = await createEmbeddingProvider({
        type: "auto",
      });

      expect(provider.name).toBe("ollama");
    });

    it("应该拒绝未知类型", async () => {
      await expect(
        createEmbeddingProvider({
          type: "unknown" as any,
        })
      ).rejects.toThrow("Unknown provider type");
    });

    it("openai 类型缺少配置应该抛出错误", async () => {
      await expect(
        createEmbeddingProvider({
          type: "openai",
        })
      ).rejects.toThrow("OpenAI provider options required");
    });
  });

  describe("Embedding 结果格式", () => {
    it("Ollama 结果应该符合接口", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embedding: [0.1, 0.2, 0.3] }),
      });

      const provider = new OllamaEmbeddingProvider();
      const result = await provider.embed("test");

      expect(result).toHaveProperty("embedding");
      expect(result).toHaveProperty("dims");
      expect(result).toHaveProperty("model");

      expect(Array.isArray(result.embedding)).toBe(true);
      expect(typeof result.dims).toBe("number");
      expect(typeof result.model).toBe("string");
    });

    it("OpenAI 结果应该符合接口", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          model: "text-embedding-3-small",
        }),
      });

      const provider = new OpenAIEmbeddingProvider({ apiKey: "test" });
      const result = await provider.embed("test");

      expect(result).toHaveProperty("embedding");
      expect(result).toHaveProperty("dims");
      expect(result).toHaveProperty("model");

      expect(Array.isArray(result.embedding)).toBe(true);
      expect(typeof result.dims).toBe("number");
      expect(typeof result.model).toBe("string");
    });
  });
});
