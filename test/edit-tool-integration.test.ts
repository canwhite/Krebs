/**
 * Edit 工具集成测试
 * 验证 edit 工具是否能被 Agent 正常调用
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { ToolRegistry } from "../src/agent/tools/registry.js";
import { getBuiltinTools } from "../src/agent/tools/builtin.js";
import { expandToolGroups } from "../src/agent/tools/groups.js";

const testDir = "./data/test-edit-integration";
const testFile = path.join(testDir, "test.txt");

describe("Edit Tool Integration", () => {
  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should be in builtin tools", () => {
    const builtinTools = getBuiltinTools();
    const toolNames = builtinTools.map((t) => t.name);

    expect(toolNames).toContain("edit_file");
  });

  it("should be in group:fs", () => {
    const fsTools = expandToolGroups(["group:fs"]);
    expect(fsTools).toContain("edit_file");
  });

  it("should be in group:builtin", () => {
    const builtinTools = expandToolGroups(["group:builtin"]);
    expect(builtinTools).toContain("edit_file");
  });

  it("should be registered in ToolRegistry", () => {
    const registry = new ToolRegistry();
    const builtinTools = getBuiltinTools();

    // 注册所有内置工具
    builtinTools.forEach((tool) => {
      registry.register(tool);
    });

    // 验证 edit_file 已注册
    const editTool = registry.get("edit_file");
    expect(editTool).toBeDefined();
    expect(editTool?.name).toBe("edit_file");
  });

  it("should be executable through ToolRegistry", async () => {
    const registry = new ToolRegistry();
    const builtinTools = getBuiltinTools();

    // 注册工具
    builtinTools.forEach((tool) => {
      registry.register(tool);
    });

    // 创建测试文件
    const content = "Hello World\nThis is a test\n";
    await fs.writeFile(testFile, content, "utf-8");

    // 通过注册表执行 edit_file
    const editTool = registry.get("edit_file");
    expect(editTool).toBeDefined();

    const result = await editTool!.execute({
      path: testFile,
      oldString: "Hello World",
      newString: "Goodbye World",
    });

    expect(result.success).toBe(true);

    // 验证文件已修改
    const newContent = await fs.readFile(testFile, "utf-8");
    expect(newContent).toContain("Goodbye World");
    expect(newContent).not.toContain("Hello World");
  });

  it("should have proper tool schema for LLM", () => {
    const builtinTools = getBuiltinTools();
    const editTool = builtinTools.find((t) => t.name === "edit_file");

    expect(editTool).toBeDefined();
    expect(editTool?.name).toBe("edit_file");
    expect(editTool?.description).toBeDefined();
    expect(editTool?.inputSchema).toBeDefined();

    // 验证 inputSchema 结构
    const schema = editTool!.inputSchema;
    expect(schema.type).toBe("object");
    expect(schema.properties).toBeDefined();
    expect(schema.properties?.path).toBeDefined();
    expect(schema.properties?.oldString).toBeDefined();
    expect(schema.properties?.newString).toBeDefined();
    expect(schema.properties?.replaceAll).toBeDefined();
    expect(schema.required).toEqual(["path", "oldString", "newString"]);
  });
});
