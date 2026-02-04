/**
 * Provider Factory 单元测试
 */

import { describe, it, expect } from "vitest";
import {
  createAnthropicProvider,
  createOpenAIProvider,
  createDeepSeekProvider,
} from "./factory.js";
import type { AnthropicProviderConfig } from "./anthropic.js";
import type { OpenAIProviderConfig } from "./openai.js";
import type { DeepSeekProviderConfig } from "./deepseek.js";

describe("Provider Factory", () => {
  describe("createAnthropicProvider", () => {
    it("应该创建 Anthropic Provider", () => {
      const config: AnthropicProviderConfig = {
        apiKey: "test-key",
        baseUrl: "https://api.anthropic.com",
      };
      const provider = createAnthropicProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toBe("anthropic");
    });

    it("应该使用默认 baseUrl", () => {
      const config: AnthropicProviderConfig = {
        apiKey: "test-key",
      };
      const provider = createAnthropicProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toBe("anthropic");
    });
  });

  describe("createOpenAIProvider", () => {
    it("应该创建 OpenAI Provider", () => {
      const config: OpenAIProviderConfig = {
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
      };
      const provider = createOpenAIProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toBe("openai");
    });

    it("应该使用默认 baseUrl", () => {
      const config: OpenAIProviderConfig = {
        apiKey: "test-key",
      };
      const provider = createOpenAIProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toBe("openai");
    });
  });

  describe("createDeepSeekProvider", () => {
    it("应该创建 DeepSeek Provider", () => {
      const config: DeepSeekProviderConfig = {
        apiKey: "test-key",
        baseUrl: "https://api.deepseek.com",
      };
      const provider = createDeepSeekProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toBe("deepseek");
    });

    it("应该使用默认 baseUrl", () => {
      const config: DeepSeekProviderConfig = {
        apiKey: "test-key",
      };
      const provider = createDeepSeekProvider(config);

      expect(provider).toBeDefined();
      expect(provider.name).toBe("deepseek");
    });
  });

  describe("Provider 接口一致性", () => {
    it("所有 Provider 应该有 name 属性", () => {
      const anthropic = createAnthropicProvider({ apiKey: "test" });
      const openai = createOpenAIProvider({ apiKey: "test" });
      const deepseek = createDeepSeekProvider({ apiKey: "test" });

      expect(anthropic.name).toBeDefined();
      expect(openai.name).toBeDefined();
      expect(deepseek.name).toBeDefined();
    });

    it("所有 Provider 应该实现必要的方法", () => {
      const anthropic = createAnthropicProvider({ apiKey: "test" });
      const openai = createOpenAIProvider({ apiKey: "test" });
      const deepseek = createDeepSeekProvider({ apiKey: "test" });

      // 检查方法是否存在
      expect(typeof anthropic.chat).toBe("function");
      expect(typeof anthropic.chatStream).toBe("function");
      expect(typeof anthropic.embed).toBe("function");
      expect(typeof anthropic.embedBatch).toBe("function");

      expect(typeof openai.chat).toBe("function");
      expect(typeof openai.chatStream).toBe("function");
      expect(typeof openai.embed).toBe("function");
      expect(typeof openai.embedBatch).toBe("function");

      expect(typeof deepseek.chat).toBe("function");
      expect(typeof deepseek.chatStream).toBe("function");
      expect(typeof deepseek.embed).toBe("function");
      expect(typeof deepseek.embedBatch).toBe("function");
    });
  });
});
