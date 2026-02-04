/**
 * Skills 系统
 *
 * 导出所有 Skills 相关的类型、类和工厂函数
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

// 旧的技能系统（保留向后兼容）
export { SkillRegistry, createSkillRegistry } from "./base.js";
export type { Skill, SkillResult } from "./base.js";
export { getBuiltinSkills } from "./builtin.js";
