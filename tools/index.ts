/**
 * 自定义工具集合
 *
 * 集中管理所有可用的 tools，便于维护和扩展
 */

import { getCurrentTimeTool } from "./get-current-time.js";
// import { writeFileTool } from "./write-file.js";

export interface ToolConfig {
  name: string;
  description: string;
  tool: any;
}

/**
 * 所有可用的 tools 列表
 *
 * 添加新 tool 时：
 * 1. 在 tools/ 目录下创建新的 tool 文件
 * 2. 在此数组中添加对应的配置
 */
export const TOOLS: ToolConfig[] = [
  {
    name: "get-current-time",
    description: "获取当前时间和日期",
    tool: getCurrentTimeTool,
  },
//   {
//     name: "write-file",
//     description: "将内容写入文件，支持创建新文件或覆盖现有文件",
//     tool: writeFileTool,
//   },
];

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
export function getToolObjects(): any[] {
  return TOOLS.map((t) => t.tool);
}
