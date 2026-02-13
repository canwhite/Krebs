/**
 * Skills 系统
 *
 * 导出所有 Skills 相关的类型、类和工厂函数
 *
 * 注意：旧的 Skills 系统（基于 trigger）已移除
 * 新的 Skills 系统基于 pi-coding-agent
 */

// 类型定义
export type {
  ParsedFrontmatter,
  KrebsSkillMetadata,
  SkillEntry,
  SkillSnapshot,
  SkillsConfig,
  SkillFilterOptions,
  BuildPromptOptions,
  SkillsChangeEvent,
  SkillsStats,
  SkillInstallSpec,
  SkillInstallResult,
  SkillInstallRequest,
  SkillInstallStatus,
} from "./types.js";

// Facade 层（主要对外接口）
export {
  SkillsManager,
  createSkillsManager,
  createDefaultSkillsManager,
} from "./skills-manager.js";

// 核心模块（如果需要直接使用）
export {
  SkillsLoader,
  createSkillsLoader,
} from "./loader.js";

export {
  SkillsFormatter,
  createSkillsFormatter,
} from "./formatter.js";

export {
  SkillsHotReload,
  createSkillsHotReload,
} from "./hot-reload.js";

// 安装器
export {
  SkillInstaller,
  getSkillInstaller,
} from "./installer.js";
