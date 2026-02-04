/**
 * Skills Loader
 *
 * 负责从文件系统加载技能
 * 使用 @mariozechner/pi-coding-agent 的 loadSkillsFromDir
 */

import fs from "node:fs";
import path from "node:path";

import {
  loadSkillsFromDir,
  parseFrontmatter,
  formatSkillsForPrompt,
  type Skill,
} from "@mariozechner/pi-coding-agent";
import { parse } from "yaml";

import { createLogger } from "@/shared/logger.js";

import type {
  KrebsSkillMetadata,
  ParsedFrontmatter,
  SkillEntry,
  SkillInstallSpec,
  SkillSnapshot,
} from "./types.js";

const logger = createLogger("SkillsLoader");

/**
 * Skills Loader 类
 */
export class SkillsLoader {
  /**
   * 从目录加载技能
   */
  loadFromDir(dir: string, source: string = "bundled"): SkillEntry[] {
    try {
      // 检查目录是否存在
      if (!fs.existsSync(dir)) {
        logger.warn(`Skills directory not found: ${dir}`);
        return [];
      }

      // 使用 pi-coding-agent 的 loadSkillsFromDir
      const result = loadSkillsFromDir({ dir, source });

      if (result.diagnostics.length > 0) {
        logger.warn(`Loaded skills with ${result.diagnostics.length} diagnostics`);
        for (const diag of result.diagnostics) {
          logger.debug(`Diagnostic: ${diag.message}`);
        }
      }

      // 构建 SkillEntry[]
      const entries: SkillEntry[] = result.skills.map((skill) => this.buildSkillEntry(skill));

      logger.info(`Loaded ${entries.length} skills from ${dir}`);

      return entries;
    } catch (error) {
      logger.error(`Failed to load skills from ${dir}:`, error);
      return [];
    }
  }

  /**
   * 从多个目录加载技能（合并）
   * 后加载的技能会覆盖同名的先加载技能
   */
  loadFromDirs(dirs: Array<{ dir: string; source: string }>): SkillEntry[] {
    const merged = new Map<string, SkillEntry>();

    for (const { dir, source } of dirs) {
      const entries = this.loadFromDir(dir, source);
      for (const entry of entries) {
        // 使用 skill.name 作为唯一键，后者覆盖前者
        merged.set(entry.skill.name, entry);
      }
    }

    const result = Array.from(merged.values());
    logger.info(`Merged ${result.length} unique skills from ${dirs.length} directories`);

    return result;
  }

  /**
   * 构建 SkillEntry
   */
  private buildSkillEntry(skill: Skill): SkillEntry {
    // 读取并解析 Frontmatter
    let frontmatter: ParsedFrontmatter = {};
    let metadata: KrebsSkillMetadata | undefined;

    try {
      const content = fs.readFileSync(skill.filePath, "utf-8");
      const parsed = parseFrontmatter(content);

      // ParsedFrontmatter 类型兼容处理
      frontmatter = {
        ...parsed,
      } as ParsedFrontmatter;

      // 手动解析install字段（pi-coding-agent可能不包含自定义字段）
      const installSpecs = this.parseInstallFromYaml(content);
      if (installSpecs && installSpecs.length > 0) {
        frontmatter.install = installSpecs;
      }

      // 解析 Krebs 特定的元数据
      metadata = this.parseKrebsMetadata(parsed);
    } catch (error) {
      logger.debug(`Failed to parse frontmatter for ${skill.name}:`, error);
    }

    return {
      skill,
      frontmatter,
      metadata,
      enabled: true, // 默认启用
    };
  }

