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

  /** 安装规范 */
  install?: SkillInstallSpec[];

  /** 其他自定义字段 */
  [key: string]: unknown;
}

/**
 * 技能安装规范
 */
export interface SkillInstallSpec {
  /** 安装类型 */
  kind: "brew" | "node" | "go" | "uv" | "download" | "python" | "ruby" | "cargo";

  /** 安装ID（可选） */
  id?: string;

  /** 标签/描述 */
  label?: string;

  /** 需要的二进制文件（用于检查是否已安装） */
  bins?: string[];

  /** 操作系统限制 */
  os?: string[];

  // ============ 通用参数 ============

  /** 目标目录（仅 download） */
  targetDir?: string;

  /** 是否解压（仅 download） */
  extract?: boolean;

  /** 归档类型（仅 download） */
  archive?: string;

  /** 解压时剥离的目录层级（仅 download） */
  stripComponents?: number;

  // ============ 特定类型的参数 ============

  /** Homebrew formula 名称（kind=brew） */
  formula?: string;

  /** npm 包名（kind=node） */
  npmPackage?: string;

  /** Go 模块路径（kind=go） */
  goModule?: string;

  /** UV 包名（kind=uv） */
  uvPackage?: string;

  /** Python 包名（kind=python 或 kind=uv） */
  pythonPackage?: string;

  /** Python 安装器类型（kind=python）: pip, pipx, poetry, uv */
  pythonInstaller?: "pip" | "pipx" | "poetry" | "uv";

  /** Ruby gem 包名（kind=ruby） */
  gemPackage?: string;

  /** Cargo crate 包名（kind=cargo） */
  cratePackage?: string;

  /** 下载 URL（kind=download） */
  url?: string;
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

/**
 * 技能安装结果
 */
export interface SkillInstallResult {
  /** 是否成功 */
  ok: boolean;

  /** 结果消息 */
  message: string;

  /** 标准输出 */
  stdout: string;

  /** 标准错误 */
  stderr: string;

  /** 退出码 */
  code: number | null;

  /** 安装ID */
  installId?: string;

  /** 安装的类型 */
  kind?: string;
}

/**
 * 技能安装请求
 */
export interface SkillInstallRequest {
  /** 技能名称 */
  skillName: string;

  /** 安装ID */
  installId: string;

  /** 超时时间（毫秒） */
  timeoutMs?: number;

  /** 是否为dry-run（仅检查不安装） */
  dryRun?: boolean;
}

/**
 * 技能安装状态
 */
export interface SkillInstallStatus {
  /** 技能名称 */
  skillName: string;

  /** 安装项列表 */
  items: Array<{
    installId: string;
    kind: string;
    installed: boolean;
    message?: string;
  }>;

  /** 全部已安装 */
  allInstalled: boolean;

  /** 最后检查时间 */
  lastCheck: number;
}

