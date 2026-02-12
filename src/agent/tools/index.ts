/**
 * 工具系统
 *
 * 导出所有工具相关的类型、类和函数
 */

// 类型定义
export type {
  Tool,
  ToolResult,
  ToolParameterSchema,
  ToolCall,
  ToolCallResult,
  LLMResponse,
  ToolConfig,
} from "./types.js";

// 工具状态系统
export { ToolStatus, checkToolStatus } from "./status.js";
export type { ToolStatusInfo, ToolConfigChecker } from "./status.js";

// 工具注册表
export { ToolRegistry, createToolRegistry, globalToolRegistry } from "./registry.js";

// 内置工具
export { bashTool, readTool, writeTool, editTool, getBuiltinTools } from "./builtin.js";

// Web 工具
export { webSearchTool, webFetchTool, getWebTools } from "./web.js";

// 工具分组
export {
  TOOL_GROUPS,
  TOOL_NAME_ALIASES,
  normalizeToolName,
  normalizeToolList,
  expandToolGroups,
  isToolInGroup,
  getToolGroups,
} from "./groups.js";

// 工具策略
export {
  resolveToolProfile,
  resolveToolPolicy,
  filterToolsByPolicy,
  isToolAllowed,
  describeToolPolicy,
  getAvailableProfiles,
  getProfileDetails,
} from "./policy.js";
export type { ToolProfileId, ToolPolicy } from "./policy.js";

// 平台适配器
export {
  // 基类
  BaseAdapter,
  AdapterRegistry,
  createAdapterRegistry,
  globalAdapterRegistry,

  // DeepSeek
  adaptToolForDeepSeek,
  adaptToolsForDeepSeek,
  validateDeepSeekToolDeclaration,
  createToolUsageExample,
  exportDeclarationsAsJSON,

  // OpenAI
  openaiAdapter,
  OpenAIAdapter,
  adaptToolForOpenAI,
  adaptToolsForOpenAI,

  // Anthropic
  anthropicAdapter,
  AnthropicAdapter,
  adaptToolForAnthropic,
  adaptToolsForAnthropic,
} from "./adapters/index.js";

// 类型导出
export type { GenericToolDeclaration } from "./adapters/base.js";
export type { OpenAIToolDeclaration } from "./adapters/openai.js";
export type { AnthropicToolDeclaration } from "./adapters/anthropic.js";
export type { DeepSeekToolDeclaration } from "./adapters/deepseek.js";
