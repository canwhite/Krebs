/**
 * 自定义工具集合
 *
 * 集中管理所有可用的 tools，便于维护和扩展
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { luaExecTool } from "./lua-exec.js";

export interface ToolConfig {
  name: string;
  description: string;
  tool: ToolDefinition;
}

/**
 * 所有可用的 tools 列表
 *
 * 动态注册：通过 loadLuaToolDefinitions 加载的 Lua 工具会加入此数组
 */
export const TOOLS: ToolConfig[] = [
  {
    name: "lua_exec",
    description: "执行预注册的 Lua 脚本工具（fallback）",
    tool: luaExecTool,
  },
];

/**
 * 动态注册一个工具
 */
export function registerTool(definition: ToolDefinition): void {
  // 检查是否已存在
  const existingIndex = TOOLS.findIndex((t) => t.name === definition.name);
  if (existingIndex >= 0) {
    TOOLS[existingIndex] = {
      name: definition.name,
      description: definition.description,
      tool: definition,
    };
  } else {
    TOOLS.push({
      name: definition.name,
      description: definition.description,
      tool: definition,
    });
  }
}

/**
 * 根据 name 获取 tool 配置
 */
export function getToolByName(name: string): ToolConfig | undefined {
  return TOOLS.find((t) => t.name === name);
}

/**
 * 获取所有 tool 名称
 */
export function getToolNames(): string[] {
  return TOOLS.map((t) => t.name);
}

/**
 * 获取所有 tool 对象数组（用于 customTools）
 */
export function getToolObjects(): ToolDefinition[] {
  return TOOLS.map((t) => t.tool);
}
