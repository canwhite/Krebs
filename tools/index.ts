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