  /**
   * 从YAML frontmatter中解析install字段
   */
  private parseInstallFromYaml(content: string): SkillInstallSpec[] | undefined {
    try {
      // 提取frontmatter（---之间的内容）
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) return undefined;

      const yamlText = frontmatterMatch[1];
      const parsed = parse(yamlText) as Record<string, unknown>;

      if (!Array.isArray(parsed.install)) {
        return undefined;
      }

      return parsed.install as SkillInstallSpec[];
    } catch (error) {
      logger.debug("Failed to parse install field:", error);
      return undefined;
    }
  }

  /**
   * 解析 Krebs 特定的元数据
   */
  private parseKrebsMetadata(frontmatter: Record<string, unknown>): KrebsSkillMetadata | undefined {
    const metadataRaw = frontmatter.metadata;

    if (!metadataRaw || typeof metadataRaw !== "string") {
      return undefined;
    }

    try {
      // 解析 JSON 字符串
      const parsed = JSON.parse(metadataRaw) as Record<string, unknown>;

      // 提取 Krebs 特定字段
      const krebs = (parsed as Record<string, unknown>).krebs as Record<string, unknown> | undefined;

      if (!krebs) {
        return undefined;
      }

      return {
        emoji: typeof krebs.emoji === "string" ? krebs.emoji : undefined,
        category: typeof krebs.category === "string" ? krebs.category : undefined,
        tags: this.parseStringArray(krebs.tags),
        homepage: typeof krebs.homepage === "string" ? krebs.homepage : undefined,
        // 保留用于未来迭代的字段
        requires: this.parseRequires(krebs.requires),
      };
    } catch (error) {
      logger.debug(`Failed to parse Krebs metadata:`, error);
      return undefined;
    }
  }

  /**
   * 解析字符串数组
   */
  private parseStringArray(value: unknown): string[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) {
      return value.map((v) => String(v)).filter(Boolean);
    }
    if (typeof value === "string") {
      return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return undefined;
  }

  /**
   * 解析 requires 字段（预留）
   */
  private parseRequires(value: unknown): KrebsSkillMetadata["requires"] {
    if (!value || typeof value !== "object") {
      return undefined;
    }

    const obj = value as Record<string, unknown>;
    return {
      bins: this.parseStringArray(obj.bins),
      anyBins: this.parseStringArray(obj.anyBins),
      env: this.parseStringArray(obj.env),
      config: this.parseStringArray(obj.config),
    };
  }

  /**
   * 构建技能快照
   */
  buildSnapshot(entries: SkillEntry[], version: number = 1): SkillSnapshot {
    // 过滤启用的技能
    const enabled = entries.filter((e) => e.enabled !== false);

    // 使用 pi-coding-agent 的 formatSkillsForPrompt
    const skills = enabled.map((e) => e.skill);
    const prompt = this.formatSkillsForPrompt(skills);

    return {
      version,
      skills: entries,
      prompt,
      timestamp: Date.now(),
      count: entries.length,
    };
  }

  /**
   * 格式化技能为 Prompt
   * 使用 pi-coding-agent 的 formatSkillsForPrompt
   */
  private formatSkillsForPrompt(skills: Skill[]): string {
    try {
      // 动态导入以支持ESM
      return formatSkillsForPrompt(skills);
    } catch (error) {
      logger.error("Failed to format skills for prompt:", error);
      return "";
    }
  }

  /**
   * 重新加载单个技能
   */
  reloadSkill(filePath: string): SkillEntry | null {
    try {
      // 使用 pi-coding-agent 重新加载该文件
      const dir = path.dirname(filePath);
      const result = loadSkillsFromDir({ dir, source: "reload" });

      const skill = result.skills.find((s) => s.filePath === filePath);
      if (!skill) {
        logger.warn(`Skill not found after reload: ${filePath}`);
        return null;
      }

      const entry = this.buildSkillEntry(skill);
      logger.info(`Reloaded skill: ${entry.skill.name}`);

      return entry;
    } catch (error) {
      logger.error(`Failed to reload skill ${filePath}:`, error);
      return null;
    }
  }
}

/**
 * 创建 SkillsLoader 实例
 */
export function createSkillsLoader(): SkillsLoader {
  return new SkillsLoader();
}
