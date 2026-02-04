/**
 * Skills 系统类型定义
 *
 * 基于 @mariozechner/pi-coding-agent 的 Skill 类型
 * 扩展 Krebs 特定的元数据和配置
 */

import type { Skill } from "@mariozechner/pi-coding-agent";

/**
 * 解析的 Frontmatter 数据
 */
export interface ParsedFrontmatter {
  /** 技能名称 */
  name?: string;

  /** 技能描述 */
  description?: string;

  /** 元数据（JSON 字符串） */
  metadata?: string;

  /** 其他自定义字段 */
  [key: string]: unknown;
}

/**
 * Krebs 特定的技能元数据（可选）
 */
export interface KrebsSkillMetadata {
  /** Emoji 图标 */
  emoji?: string;

  /** 技能分类 */
  category?: string;

  /** 标签 */
  tags?: string[];

  /** 主页链接 */
  homepage?: string;

  /** 依赖（保留用于未来迭代） */
  requires?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };

  /** 安装规范（保留用于未来迭代） */
  install?: Array<{
    kind: "brew" | "node" | "go" | "uv" | "download";
    label?: string;
    bins?: string[];
    os?: string[];
    formula?: string;
    package?: string;
    module?: string;
    url?: string;
  }>;
}

/**
 * 扩展的 Skill Entry
 *
 * 组合了 pi-coding-agent 的 Skill 和 Krebs 特定元数据
 */
export interface SkillEntry {
  /** pi-coding-agent 的 Skill 对象 */
  skill: Skill;

  /** 解析的 Frontmatter */
  frontmatter: ParsedFrontmatter;

  /** Krebs 特定的元数据 */
  metadata?: KrebsSkillMetadata;

  /** 是否启用 */
  enabled?: boolean;
}

/**
 * 技能快照
 *
 * 表示某一时刻的技能状态
 */
export interface SkillSnapshot {
  /** 快照版本号（每次更新递增） */
  version: number;

  /** 所有技能条目 */
  skills: SkillEntry[];

  /** 格式化的 Prompt */
  prompt: string;

  /** 快照时间戳 */
  timestamp: number;

  /** 技能总数 */
  count: number;
}

/**
 * 技能加载配置
 */
export interface SkillsConfig {
  /** 技能目录（Bundled Skills） */
  bundledSkillsDir: string;

  /** 是否启用热加载 */
  hotReload?: boolean;

  /** 热加载防抖时间（毫秒） */
  hotReloadDebounce?: number;

  /** 技能白名单（仅包含这些技能） */
  allowList?: string[];

  /** 技能黑名单（排除这些技能） */
  denyList?: string[];
}

/**
 * 技能过滤选项
 */
export interface SkillFilterOptions {
  /** 白名单 */
  allowList?: string[];

  /** 黑名单 */
  denyList?: string[];

  /** 仅启用的技能 */
  enabledOnly?: boolean;

  /** 按分类过滤 */
  category?: string[];

  /** 按标签过滤 */
  tags?: string[];
}

/**
 * Prompt 构建选项
 */
export interface BuildPromptOptions {
  /** 是否包含技能列表 */
  includeList?: boolean;

  /** 自定义标题 */
  title?: string;

  /** 过滤选项 */
  filter?: SkillFilterOptions;

  /** 最大技能数（0 = 不限制） */
  maxSkills?: number;
}

/**
 * 技能变更事件
 */
export interface SkillsChangeEvent {
  /** 事件类型 */
  type: "add" | "change" | "remove";

  /** 技能名称 */
  skillName: string;

  /** 文件路径 */
  filePath: string;

  /** 时间戳 */
  timestamp: number;
}

/**
 * 技能统计信息
 */
export interface SkillsStats {
  /** 总技能数 */
  total: number;

  /** 启用的技能数 */
  enabled: number;

  /** 禁用的技能数 */
  disabled: number;

  /** 按分类统计 */
  byCategory: Record<string, number>;

  /** 快照版本 */
  snapshotVersion: number;

  /** 最后更新时间 */
  lastUpdate: number;
}
