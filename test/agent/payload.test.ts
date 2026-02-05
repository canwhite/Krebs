/**
 * Payload 系统测试
 *
 * 测试目标：
 * 1. 验证文本 Payload 创建
 * 2. 验证工具结果 Payload 创建
 * 3. 验证回复指令解析（@reply、@final、@silent）
 * 4. 验证 Payload 列表构建
 * 5. 验证回复模式应用
 */

import { describe, it, expect } from "vitest";
import {
  parseDirectives,
  createTextPayload,
  createToolResultPayload,
  buildToolResultPayloads,
  buildPayloads,
  applyReplyMode,
  formatToolResult,
  type TextPayload,
  type ToolResultPayload,
} from "@/agent/payload/index.js";

describe("Payload - 回复指令解析", () => {
  it("应该解析 @reply 指令", () => {
    const text = "Hello @reply:user123, how are you?";
    const result = parseDirectives(text);

    expect(result.replyTo).toBe("user123");
    expect(result.final).toBe(false);
    expect(result.silent).toBe(false);
    expect(result.cleanText).toBe("Hello , how are you?");
  });

  it("应该解析 @final 指令", () => {
    const text = "This is the final answer @final";
    const result = parseDirectives(text);

    expect(result.final).toBe(true);
    expect(result.cleanText).toBe("This is the final answer");
  });

  it("应该解析 @silent 指令", () => {
    const text = "@silent Internal processing...";
    const result = parseDirectives(text);

    expect(result.silent).toBe(true);
    expect(result.cleanText).toBe("Internal processing...");
  });

  it("应该解析多个指令", () => {
    const text = "Done @reply:user456 @final";
    const result = parseDirectives(text);

    expect(result.replyTo).toBe("user456");
    expect(result.final).toBe(true);
    expect(result.cleanText).toBe("Done");
  });

  it("应该处理没有指令的文本", () => {
    const text = "Just normal text";
    const result = parseDirectives(text);

    expect(result.replyTo).toBeUndefined();
    expect(result.final).toBe(false);
    expect(result.silent).toBe(false);
    expect(result.cleanText).toBe("Just normal text");
  });
});

describe("Payload - 文本 Payload 创建", () => {
  it("应该创建基础文本 Payload", () => {
    const payload = createTextPayload("Hello, world!");

    expect(payload.kind).toBe("text");
    expect(payload.text).toBe("Hello, world!");
    expect(payload.timestamp).toBeDefined();
  });

  it("应该解析并应用指令", () => {
    const payload = createTextPayload("Processing @silent");

    expect(payload.kind).toBe("text");
    expect(payload.silent).toBe(true);
    expect(payload.text).toBe("Processing");
  });

  it("应该支持 @reply 指令", () => {
    const payload = createTextPayload("Check this out @reply:alice");

    expect(payload.replyTo).toBe("alice");
    expect(payload.text).toBe("Check this out");
  });

  it("应该支持 @final 指令", () => {
    const payload = createTextPayload("Final result @final");

    expect(payload.final).toBe(true);
    expect(payload.text).toBe("Final result");
  });
});

describe("Payload - 工具结果 Payload 创建", () => {
  it("应该创建成功的工具结果", () => {
    const payload = createToolResultPayload(
      "call_123",
      "search",
      { results: ["item1", "item2"] }
    );

    expect(payload.kind).toBe("tool_result");
    expect(payload.toolCallId).toBe("call_123");
    expect(payload.toolName).toBe("search");
    expect(payload.result).toEqual({ results: ["item1", "item2"] });
    expect(payload.success).toBe(true);
    expect(payload.error).toBeUndefined();
  });

  it("应该创建失败的工具结果", () => {
    const payload = createToolResultPayload(
      "call_456",
      "calculate",
      null,
      false,
      "Division by zero"
    );

    expect(payload.kind).toBe("tool_result");
    expect(payload.success).toBe(false);
    expect(payload.error).toBe("Division by zero");
  });

  it("应该从工具调用结果批量创建 Payload", () => {
    const toolResults = [
      { id: "call_1", name: "search", result: { data: "result1" } },
      { id: "call_2", name: "calculate", result: { value: 42 } },
    ];

    const payloads = buildToolResultPayloads(toolResults);

    expect(payloads).toHaveLength(2);
    expect(payloads[0].kind).toBe("tool_result");
    expect(payloads[0].toolName).toBe("search");
    expect(payloads[1].kind).toBe("tool_result");
    expect(payloads[1].toolName).toBe("calculate");
  });
});

