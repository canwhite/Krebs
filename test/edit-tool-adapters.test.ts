/**
 * Edit 工具适配器测试
 * 验证 edit 工具在不同 provider 下的适配
 */

import { describe, it, expect } from "vitest";
import { getBuiltinTools } from "../src/agent/tools/builtin.js";
import {
  adaptToolForOpenAI,
  adaptToolsForAnthropic,
  adaptToolForDeepSeek,
} from "../src/agent/tools/adapters/index.js";

describe("Edit Tool Adapters", () => {
  const builtinTools = getBuiltinTools();
  const editTool = builtinTools.find((t) => t.name === "edit_file");

  it("should adapt for OpenAI", () => {
    expect(editTool).toBeDefined();

    const adapted = adaptToolForOpenAI(editTool!);

    expect(adapted.type).toBe("function");
    expect(adapted.function.name).toBe("edit_file");
    expect(adapted.function.description).toBeDefined();
    expect(adapted.function.parameters).toBeDefined();
    expect(adapted.function.parameters.type).toBe("object");

    // 验证参数
    const params = adapted.function.parameters;
    expect(params.properties?.path).toBeDefined();
    expect(params.properties?.oldString).toBeDefined();
    expect(params.properties?.newString).toBeDefined();
    expect(params.required).toEqual(["path", "oldString", "newString"]);
  });

  it("should adapt for Anthropic", () => {
    expect(editTool).toBeDefined();

    const adapted = adaptToolsForAnthropic([editTool!]);
    expect(adapted).toHaveLength(1);

    const tool = adapted[0];
    expect(tool.name).toBe("edit_file");
    expect(tool.description).toBeDefined();
    expect(tool.input_schema).toBeDefined();

    // 验证 input_schema
    const schema = tool.input_schema;
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
    expect(schema.properties?.path).toBeDefined();
    expect(schema.properties?.oldString).toBeDefined();
    expect(schema.properties?.newString).toBeDefined();
    expect(schema.required).toEqual(["path", "oldString", "newString"]);
  });

  it("should adapt for DeepSeek", () => {
    expect(editTool).toBeDefined();

    const adapted = adaptToolForDeepSeek(editTool!);

    expect(adapted.type).toBe("function");
    expect(adapted.function).toBeDefined();
    expect(adapted.function.name).toBe("edit_file");
    expect(adapted.function.description).toBeDefined();
    expect(adapted.function.parameters).toBeDefined();

    // 验证参数
    const params = adapted.function.parameters;
    expect(params.type).toBe("object");
    expect(params.properties?.path).toBeDefined();
    expect(params.properties?.oldString).toBeDefined();
    expect(params.properties?.newString).toBeDefined();
    expect(params.required).toEqual(["path", "oldString", "newString"]);
  });
});
