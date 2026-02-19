/**
 * 上下文文件加载器测试
 */

import { describe, it, expect } from "vitest";
import {
  loadContextFiles,
  loadSingleContextFile,
  getAvailableContextFiles,
} from "../../src/agent/core/context-loader";

describe("Context Loader", () => {
  describe("loadSingleContextFile", () => {
    it("should load SOUL.md if it exists", () => {
      const soulFile = loadSingleContextFile("/Users/zack/Desktop/Krebs", "SOUL.md");

      expect(soulFile).not.toBeNull();
      expect(soulFile?.path).toBe("SOUL.md");
      expect(soulFile?.content).toContain("Krebs AI Persona");
      expect(soulFile?.content).toContain("Friendly");
      expect(soulFile?.content).toContain("Precise");
    });

    it("should return null for non-existent file", () => {
      const result = loadSingleContextFile("/Users/zack/Desktop/Krebs", "NONEXISTENT.md");

      expect(result).toBeNull();
    });
  });

  describe("loadContextFiles", () => {
    it("should load all available context files", () => {
      const contextFiles = loadContextFiles("/Users/zack/Desktop/Krebs");

      // 至少应该有 SOUL.md
      expect(contextFiles.length).toBeGreaterThanOrEqual(1);

      // 检查是否包含 SOUL.md
      const soulFile = contextFiles.find(f => f.path === "SOUL.md");
      expect(soulFile).toBeDefined();
      expect(soulFile?.content).toContain("Krebs AI Persona");
    });

    it("should only load existing files", () => {
      const contextFiles = loadContextFiles("/Users/zack/Desktop/Krebs", [
        "SOUL.md",
        "NONEXISTENT.md",
        "README.md",
      ]);

      // 不应该包含不存在的文件
      expect(contextFiles.find(f => f.path === "NONEXISTENT.md")).toBeUndefined();

      // 应该包含 SOUL.md
      expect(contextFiles.find(f => f.path === "SOUL.md")).toBeDefined();
    });

    it("should return empty array when no files specified", () => {
      const contextFiles = loadContextFiles("/Users/zack/Desktop/Krebs", []);

      expect(contextFiles).toEqual([]);
    });
  });

  describe("getAvailableContextFiles", () => {
    it("should list all available context files", () => {
      const available = getAvailableContextFiles("/Users/zack/Desktop/Krebs");

      // 应该至少包含 SOUL.md
      expect(available).toContain("SOUL.md");
    });

    it("should not include non-existent files", () => {
      const available = getAvailableContextFiles("/Users/zack/Desktop/Krebs");

      // 所有列出的文件都应该存在
      for (const fileName of available) {
        const file = loadSingleContextFile("/Users/zack/Desktop/Krebs", fileName);
        expect(file).not.toBeNull();
      }
    });
  });
});