describe("Payload - Payload 列表构建", () => {
  it("应该只构建文本 Payload", () => {
    const payloads = buildPayloads({
      content: "Hello, world!",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0].kind).toBe("text");
    expect((payloads[0] as TextPayload).text).toBe("Hello, world!");
  });

  it("应该只构建工具结果 Payload", () => {
    const toolResults = [
      { id: "call_1", name: "search", result: { data: "result1" } },
    ];

    const payloads = buildPayloads({ toolResults });

    expect(payloads).toHaveLength(1);
    expect(payloads[0].kind).toBe("tool_result");
  });

  it("应该构建混合 Payload 列表", () => {
    const toolResults = [
      { id: "call_1", name: "search", result: { data: "result1" } },
    ];

    const payloads = buildPayloads({
      content: "I searched for you",
      toolResults,
    });

    expect(payloads).toHaveLength(2);
    expect(payloads[0].kind).toBe("text");
    expect(payloads[1].kind).toBe("tool_result");
  });

  it("应该过滤静默消息", () => {
    const payloads = buildPayloads(
      {
        content: "Visible @silent Hidden",
      },
      { filterSilent: true }
    );

    expect(payloads).toHaveLength(1);
    expect(payloads[0].kind).toBe("text");
    expect((payloads[0] as TextPayload).text).toBe("Visible Hidden");
  });

  it("应该包含静默消息（不过滤）", () => {
    const payloads = buildPayloads(
      {
        content: "Visible @silent Hidden",
      },
      { filterSilent: false }
    );

    expect(payloads).toHaveLength(1);
    expect(payloads[0].kind).toBe("text");
    expect((payloads[0] as TextPayload).silent).toBe(true);
  });
});

describe("Payload - 回复模式应用", () => {
  it("应该返回所有 Payload（all 模式）", () => {
    const payloads: any[] = [
      { kind: "text", text: "First" },
      { kind: "tool_result", toolName: "search" },
      { kind: "text", text: "Second" },
    ];

    const result = applyReplyMode(payloads, "all");

    expect(result).toHaveLength(3);
  });

  it("应该只返回 final Payload（final_only 模式）", () => {
    const payloads: any[] = [
      { kind: "text", text: "First", final: false },
      { kind: "tool_result", toolName: "search" },
      { kind: "text", text: "Final answer", final: true },
    ];

    const result = applyReplyMode(payloads, "final_only");

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Final answer");
  });

  it("没有 final 时返回所有文本（final_only 模式）", () => {
    const payloads: any[] = [
      { kind: "text", text: "First" },
      { kind: "tool_result", toolName: "search" },
      { kind: "text", text: "Second" },
    ];

    const result = applyReplyMode(payloads, "final_only");

    // 返回所有文本，不包括工具结果
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.kind === "text")).toBe(true);
  });
});

describe("Payload - 工具结果格式化", () => {
  it("应该格式化为 JSON", () => {
    const payload: ToolResultPayload = {
      kind: "tool_result",
      toolCallId: "call_1",
      toolName: "search",
      result: { query: "test", count: 5 },
    };

    const formatted = formatToolResult(payload, "json");

    expect(formatted).toBe(JSON.stringify({ query: "test", count: 5 }, null, 2));
  });

  it("应该格式化为 Markdown", () => {
    const payload: ToolResultPayload = {
      kind: "tool_result",
      toolCallId: "call_1",
      toolName: "search",
      result: { query: "test", count: 5 },
    };

    const formatted = formatToolResult(payload, "markdown");

    expect(formatted).toContain("**Tool:** search");
    expect(formatted).toContain("```");
    expect(formatted).toContain('"query": "test"');
  });

  it("应该格式化为纯文本", () => {
    const payload: ToolResultPayload = {
      kind: "tool_result",
      toolCallId: "call_1",
      toolName: "search",
      result: { query: "test", count: 5 },
    };

    const formatted = formatToolResult(payload, "plain");

    expect(formatted).toMatch(/\[search\]/);
    expect(formatted).toContain("test");
  });
});

describe("Payload - 集成测试", () => {
  it("应该处理完整的 Agent 响应", () => {
    // 模拟 Agent 返回的工具结果
    const toolResults = [
      {
        id: "call_1",
        name: "get_weather",
        result: { city: "Beijing", temp: 25, condition: "sunny" },
      },
    ];

    // 构建完整的 Payload 列表
    const payloads = buildPayloads({
      content: "The weather in Beijing is sunny @final",
      toolResults,
      options: {
        toolResultFormat: "json",
        includeDirectives: true,
        filterSilent: true,
      },
    });

    // 验证
    expect(payloads).toHaveLength(2);

    const textPayload = payloads[0] as TextPayload;
    expect(textPayload.kind).toBe("text");
    expect(textPayload.final).toBe(true);
    expect(textPayload.text).toBe("The weather in Beijing is sunny");

    const toolPayload = payloads[1] as ToolResultPayload;
    expect(toolPayload.kind).toBe("tool_result");
    expect(toolPayload.toolName).toBe("get_weather");
    expect(toolPayload.result).toEqual({
      city: "Beijing",
      temp: 25,
      condition: "sunny",
    });
  });

  it("应该处理多工具调用和文本混合", () => {
    const toolResults = [
      { id: "call_1", name: "search", result: { items: ["A", "B"] } },
      { id: "call_2", name: "calculate", result: { value: 42 } },
    ];

    const payloads = buildPayloads({
      content: "I've searched and calculated for you",
      toolResults,
    });

    expect(payloads).toHaveLength(3);

    // 第一条是文本
    expect(payloads[0].kind).toBe("text");

    // 后面是工具结果
    expect(payloads[1].kind).toBe("tool_result");
    expect(payloads[2].kind).toBe("tool_result");
  });
});
