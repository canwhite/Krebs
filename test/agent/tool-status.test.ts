/**
 * 工具状态系统测试
 *
 * 测试工具状态检查和自动跳过功能
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ToolRegistry, checkToolStatus, ToolStatus } from "../../src/agent/tools/index.js";
import type { Tool, ToolCall } from "../../src/agent/tools/index.js";
import { apiKeyManager } from "../../src/shared/api-keys.js";

describe("Tool Status System", () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    // 清空所有 API keys
    (apiKeyManager as any).clearAll();
  });

  afterEach(() => {
    (apiKeyManager as any).clearAll();
  });

  describe("checkToolStatus", () => {
    it("should return available for tools without API key requirement", () => {
      const status = checkToolStatus("bash", false, undefined);

      expect(status.status).toBe(ToolStatus.AVAILABLE);
      expect(status.isCallable).toBe(true);
      expect(status.message).toBe("Tool is available");
    });

    it("should return missing_config when API key is required but not set", () => {
      const status = checkToolStatus("web_search", true, "BRAVE_API_KEY");

      expect(status.status).toBe(ToolStatus.MISSING_CONFIG);
      expect(status.isCallable).toBe(false);
      expect(status.message).toBe("Requires BRAVE_API_KEY");
      expect(status.missingConfigs).toEqual(["BRAVE_API_KEY"]);
    });

    it("should return available when API key is set", () => {
      // 设置 API key
      apiKeyManager.setApiKey("web_search", "test-key-123");

      const status = checkToolStatus("web_search", true, "BRAVE_API_KEY");

      expect(status.status).toBe(ToolStatus.AVAILABLE);
      expect(status.isCallable).toBe(true);
      expect(status.message).toBe("Tool is available");
    });

    it("should return invalid_config when apiKeyName is missing", () => {
      const status = checkToolStatus("bad_tool", true, undefined);

      expect(status.status).toBe(ToolStatus.INVALID_CONFIG);
      expect(status.isCallable).toBe(false);
      expect(status.message).toContain("apiKeyName is not defined");
    });
  });

  describe("ToolRegistry.getToolsStatus", () => {
    it("should return status for all registered tools", async () => {
      // 注册测试工具
      const mockTool: Tool = {
        name: "test_tool",
        description: "Test tool",
        inputSchema: { type: "object" },
        requiresApiKey: true,
        apiKeyName: "TEST_API_KEY",
        async execute() {
          return { success: true, data: "test" };
        },
      };

      registry.register(mockTool);

      const statusList = await registry.getToolsStatus();

      expect(statusList).toHaveLength(1);
      expect(statusList[0].name).toBe("test_tool");
      expect(statusList[0].isCallable).toBe(false);
      expect(statusList[0].status).toBe(ToolStatus.MISSING_CONFIG);
    });

    it("should return available for tools with API key set", async () => {
      apiKeyManager.setApiKey("test_tool", "api-key-xyz");

      const mockTool: Tool = {
        name: "test_tool",
        description: "Test tool",
        inputSchema: { type: "object" },
        requiresApiKey: true,
        apiKeyName: "TEST_API_KEY",
        async execute() {
          return { success: true, data: "test" };
        },
      };

      registry.register(mockTool);

      const statusList = await registry.getToolsStatus();

      expect(statusList[0].status).toBe(ToolStatus.AVAILABLE);
      expect(statusList[0].isCallable).toBe(true);
    });
  });

  describe("ToolRegistry.getCallableTools", () => {
    it("should filter out tools without API keys", async () => {
      // 注册两个工具：一个需要 key，一个不需要
      const toolWithKey: Tool = {
        name: "needs_key",
        description: "Tool with API key",
        inputSchema: { type: "object" },
        requiresApiKey: true,
        apiKeyName: "API_KEY",
        async execute() {
          return { success: true };
        },
      };

      const toolWithoutKey: Tool = {
        name: "no_key_needed",
        description: "Tool without API key",
        inputSchema: { type: "object" },
        async execute() {
          return { success: true };
        },
      };

      registry.registerAll([toolWithKey, toolWithoutKey]);

      const callableTools = await registry.getCallableTools();

      // 只有不需要 key 的工具应该被返回
      expect(callableTools).toHaveLength(1);
      expect(callableTools[0].name).toBe("no_key_needed");
    });

    it("should include tools when API key is set", async () => {
      apiKeyManager.setApiKey("needs_key", "secret-key");

      const toolWithKey: Tool = {
        name: "needs_key",
        description: "Tool with API key",
        inputSchema: { type: "object" },
        requiresApiKey: true,
        apiKeyName: "API_KEY",
        async execute() {
          return { success: true };
        },
      };

      registry.register(toolWithKey);

      const callableTools = await registry.getCallableTools();

      // 现在 key 已设置，工具应该可用
      expect(callableTools).toHaveLength(1);
      expect(callableTools[0].name).toBe("needs_key");
    });
  });

  describe("ToolRegistry.execute - Auto Skip", () => {
    it("should skip tool with missing config", async () => {
      let executeCalled = false;
      const mockTool: Tool = {
        name: "skippable_tool",
        description: "Tool that requires config",
        inputSchema: { type: "object" },
        requiresApiKey: true,
        apiKeyName: "MISSING_KEY",
        async execute() {
          executeCalled = true;
          return { success: true, data: "executed" };
        },
      };

      registry.register(mockTool);

      const toolCall: ToolCall = {
        name: "skippable_tool",
        arguments: { test: "value" },
      };

      const result = await registry.execute(toolCall);

      // 工具不应该被执行
      expect(executeCalled).toBe(false);

      // 应该返回错误结果
      expect(result.success).toBe(false);
      expect(result.error).toContain("Tool is not available");
      expect(result.error).toContain("MISSING_KEY");
    });

    it("should execute tool when config is present", async () => {
      apiKeyManager.setApiKey("executable_tool", "valid-key");

      let executeCalled = false;
      const mockTool: Tool = {
        name: "executable_tool",
        description: "Tool with config",
        inputSchema: { type: "object" },
        requiresApiKey: true,
        apiKeyName: "EXECUTABLE_KEY",
        async execute() {
          executeCalled = true;
          return { success: true, data: "executed" };
        },
      };

      registry.register(mockTool);

      const toolCall: ToolCall = {
        name: "executable_tool",
        arguments: { test: "value" },
      };

      const result = await registry.execute(toolCall);

      // 工具应该被执行
      expect(executeCalled).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data).toBe("executed");
    });

    it("should allow tools without API key requirement", async () => {
      let executeCalled = false;
      const mockTool: Tool = {
        name: "simple_tool",
        description: "Tool without API key",
        inputSchema: { type: "object" },
        async execute() {
          executeCalled = true;
          return { success: true, data: "no key needed" };
        },
      };

      registry.register(mockTool);

      const toolCall: ToolCall = {
        name: "simple_tool",
        arguments: {},
      };

      const result = await registry.execute(toolCall);

      // 工具应该正常执行
      expect(executeCalled).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data).toBe("no key needed");
    });
  });

  describe("ToolRegistry.executeAll - Batch Execution", () => {
    it("should skip unavailable tools and execute available ones", async () => {
      apiKeyManager.setApiKey("tool_a", "key-a");
      // tool_b 没有 key

      const toolA: Tool = {
        name: "tool_a",
        description: "Tool A with key",
        inputSchema: { type: "object" },
        requiresApiKey: true,
        apiKeyName: "TOOL_A_KEY",
        async execute() {
          return { success: true, data: "a executed" };
        },
      };

      const toolB: Tool = {
        name: "tool_b",
        description: "Tool B without key",
        inputSchema: { type: "object" },
        requiresApiKey: true,
        apiKeyName: "TOOL_B_KEY",
        async execute() {
          return { success: true, data: "b executed" };
        },
      };

      registry.registerAll([toolA, toolB]);

      const toolCalls: ToolCall[] = [
        { name: "tool_a", arguments: {} },
        { name: "tool_b", arguments: {} },
      ];

      const results = await registry.executeAll(toolCalls);

      // tool_a 应该成功
      expect(results[0].success).toBe(true);
      expect(results[0].data).toBe("a executed");

      // tool_b 应该被跳过
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain("Tool is not available");
    });
  });
});
