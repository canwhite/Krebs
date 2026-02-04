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

// 工具注册表
export { ToolRegistry, createToolRegistry, globalToolRegistry } from "./registry.js";

// 内置工具
export { bashTool, readTool, writeTool, getBuiltinTools } from "./builtin.js";
