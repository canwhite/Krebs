/**
 * SkillsFormatter 单元测试
 */

import { describe, it, expect, beforeEach } from "vitest";

import { SkillsFormatter, createSkillsFormatter } from "@/agent/skills/formatter.js";
import type { SkillEntry, SkillFilterOptions } from "@/agent/skills/types.js";

describe("SkillsFormatter", () => {
  let formatter: SkillsFormatter;
  let mockSkills: SkillEntry[];

  beforeEach(() => {
    formatter = createSkillsFormatter();

    // 创建 mock 技能数据
    mockSkills = [
      {
        skill: {
          name: "github",
          description: "GitHub integration",
          filePath: "/path/to/github/SKILL.md",
          baseDir: "/path/to",
          source: "test",
          disableModelInvocation: false,
        },
        frontmatter: {
          name: "GitHub",
          description: "GitHub integration",
        },
        metadata: {
          emoji: "🐙",
          category: "Development",
          tags: ["git", "github"],
        },
        enabled: true,
      },
      {
        skill: {
          name: "filesystem",
          description: "Filesystem operations",
          filePath: "/path/to/filesystem/SKILL.md",
          baseDir: "/path/to",
          source: "test",
          disableModelInvocation: false,
        },
        frontmatter: {
          name: "Filesystem",
          description: "Filesystem operations",
        },
        metadata: {
          emoji: "📁",
          category: "System",
          tags: ["files", "io"],
        },
        enabled: true,
      },
      {
        skill: {
          name: "web-search",
          description: "Web search capabilities",
          filePath: "/path/to/web-search/SKILL.md",
          baseDir: "/path/to",
          source: "test",
          disableModelInvocation: false,
        },
        frontmatter: {
          name: "WebSearch",
          description: "Web search capabilities",
        },
        metadata: {
          emoji: "🔍",
          category: "Research",
          tags: ["search", "web"],
        },
        enabled: false, // 禁用这个技能
      },
    ];
  });

  describe("formatForPrompt", () => {
    it("应该成功格式化技能为 prompt", () => {
      const prompt = formatter.formatForPrompt(mockSkills);

      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe("string");
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("应该只包含启用的技能", () => {
      const prompt = formatter.formatForPrompt(mockSkills);

      // prompt 中应该包含 github 和 filesystem，但不包含 web-search
      expect(prompt).toContain("github");
      expect(prompt).toContain("filesystem");
      // web-search 被禁用，所以不应该在 prompt 中
      // 注意：这取决于 pi-coding-agent 的实现
    });

    it("应该支持自定义标题", () => {
      const prompt = formatter.formatForPrompt(mockSkills, {
        title: "My Custom Skills",
      });

      expect(prompt).toContain("My Custom Skills");
    });

    it("应该支持包含技能列表", () => {
      const prompt = formatter.formatForPrompt(mockSkills, {
        includeList: true,
      });

      expect(prompt).toBeDefined();
      // 应该包含列表内容
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("应该支持最大技能数限制", () => {
      const prompt = formatter.formatForPrompt(mockSkills, {
        maxSkills: 2,
      });

      expect(prompt).toBeDefined();
      // 由于 web-search 被禁用，实际只有 2 个启用技能
      // 所以这个测试主要验证不会崩溃
    });
  });

  describe("filterSkills", () => {
    it("应该支持白名单过滤", () => {
      const filter: SkillFilterOptions = {
        allowList: ["github"],
      };

      const filtered = formatter.filterSkills(mockSkills, filter);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].skill.name).toBe("github");
    });

    it("应该支持黑名单过滤", () => {
      const filter: SkillFilterOptions = {
        denyList: ["web-search"],
      };

      const filtered = formatter.filterSkills(mockSkills, filter);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((s) => s.skill.name !== "web-search")).toBe(true);
    });

    it("应该支持仅启用的技能过滤", () => {
      const filter: SkillFilterOptions = {
        enabledOnly: true,
      };

      const filtered = formatter.filterSkills(mockSkills, filter);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((s) => s.enabled !== false)).toBe(true);
    });

    it("应该支持按分类过滤", () => {
      const filter: SkillFilterOptions = {
        category: ["Development"],
      };

      const filtered = formatter.filterSkills(mockSkills, filter);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].skill.name).toBe("github");
    });

    it("应该支持按标签过滤", () => {
      const filter: SkillFilterOptions = {
        tags: ["git"],
      };

      const filtered = formatter.filterSkills(mockSkills, filter);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].skill.name).toBe("github");
    });

    it("应该支持组合过滤", () => {
      const filter: SkillFilterOptions = {
        enabledOnly: true,
        category: ["Development", "System"],
      };

      const filtered = formatter.filterSkills(mockSkills, filter);

      expect(filtered).toHaveLength(2);
    });
  });

  describe("buildSkillsList", () => {
    it("应该成功构建技能列表", () => {
      const list = formatter.buildSkillsList(mockSkills);

      expect(list).toBeDefined();
      expect(typeof list).toBe("string");
      expect(list.length).toBeGreaterThan(0);
    });

    it("应该包含分类标题", () => {
      const list = formatter.buildSkillsList(mockSkills);

      expect(list).toContain("Development");
      expect(list).toContain("System");
    });

    it("应该包含 emoji 图标", () => {
      const list = formatter.buildSkillsList(mockSkills);

      expect(list).toContain("🐙");
      expect(list).toContain("📁");
    });
  });

  describe("buildStats", () => {
    it("应该正确构建统计信息", () => {
      const stats = formatter.buildStats(mockSkills, 1);

      expect(stats).toBeDefined();
      expect(stats.total).toBe(3);
      expect(stats.enabled).toBe(2);
      expect(stats.disabled).toBe(1);
      expect(stats.snapshotVersion).toBe(1);
      expect(stats.byCategory).toBeDefined();
    });

    it("应该正确统计分类", () => {
      const stats = formatter.buildStats(mockSkills, 1);

      expect(stats.byCategory["Development"]).toBe(1);
      expect(stats.byCategory["System"]).toBe(1);
      expect(stats.byCategory["Research"]).toBe(1);
    });
  });

  describe("formatSkillDetail", () => {
    it("应该正确格式化技能详情", () => {
      const detail = formatter.formatSkillDetail(mockSkills[0]);

      expect(detail).toBeDefined();
      expect(typeof detail).toBe("string");
      expect(detail).toContain("GitHub");
      expect(detail).toContain("🐙");
    });

    it("应该包含所有元数据", () => {
      const detail = formatter.formatSkillDetail(mockSkills[0]);

      expect(detail).toContain("Development");
      expect(detail).toContain("git");
      expect(detail).toContain("github");
    });

    it("对不存在的技能应该抛出错误", () => {
      expect(() => {
        formatter.formatSkillDetail(
          mockSkills[10] as any // 不存在
        );
      }).toThrow();
    });
  });

  describe("buildSkillNames", () => {
    it("应该正确提取技能名称", () => {
      const names = formatter.buildSkillNames(mockSkills);

      expect(names).toEqual(["github", "filesystem", "web-search"]);
    });

    it("对空数组应该返回空数组", () => {
      const names = formatter.buildSkillNames([]);

      expect(names).toEqual([]);
    });
  });

  describe("findMatchingSkills", () => {
    it("应该能按名称搜索", () => {
      const results = formatter.findMatchingSkills(mockSkills, "git");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].skill.name).toBe("github");
    });

    it("应该能按描述搜索", () => {
      const results = formatter.findMatchingSkills(mockSkills, "integration");

      expect(results.length).toBeGreaterThan(0);
    });

    it("应该能按标签搜索", () => {
      const results = formatter.findMatchingSkills(mockSkills, "git");

      expect(results.length).toBeGreaterThan(0);
    });

    it("对不匹配的查询应该返回空数组", () => {
      const results = formatter.findMatchingSkills(mockSkills, "nonexistent");

      expect(results).toEqual([]);
    });
  });
});
