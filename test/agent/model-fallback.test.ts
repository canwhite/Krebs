/**
 * Model Fallback 机制测试
 *
 * 测试目标：
 * 1. 验证主模型正常工作时不触发 fallback
 * 2. 验证主模型失败时自动切换到备用模型
 * 3. 验证可恢复错误的重试机制
 * 4. 验证所有模型失败时抛出错误
 */

import { describe, it, expect, vi } from "vitest";
import {
  runWithModelFallback,
  createFallbackLLMCaller,
  type ModelConfig,
} from "@/agent/model-fallback/index.js";

describe("Model Fallback - 基础功能", () => {
  it("应该在主模型正常时直接返回结果", async () => {
    const primary: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    };

    const runMock = vi.fn().mockResolvedValue("success");

    const result = await runWithModelFallback({
      primary,
      fallbacks: [],
      run: runMock,
      options: { enabled: true },
    });

    expect(result).toBe("success");
    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith(
      primary,
      expect.objectContaining({
        currentIndex: 0,
        currentAttempt: 1,
      })
    );
  });

  it("应该在主模型失败时切换到备用模型", async () => {
    const primary: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    };

    const fallback: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-haiku",
    };

    const runMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Rate limit exceeded"))
      .mockResolvedValueOnce("fallback success");

    const onFallbackMock = vi.fn();

    const result = await runWithModelFallback({
      primary,
      fallbacks: [fallback],
      run: runMock,
      options: {
        enabled: true,
        maxRetries: 1, // 每个模型只尝试一次
        onFallback: onFallbackMock,
      },
    });

    expect(result).toBe("fallback success");
    expect(runMock).toHaveBeenCalledTimes(2);
    expect(onFallbackMock).toHaveBeenCalledTimes(1);
    expect(onFallbackMock).toHaveBeenCalledWith(
      primary,
      fallback,
      expect.any(Error)
    );
  });

  it("应该在所有模型失败时抛出错误", async () => {
    const primary: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    };

    const fallback: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-haiku",
    };

    const runMock = vi
      .fn()
      .mockRejectedValue(new Error("Permanent failure"));

    await expect(
      runWithModelFallback({
        primary,
        fallbacks: [fallback],
        run: runMock,
        options: { enabled: true },
      })
    ).rejects.toThrow("All models failed");
  });

  it("应该在未启用时直接运行主模型", async () => {
    const primary: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    };

    const fallback: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-haiku",
    };

    const runMock = vi.fn().mockResolvedValue("success");

    const result = await runWithModelFallback({
      primary,
      fallbacks: [fallback],
      run: runMock,
      options: { enabled: false },
    });

    expect(result).toBe("success");
    expect(runMock).toHaveBeenCalledTimes(1);
  });
});

describe("Model Fallback - 重试机制", () => {
  it("应该在可恢复错误时重试", async () => {
    const primary: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    };

    let attemptCount = 0;
    const runMock = vi.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount < 2) {
        throw new Error("Rate limit exceeded");
      }
      return Promise.resolve("success after retry");
    });

    const onRetryMock = vi.fn();

    const result = await runWithModelFallback({
      primary,
      fallbacks: [],
      run: runMock,
      options: {
        enabled: true,
        maxRetries: 3,
        retryDelay: 10, // 短延迟用于测试
        onRetry: onRetryMock,
      },
    });

    expect(result).toBe("success after retry");
    expect(attemptCount).toBe(2);
    expect(onRetryMock).toHaveBeenCalledTimes(1);
  });

  it("应该在达到最大重试次数后切换到备用模型", async () => {
    const primary: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    };

    const fallback: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-haiku",
    };

    const runMock = vi
      .fn()
      .mockRejectedValue(new Error("Rate limit exceeded"));

    await expect(
      runWithModelFallback({
        primary,
        fallbacks: [fallback],
        run: runMock,
        options: {
          enabled: true,
          maxRetries: 2,
          retryDelay: 10,
        },
      })
    ).rejects.toThrow("All models failed");

    // 主模型尝试 2 次，备用模型尝试 2 次
    expect(runMock).toHaveBeenCalledTimes(4);
  });

  it("应该在不可恢复错误时立即切换模型", async () => {
    const primary: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    };

    const fallback: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-haiku",
    };

    const runMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("Invalid API key"))
      .mockResolvedValueOnce("fallback success");

    const result = await runWithModelFallback({
      primary,
      fallbacks: [fallback],
      run: runMock,
      options: {
        enabled: true,
        maxRetries: 3,
        retryDelay: 10,
      },
    });

    expect(result).toBe("fallback success");
    // "Invalid API key" 不是可恢复错误，所以只尝试一次
    expect(runMock).toHaveBeenCalledTimes(2);
  });
});

