/**
 * SkillsManager 集成测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";

import { SkillsManager, createSkillsManager } from "@/agent/skills/skills-manager.js";

describe("SkillsManager", () => {
  let manager: SkillsManager;
  const testSkillsDir = path.join(process.cwd(), "skills", "bundled");

  beforeEach(async () => {
    // 检查测试目录是否存在
    if (!fs.existsSync(testSkillsDir)) {
      console.warn("Test skills directory not found");
      return;
    }

    manager = createSkillsManager({
      bundledSkillsDir: testSkillsDir,
      hotReload: false, // 测试时禁用热加载
    });

    await manager.loadSkills();
  });

  afterEach(async () => {
    if (manager) {
      await manager.cleanup();
    }
  });

  describe("loadSkills", () => {
    it("应该成功加载技能", async () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const snapshot = manager.getSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.count).toBeGreaterThan(0);
      expect(snapshot.version).toBeGreaterThan(0);
    });

    it("应该生成有效的 prompt", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const prompt = manager.buildSkillsPrompt();

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe("getSnapshot", () => {
    it("应该返回有效的快照", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const snapshot = manager.getSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.version).toBeDefined();
      expect(snapshot.skills).toBeDefined();
      expect(Array.isArray(snapshot.skills)).toBe(true);
      expect(snapshot.prompt).toBeDefined();
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.count).toBeDefined();
    });

    it("快照版本应该在加载后递增", async () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const version1 = manager.getSnapshot().version;
      await manager.reloadSkills();
      const version2 = manager.getSnapshot().version;

      expect(version2).toBe(version1 + 1);
    });
  });

  describe("getAllSkills", () => {
    it("应该返回所有技能", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const skills = manager.getAllSkills();

      expect(skills).toBeDefined();
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
    });

    it("每个技能应该有必要的字段", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const skills = manager.getAllSkills();

      for (const skill of skills) {
        expect(skill.skill).toBeDefined();
        expect(skill.skill.name).toBeDefined();
        expect(skill.skill.description).toBeDefined();
        expect(skill.frontmatter).toBeDefined();
      }
    });
  });

  describe("getSkillByName", () => {
    it("应该能找到存在的技能", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const skills = manager.getAllSkills();
      const firstName = skills[0].skill.name;

      const skill = manager.getSkillByName(firstName);

      expect(skill).toBeDefined();
      expect(skill!.skill.name).toBe(firstName);
    });

    it("对不存在的技能应该返回 undefined", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const skill = manager.getSkillByName("nonexistent-skill");

      expect(skill).toBeUndefined();
    });
  });

  describe("getStats", () => {
    it("应该返回有效的统计信息", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const stats = manager.getStats();

      expect(stats).toBeDefined();
      expect(stats.total).toBeDefined();
      expect(stats.enabled).toBeDefined();
      expect(stats.disabled).toBeDefined();
      expect(stats.byCategory).toBeDefined();
      expect(stats.snapshotVersion).toBeDefined();
      expect(stats.lastUpdate).toBeDefined();
    });

    it("统计数据应该正确", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const skills = manager.getAllSkills();
      const stats = manager.getStats();

      expect(stats.total).toBe(skills.length);

      const enabledCount = skills.filter((s) => s.enabled !== false).length;
      expect(stats.enabled).toBe(enabledCount);
    });
  });

  describe("searchSkills", () => {
    it("应该能搜索技能", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const skills = manager.getAllSkills();
      const searchTerm = skills[0].skill.name;

      const results = manager.searchSkills(searchTerm);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it("对不匹配的搜索应该返回空数组", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const results = manager.searchSkills("nonexistent-term");

      expect(results).toEqual([]);
    });
  });

  describe("enableSkill / disableSkill", () => {
    it("应该能禁用技能", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const skills = manager.getAllSkills();
      const firstName = skills[0].skill.name;

      const result = manager.disableSkill(firstName);

      expect(result).toBe(true);

      const skill = manager.getSkillByName(firstName);
      expect(skill!.enabled).toBe(false);
    });

    it("应该能启用技能", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const skills = manager.getAllSkills();
      const firstName = skills[0].skill.name;

      // 先禁用
      manager.disableSkill(firstName);

      // 再启用
      const result = manager.enableSkill(firstName);

      expect(result).toBe(true);

      const skill = manager.getSkillByName(firstName);
      expect(skill!.enabled).toBe(true);
    });

    it("对不存在的技能应该返回 false", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const result1 = manager.enableSkill("nonexistent");
      const result2 = manager.disableSkill("nonexistent");

      expect(result1).toBe(false);
      expect(result2).toBe(false);
    });
  });

  describe("buildSkillsPrompt", () => {
    it("应该成功构建 prompt", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const prompt = manager.buildSkillsPrompt();

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("应该支持自定义选项", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const prompt = manager.buildSkillsPrompt({
        title: "Test Skills",
        includeList: true,
      });

      expect(prompt).toContain("Test Skills");
    });
  });

  describe("getSkillNames", () => {
    it("应该返回所有技能名称", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const names = manager.getSkillNames();

      expect(names).toBeDefined();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(0);

      // 所有元素应该是字符串
      names.forEach((name) => {
        expect(typeof name).toBe("string");
      });
    });
  });

  describe("formatSkillDetail", () => {
    it("应该格式化技能详情", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const skills = manager.getAllSkills();
      const firstName = skills[0].skill.name;

      const detail = manager.formatSkillDetail(firstName);

      expect(detail).toBeDefined();
      expect(typeof detail).toBe("string");
      expect(detail!.length).toBeGreaterThan(0);
    });

    it("对不存在的技能应该返回 null", () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      const detail = manager.formatSkillDetail("nonexistent");

      // manager 的 formatSkillDetail 对不存在的技能返回 null
      expect(detail).toBeNull();
    });
  });

  describe("cleanup", () => {
    it("应该能清理资源", async () => {
      if (!fs.existsSync(testSkillsDir)) {
        return;
      }

      // 这个测试主要验证不会抛出错误
      await expect(manager.cleanup()).resolves.not.toThrow();
    });
  });
});
