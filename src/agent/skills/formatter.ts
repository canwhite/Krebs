/**
 * Skills Formatter
 *
 * 负责格式化技能为 Prompt 和其他输出格式
 * 使用 @mariozechner/pi-coding-agent 的 formatSkillsForPrompt
 */

import { formatSkillsForPrompt, type Skill } from "@mariozechner/pi-coding-agent";

import { createLogger } from "@/shared/logger.js";

import type {
  BuildPromptOptions,
  SkillEntry,
  SkillFilterOptions,
  SkillsStats,
} from "./types.js";

const logger = createLogger("SkillsFormatter");

/**
 * Skills Formatter 类
 */
export class SkillsFormatter {
  /**
   * 格式化技能为 Prompt
   * 使用 pi-coding-agent 的 formatSkillsForPrompt
   */
  formatForPrompt(entries: SkillEntry[], options?: BuildPromptOptions): string {
    try {
      // 应用过滤
      const filtered = options?.filter ? this.filterSkills(entries, options.filter) : entries;

      // 应用最大数量限制
      const limited =
        options && options.maxSkills && options.maxSkills > 0
          ? filtered.slice(0, options.maxSkills)
          : filtered;

      // 提取 Skill 对象
      const skills: Skill[] = limited.map((entry) => entry.skill);

      // 使用 pi-coding-agent 的 formatSkillsForPrompt
      let prompt = formatSkillsForPrompt(skills);

      // 添加自定义标题（如果提供）
      if (options?.title) {
        prompt = `## ${options.title}\n\n${prompt}`;
      }

      // 添加技能列表（如果要求）
      if (options?.includeList) {
        const list = this.buildSkillsList(limited);
        prompt = `${prompt}\n\n${list}`;
      }

      return prompt;
    } catch (error) {
      logger.error("Failed to format skills for prompt:", error);
      return "";
    }
  }

  /**
   * 过滤技能
   */
  filterSkills(entries: SkillEntry[], filter: SkillFilterOptions): SkillEntry[] {
    let result = [...entries];

    // 应用白名单
    if (filter.allowList && filter.allowList.length > 0) {
      result = result.filter((entry) => filter.allowList!.includes(entry.skill.name));
    }

    // 应用黑名单
    if (filter.denyList && filter.denyList.length > 0) {
      result = result.filter((entry) => !filter.denyList!.includes(entry.skill.name));
    }

    // 仅启用的技能
    if (filter.enabledOnly) {
      result = result.filter((entry) => entry.enabled !== false);
    }

    // 按分类过滤
    if (filter.category && filter.category.length > 0) {
      result = result.filter((entry) => {
        const cat = entry.metadata?.category;
        return cat ? filter.category!.includes(cat) : false;
      });
    }

    // 按标签过滤
    if (filter.tags && filter.tags.length > 0) {
      result = result.filter((entry) => {
        const tags = entry.metadata?.tags || [];
        return filter.tags!.some((tag) => tags.includes(tag));
      });
    }

    return result;
  }

  /**
   * 构建技能列表文本
   */
  buildSkillsList(entries: SkillEntry[]): string {
    if (entries.length === 0) {
      return "No skills available.";
    }

    const lines: string[] = ["### Available Skills", ""];

    // 按分类分组
    const grouped = this.groupByCategory(entries);

    for (const [category, skills] of Object.entries(grouped)) {
      lines.push(`#### ${category}`);
      lines.push("");

      for (const entry of skills) {
        const emoji = entry.metadata?.emoji || "🔧";
        const name = entry.skill.name;
        const desc = entry.skill.description;

        lines.push(`${emoji} **${name}**: ${desc}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * 按分类分组技能
   */
  private groupByCategory(entries: SkillEntry[]): Record<string, SkillEntry[]> {
    const grouped: Record<string, SkillEntry[]> = {};

    for (const entry of entries) {
      const category = entry.metadata?.category || "General";

      if (!grouped[category]) {
        grouped[category] = [];
      }

      grouped[category].push(entry);
    }

    return grouped;
  }

  /**
   * 构建技能统计信息
   */
  buildStats(entries: SkillEntry[], snapshotVersion: number): SkillsStats {
    const total = entries.length;
    const enabled = entries.filter((e) => e.enabled !== false).length;
    const disabled = total - enabled;

    // 按分类统计
    const byCategory: Record<string, number> = {};
    for (const entry of entries) {
      const category = entry.metadata?.category || "General";
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    return {
      total,
      enabled,
      disabled,
      byCategory,
      snapshotVersion,
      lastUpdate: Date.now(),
    };
  }

  /**
   * 格式化单个技能详情
   */
  formatSkillDetail(entry: SkillEntry): string {
    if (!entry) {
      throw new Error("Skill entry is required");
    }

    const lines: string[] = [];

    // 基本信息
    lines.push(`# ${entry.metadata?.emoji || ""} ${entry.skill.name}`);
    lines.push("");
    lines.push(entry.skill.description);
    lines.push("");

    // 元数据
    if (entry.metadata) {
      if (entry.metadata.category) {
        lines.push(`**Category**: ${entry.metadata.category}`);
      }
      if (entry.metadata.tags && entry.metadata.tags.length > 0) {
        lines.push(`**Tags**: ${entry.metadata.tags.join(", ")}`);
      }
      if (entry.metadata.homepage) {
        lines.push(`**Homepage**: ${entry.metadata.homepage}`);
      }
      lines.push("");
    }

    // 文件信息
    lines.push(`**File**: ${entry.skill.filePath}`);
    lines.push(`**Source**: ${entry.skill.source}`);
    lines.push(`**Enabled**: ${entry.enabled !== false ? "Yes" : "No"}`);
    lines.push("");

    // Frontmatter
    if (Object.keys(entry.frontmatter).length > 0) {
      lines.push("## Frontmatter");
      lines.push("```yaml");
      for (const [key, value] of Object.entries(entry.frontmatter)) {
        lines.push(`${key}: ${JSON.stringify(value)}`);
      }
      lines.push("```");
      lines.push("");
    }

    return lines.join("\n");
  }

  /**
   * 构建技能名称列表（用于自动完成等）
   */
  buildSkillNames(entries: SkillEntry[]): string[] {
    return entries.map((e) => e.skill.name);
  }

  /**
   * 查找匹配的技能
   */
  findMatchingSkills(entries: SkillEntry[], query: string): SkillEntry[] {
    const lowerQuery = query.toLowerCase();

    return entries.filter((entry) => {
      // 搜索名称
      if (entry.skill.name.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // 搜索描述
      if (entry.skill.description.toLowerCase().includes(lowerQuery)) {
        return true;
      }

      // 搜索标签
      if (entry.metadata?.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery))) {
        return true;
      }

      return false;
    });
  }
}

/**
 * 创建 SkillsFormatter 实例
 */
export function createSkillsFormatter(): SkillsFormatter {
  return new SkillsFormatter();
}