describe("Model Fallback - 多级降级", () => {
  it("应该按顺序尝试多个备用模型", async () => {
    const models: ModelConfig[] = [
      { provider: "anthropic", model: "claude-3-5-sonnet" },
      { provider: "anthropic", model: "claude-3-haiku" },
      { provider: "openai", model: "gpt-4" },
      { provider: "openai", model: "gpt-3.5-turbo" },
    ];

    const callOrder: string[] = [];

    const runMock = vi.fn().mockImplementation((model) => {
      callOrder.push(model.model);
      if (model.model === "gpt-3.5-turbo") {
        return Promise.resolve("final success");
      }
      return Promise.reject(new Error("Failed"));
    });

    const result = await runWithModelFallback({
      primary: models[0],
      fallbacks: models.slice(1),
      run: runMock,
      options: {
        enabled: true,
        maxRetries: 1, // 每个模型只尝试一次
      },
    });

    expect(result).toBe("final success");
    expect(callOrder).toEqual([
      "claude-3-5-sonnet",
      "claude-3-haiku",
      "gpt-4",
      "gpt-3.5-turbo",
    ]);
  });
});

describe("Model Fallback - createFallbackLLMCaller", () => {
  it("应该创建一个可重用的 fallback caller", async () => {
    const caller = createFallbackLLMCaller({
      primary: { provider: "anthropic", model: "claude-3-5-sonnet" },
      fallbacks: [{ provider: "anthropic", model: "claude-3-haiku" }],
      options: { enabled: true },
    });

    const runMock1 = vi.fn().mockResolvedValue("result1");
    const result1 = await caller(runMock1);

    expect(result1).toBe("result1");

    const runMock2 = vi.fn().mockResolvedValue("result2");
    const result2 = await caller(runMock2);

    expect(result2).toBe("result2");
  });
});

describe("Model Fallback - 错误类型识别", () => {
  it("应该识别 rate limit 错误", async () => {
    const primary: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    };

    let attemptCount = 0;
    const runMock = vi.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error("Rate limit exceeded: 429");
      }
      return Promise.resolve("success");
    });

    const result = await runWithModelFallback({
      primary,
      fallbacks: [],
      run: runMock,
      options: {
        enabled: true,
        maxRetries: 3,
        retryDelay: 10,
      },
    });

    expect(result).toBe("success");
    expect(attemptCount).toBe(2);
  });

  it("应该识别 timeout 错误", async () => {
    const primary: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    };

    let attemptCount = 0;
    const runMock = vi.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error("Request timed out");
      }
      return Promise.resolve("success");
    });

    const result = await runWithModelFallback({
      primary,
      fallbacks: [],
      run: runMock,
      options: {
        enabled: true,
        maxRetries: 3,
        retryDelay: 10,
      },
    });

    expect(result).toBe("success");
    expect(attemptCount).toBe(2);
  });

  it("应该识别服务器错误", async () => {
    const primary: ModelConfig = {
      provider: "anthropic",
      model: "claude-3-5-sonnet",
    };

    let attemptCount = 0;
    const runMock = vi.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error("Server error: 503");
      }
      return Promise.resolve("success");
    });

    const result = await runWithModelFallback({
      primary,
      fallbacks: [],
      run: runMock,
      options: {
        enabled: true,
        maxRetries: 3,
        retryDelay: 10,
      },
    });

    expect(result).toBe("success");
    expect(attemptCount).toBe(2);
  });
});
