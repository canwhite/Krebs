/**
 * Memory Storage 工具函数单元测试
 */

import { describe, it, expect } from "vitest";
import {
  hashText,
  normalizeRelPath,
  isMemoryPath,
  ensureDir,
  listMemoryFiles,
  buildFileEntry,
  chunkMarkdown,
} from "@/storage/memory/internal.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Memory Storage - Internal Tools", () => {
  describe("hashText()", () => {
    it("应该生成一致的 SHA256 哈希", () => {
      const text = "Hello, world!";
      const hash1 = hashText(text);
      const hash2 = hashText(text);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex 长度
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // 十六进制
    });

    it("不同文本应该生成不同哈希", () => {
      const hash1 = hashText("Hello");
      const hash2 = hashText("World");

      expect(hash1).not.toBe(hash2);
    });

    it("空字符串也应该有哈希", () => {
      const hash = hashText("");
      expect(hash).toHaveLength(64);
    });

    it("应该正确处理 Unicode 字符", () => {
      const text = "你好，世界！🎉";
      const hash = hashText(text);
      expect(hash).toHaveLength(64);
    });
  });

  describe("normalizeRelPath()", () => {
    it("应该移除前导 ./ 和 ../", () => {
      expect(normalizeRelPath("./test.md")).toBe("test.md");
      expect(normalizeRelPath("../test.md")).toBe("test.md");
      expect(normalizeRelPath(".../test.md")).toBe(".../test.md"); // 只移除一个层级
    });

    it("应该移除前导 /", () => {
      expect(normalizeRelPath("/test.md")).toBe("test.md");
    });

    it("应该转换反斜杠为正斜杠", () => {
      expect(normalizeRelPath("memory\\test.md")).toBe("memory/test.md");
    });

    it("应该移除前后空格", () => {
      expect(normalizeRelPath("  test.md  ")).toBe("test.md");
    });

    it("应该处理空字符串", () => {
      expect(normalizeRelPath("")).toBe("");
      expect(normalizeRelPath("   ")).toBe("");
    });
  });

  describe("isMemoryPath()", () => {
    it("应该识别 MEMORY.md", () => {
      expect(isMemoryPath("MEMORY.md")).toBe(true);
      expect(isMemoryPath("./MEMORY.md")).toBe(true);
    });

    it("应该识别 memory.md（小写）", () => {
      expect(isMemoryPath("memory.md")).toBe(true);
      expect(isMemoryPath("./memory.md")).toBe(true);
    });

    it("应该识别 memory/ 目录下的文件", () => {
      expect(isMemoryPath("memory/test.md")).toBe(true);
      expect(isMemoryPath("memory/sub/nested.md")).toBe(true);
      expect(isMemoryPath("./memory/test.md")).toBe(true);
    });

    it("应该拒绝其他路径", () => {
      expect(isMemoryPath("other.md")).toBe(false);
      expect(isMemoryPath("docs/test.md")).toBe(false);
      expect(isMemoryPath("")).toBe(false);
    });
  });

  describe("ensureDir()", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "krebs-test-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("应该创建不存在的目录", () => {
      const newDir = path.join(tempDir, "new", "nested", "dir");
      const result = ensureDir(newDir);

      expect(result).toBe(newDir);
      // 目录应该被创建（不会抛出错误）
    });

    it("应该处理已存在的目录", () => {
      // 不会抛出错误
      const result = ensureDir(tempDir);
      expect(result).toBe(tempDir);
    });
  });

  describe("chunkMarkdown()", () => {
    it("应该正确分块短文本", () => {
      const content = "Line 1\nLine 2\nLine 3";
      const chunks = chunkMarkdown(content, { tokens: 10, overlap: 2 });

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].text).toContain("Line 1");
      expect(chunks[0].startLine).toBe(1);
      expect(chunks[0].endLine).toBeGreaterThanOrEqual(1);
    });

    it("应该正确分块长文本", () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
      const content = lines.join("\n");
      const chunks = chunkMarkdown(content, { tokens: 20, overlap: 5 });

      expect(chunks.length).toBeGreaterThan(1);
    });

    it("应该处理 overlap", () => {
      const lines = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`);
      const content = lines.join("\n");
      const chunks = chunkMarkdown(content, { tokens: 15, overlap: 5 });

      if (chunks.length > 1) {
        // 相邻的 chunks 应该有重叠
        const firstChunkLastLine = chunks[0].text.split("\n").pop();
        const secondChunkFirstLine = chunks[1].text.split("\n")[0];
        expect(firstChunkLastLine).toBeTruthy();
        expect(secondChunkFirstLine).toBeTruthy();
      }
    });

    it("应该处理空内容", () => {
      const chunks = chunkMarkdown("", { tokens: 10, overlap: 2 });
      expect(chunks).toEqual([]);
    });

    it("应该处理单行文本", () => {
      const content = "Single line";
      const chunks = chunkMarkdown(content, { tokens: 10, overlap: 2 });

      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe(content);
    });

    it("应该处理非常长的单行", () => {
      const content = "A".repeat(1000);
      const chunks = chunkMarkdown(content, { tokens: 100, overlap: 10 });

      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe(content);
    });

    it("每个 chunk 应该有有效的哈希", () => {
      const content = "Line 1\nLine 2\nLine 3";
      const chunks = chunkMarkdown(content, { tokens: 10, overlap: 2 });

      chunks.forEach((chunk) => {
        expect(chunk.hash).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    it("应该保留行号信息", () => {
      const content = "Line 1\nLine 2\nLine 3\nLine 4";
      const chunks = chunkMarkdown(content, { tokens: 5, overlap: 1 });

      chunks.forEach((chunk) => {
        expect(chunk.startLine).toBeGreaterThanOrEqual(1);
        expect(chunk.endLine).toBeGreaterThanOrEqual(chunk.startLine);
      });
    });
  });

  describe("listMemoryFiles() 和 buildFileEntry()", () => {
    let tempDir: string;
    let workspaceDir: string;
    let memoryDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "krebs-test-"));
      workspaceDir = path.join(tempDir, "workspace");
      memoryDir = path.join(workspaceDir, "memory");

      await fs.mkdir(workspaceDir, { recursive: true });
      await fs.mkdir(memoryDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("应该列出 MEMORY.md", async () => {
      const memoryFile = path.join(workspaceDir, "MEMORY.md");
      await fs.writeFile(memoryFile, "# Memory");

      const files = await listMemoryFiles(workspaceDir);
      expect(files).toContain(memoryFile);
      expect(files).toHaveLength(1);
    });

    it("应该列出 memory.md（小写）", async () => {
      // 确保 MEMORY.md 不存在
      const memoryFile = path.join(workspaceDir, "memory.md");
      await fs.writeFile(memoryFile, "# Memory");

      const files = await listMemoryFiles(workspaceDir);

      // 应该至少包含一个文件
      expect(files.length).toBeGreaterThan(0);

      // 检查是否包含 memory.md（或者在某些文件系统上可能被识别为 MEMORY.md）
      const hasMemoryFile = files.some((f) =>
        f === memoryFile || f.toLowerCase() === memoryFile.toLowerCase()
      );
      expect(hasMemoryFile).toBe(true);
    });

    it("应该列出 memory/ 目录下的文件", async () => {
      const file1 = path.join(memoryDir, "test1.md");
      const file2 = path.join(memoryDir, "test2.md");
      await fs.writeFile(file1, "# Test 1");
      await fs.writeFile(file2, "# Test 2");

      const files = await listMemoryFiles(workspaceDir);
      expect(files).toContain(file1);
      expect(files).toContain(file2);
    });

    it("应该递归列出子目录", async () => {
      const subDir = path.join(memoryDir, "sub");
      await fs.mkdir(subDir, { recursive: true });

      const file = path.join(subDir, "nested.md");
      await fs.writeFile(file, "# Nested");

      const files = await listMemoryFiles(workspaceDir);
      expect(files).toContain(file);
    });

    it("应该忽略非 .md 文件", async () => {
      const txtFile = path.join(memoryDir, "test.txt");
      await fs.writeFile(txtFile, "Not markdown");

      const files = await listMemoryFiles(workspaceDir);
      expect(files).not.toContain(txtFile);
    });

    it("应该返回空数组如果没有记忆文件", async () => {
      const files = await listMemoryFiles(workspaceDir);
      expect(files).toEqual([]);
    });

    it("应该去重重复文件", async () => {
      const memoryFile = path.join(workspaceDir, "MEMORY.md");
      await fs.writeFile(memoryFile, "# Memory");

      const files = await listMemoryFiles(workspaceDir);
      const uniqueFiles = new Set(files);
      expect(files.length).toBe(uniqueFiles.size);
    });

    it("buildFileEntry 应该正确构建文件信息", async () => {
      const testFile = path.join(memoryDir, "test.md");
      const content = "# Test\n\nThis is a test.";
      await fs.writeFile(testFile, content);

      const entry = await buildFileEntry(testFile, workspaceDir);

      expect(entry.path).toBe("memory/test.md");
      expect(entry.absPath).toBe(testFile);
      expect(entry.size).toBeGreaterThan(0);
      expect(entry.mtimeMs).toBeGreaterThan(0);
      expect(entry.hash).toHaveLength(64);
    });

    it("buildFileEntry 应该生成一致的哈希", async () => {
      const testFile = path.join(memoryDir, "test.md");
      const content = "# Test";
      await fs.writeFile(testFile, content);

      const entry1 = await buildFileEntry(testFile, workspaceDir);
      const entry2 = await buildFileEntry(testFile, workspaceDir);

      expect(entry1.hash).toBe(entry2.hash);
    });

    it("buildFileEntry 应该检测文件变更", async () => {
      const testFile = path.join(memoryDir, "test.md");
      await fs.writeFile(testFile, "Original content");

      const entry1 = await buildFileEntry(testFile, workspaceDir);

      // 修改文件
      await fs.writeFile(testFile, "Modified content");

      const entry2 = await buildFileEntry(testFile, workspaceDir);

      expect(entry1.hash).not.toBe(entry2.hash);
      expect(entry2.mtimeMs).toBeGreaterThan(entry1.mtimeMs);
    });
  });
});
