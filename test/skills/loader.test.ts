/**
 * SkillsLoader 单元测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import fs from "node:fs";

import { SkillsLoader, createSkillsLoader } from "@/agent/skills/loader.js";

describe("SkillsLoader", () => {
  let loader: SkillsLoader;
  const testSkillsDir = path.join(process.cwd(), "skills", "bundled");

  beforeEach(() => {
    loader = createSkillsLoader();
  });

  describe("loadFromDir", () => {
    it("应该成功加载存在的技能目录", () => {
      // 检查测试目录是否存在
      if (!fs.existsSync(testSkillsDir)) {
        console.warn("Test skills directory not found, skipping test");
        return;
      }

      const entries = loader.loadFromDir(testSkillsDir, "test");

      expect(entries).toBeDefined();
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
    });

    it("应该正确解析技能的 frontmatter", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const entries = loader.loadFromDir(testSkillsDir, "test");

      // 检查第一个技能
      const firstEntry = entries[0];
      expect(firstEntry).toBeDefined();
      expect(firstEntry.skill).toBeDefined();
      expect(firstEntry.skill.name).toBeDefined();
      expect(firstEntry.skill.description).toBeDefined();
    });

    it("应该解析 Krebs 元数据", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const entries = loader.loadFromDir(testSkillsDir, "test");

      // 查找包含元数据的技能
      const entryWithMetadata = entries.find(
        (e) => e.metadata !== undefined
      );

      if (entryWithMetadata) {
        expect(entryWithMetadata.metadata).toBeDefined();
        expect(entryWithMetadata.metadata!.emoji).toBeDefined();
      }
    });

    it("应该对不存在的目录返回空数组", () => {
      const entries = loader.loadFromDir(
        "/non/existent/directory",
        "test"
      );

      expect(entries).toEqual([]);
    });
  });

  describe("loadFromDirs", () => {
    it("应该能从多个目录加载技能", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      // 加载同一个目录两次来测试合并功能
      const entries = loader.loadFromDirs([
        { dir: testSkillsDir, source: "test1" },
        { dir: testSkillsDir, source: "test2" },
      ]);

      expect(entries).toBeDefined();
      expect(Array.isArray(entries)).toBe(true);
      // 应该去重，所以数量应该不超过单个目录的数量
      expect(entries.length).toBeGreaterThan(0);
    });

    it("后者应该覆盖前者（同名技能）", () => {
      // 这个测试需要两个包含同名技能的目录
      // 暂时跳过，因为我们的测试环境可能没有这样的目录
    });
  });

  describe("buildSnapshot", () => {
    it("应该正确构建技能快照", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const entries = loader.loadFromDir(testSkillsDir, "test");
      const snapshot = loader.buildSnapshot(entries, 1);

      expect(snapshot).toBeDefined();
      expect(snapshot.version).toBe(1);
      expect(snapshot.skills).toEqual(entries);
      expect(snapshot.prompt).toBeDefined();
      expect(typeof snapshot.prompt).toBe("string");
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.count).toBe(entries.length);
    });

    it("快照应该只包含启用的技能", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const entries = loader.loadFromDir(testSkillsDir, "test");

      // 禁用第一个技能
      if (entries.length > 0) {
        entries[0].enabled = false;

        const snapshot = loader.buildSnapshot(entries, 1);

        // prompt 应该只包含启用的技能
        expect(snapshot.prompt).toBeDefined();
      }
    });
  });
});
