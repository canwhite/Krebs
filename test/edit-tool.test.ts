/**
 * Edit 工具测试
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { editTool } from "../src/agent/tools/builtin.js";

const testDir = "./data/test-edit";
const testFile = path.join(testDir, "test.txt");

describe("Edit Tool", () => {
  beforeAll(async () => {
    // 创建测试目录
    await fs.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // 清理测试目录
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should replace first occurrence (default)", async () => {
    // 创建测试文件
    const content = "Hello World\nHello World\nHello World\n";
    await fs.writeFile(testFile, content, "utf-8");

    // 替换第一个 "Hello World"
    const result = await editTool.execute({
      path: testFile,
      oldString: "Hello World",
      newString: "Goodbye World",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("1 occurrence");

    // 验证结果
    const newContent = await fs.readFile(testFile, "utf-8");
    expect(newContent).toBe("Goodbye World\nHello World\nHello World\n");
  });

  it("should replace all occurrences when replaceAll=true", async () => {
    // 创建测试文件
    const content = "Hello World\nHello World\nHello World\n";
    await fs.writeFile(testFile, content, "utf-8");

    // 替换所有 "Hello World"
    const result = await editTool.execute({
      path: testFile,
      oldString: "Hello World",
      newString: "Goodbye World",
      replaceAll: true,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("3 occurrence");

    // 验证结果
    const newContent = await fs.readFile(testFile, "utf-8");
    expect(newContent).toBe("Goodbye World\nGoodbye World\nGoodbye World\n");
  });

  it("should fail if oldString not found", async () => {
    // 创建测试文件
    await fs.writeFile(testFile, "Hello World\n", "utf-8");

    // 尝试替换不存在的字符串
    const result = await editTool.execute({
      path: testFile,
      oldString: "Goodbye World",
      newString: "Something else",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Could not find the specified oldString");
  });

  it("should fail if file does not exist", async () => {
    const result = await editTool.execute({
      path: path.join(testDir, "nonexistent.txt"),
      oldString: "something",
      newString: "else",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("File not found");
  });

  it("should handle empty newString", async () => {
    // 创建测试文件
    await fs.writeFile(testFile, "Hello World\n", "utf-8");

    // 替换为空字符串（删除）
    const result = await editTool.execute({
      path: testFile,
      oldString: "World",
      newString: "",
    });

    expect(result.success).toBe(true);

    // 验证结果
    const newContent = await fs.readFile(testFile, "utf-8");
    expect(newContent).toBe("Hello \n");
  });

  it("should be case-sensitive", async () => {
    // 创建测试文件
    await fs.writeFile(testFile, "Hello world\n", "utf-8");

    // 尝试替换（大小写不匹配）
    const result = await editTool.execute({
      path: testFile,
      oldString: "hello world",
      newString: "Goodbye world",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Could not find the specified oldString");
  });

  it("should handle special characters", async () => {
    // 创建测试文件
    await fs.writeFile(testFile, "Line 1\nLine 2\nLine 3\n", "utf-8");

    // 替换换行符
    const result = await editTool.execute({
      path: testFile,
      oldString: "\n",
      newString: " | ",
      replaceAll: true,
    });

    expect(result.success).toBe(true);

    // 验证结果
    const newContent = await fs.readFile(testFile, "utf-8");
    expect(newContent).toBe("Line 1 | Line 2 | Line 3 | ");
  });

  it("should validate required parameters", async () => {
    // 缺少 path
    let result = await editTool.execute({
      oldString: "test",
      newString: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Path is required");

    // 缺少 oldString
    result = await editTool.execute({
      path: testFile,
      newString: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("oldString is required");

    // 缺少 newString
    result = await editTool.execute({
      path: testFile,
      oldString: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("newString is required");
  });
});
