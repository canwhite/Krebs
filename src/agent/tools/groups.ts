/**
 * 工具分组定义
 *
 * 参考 openclaw-cn-ds 的工具分组系统
 * 用于批量管理和控制工具
 */

/**
 * 工具分组映射
 *
 * 分组命名规范：group:<category>
 * 使用分组可以批量控制一类工具
 */
export const TOOL_GROUPS: Record<string, string[]> = {
  // 文件系统工具
  "group:fs": ["read_file", "write_file", "edit_file"],

  // 运行时执行工具
  "group:runtime": ["bash"],

  // Web 工具
  "group:web": ["web_search", "web_fetch"],

  // 会话管理工具
  "group:sessions": ["sessions_list", "sessions_history", "sessions_send", "session_status"],

  // 内存工具
  "group:memory": ["memory_search", "memory_get"],

  // 所有内置工具
  "group:builtin": ["bash", "read_file", "write_file", "edit_file"],
};

/**
 * 工具名称别名映射
 *
 * 用于兼容不同命名习惯
 */
export const TOOL_NAME_ALIASES: Record<string, string> = {
  // bash 的别名
  exec: "bash",
  shell: "bash",

  // read 的别名
  read: "read_file",
  cat: "read_file",

  // write 的别名
  write: "write_file",
  save: "write_file",
};

/**
 * 规范化工具名称
 *
 * 1. 转小写
 * 2. 去除空格
 * 3. 解析别名
 */
export function normalizeToolName(name: string): string {
  const normalized = name.trim().toLowerCase();
  return TOOL_NAME_ALIASES[normalized] || normalized;
}

/**
 * 规范化工具列表
 */
export function normalizeToolList(list?: string[]): string[] {
  if (!list) return [];
  return list.map(normalizeToolName).filter(Boolean);
}

/**
 * 展开工具分组
 *
 * 将分组名称（如 "group:fs"）展开为实际的工具列表
 *
 * @example
 * expandToolGroups(["group:fs", "web_search"])
 * // => ["read_file", "write_file", "edit_file", "web_search"]
 */
export function expandToolGroups(list?: string[]): string[] {
  const normalized = normalizeToolList(list);
  const expanded: string[] = [];

  for (const item of normalized) {
    // 检查是否是分组
    const group = TOOL_GROUPS[item];
    if (group) {
      expanded.push(...group);
      continue;
    }

    // 不是分组，直接添加
    expanded.push(item);
  }

  // 去重
  return Array.from(new Set(expanded));
}

/**
 * 检查工具是否在分组中
 */
export function isToolInGroup(toolName: string, groupName: string): boolean {
  const normalized = normalizeToolName(toolName);
  const group = TOOL_GROUPS[groupName];
  return group ? group.includes(normalized) : false;
}

/**
 * 获取工具所属的所有分组
 */
export function getToolGroups(toolName: string): string[] {
  const normalized = normalizeToolName(toolName);
  const groups: string[] = [];

  for (const [groupName, tools] of Object.entries(TOOL_GROUPS)) {
    if (tools.includes(normalized)) {
      groups.push(groupName);
    }
  }

  return groups;
}
