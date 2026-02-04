/**
 * 内置工具实现
 */

import { createLogger } from "../../shared/logger.js";
import type { Tool } from "./base.js";
import { globalToolRegistry } from "./base.js";

const log = createLogger("Tool:FileWrite");

/**
 * 文件读取工具
 */
export const fileReadTool: Tool = {
  name: "file_read",
  description: "读取文件内容",
  parameters: {
    path: {
      type: "string",
      description: "文件路径",
      required: true,
    },
  },
  async execute(params): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      const path = params.path as string;
      // 这里简化实现，实际应该使用 fs 模块
      return {
        success: true,
        data: `File content from ${path}`,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  },
};

/**
 * 文件写入工具
 */
export const fileWriteTool: Tool = {
  name: "file_write",
  description: "写入文件内容",
  parameters: {
    path: {
      type: "string",
      description: "文件路径",
      required: true,
    },
    content: {
      type: "string",
      description: "文件内容",
      required: true,
    },
  },
  async execute(params): Promise<{ success: boolean; error?: string }> {
    try {
      const path = params.path as string;
      const fileContent = params.content as string;
      // 这里简化实现，实际应该使用 fs 模块
      log.debug(`Writing to ${path}, size: ${fileContent.length}`);
      return {
        success: true,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  },
};

/**
 * Web 搜索工具（占位）
 */
export const webSearchTool: Tool = {
  name: "web_search",
  description: "搜索网络信息",
  parameters: {
    query: {
      type: "string",
      description: "搜索查询",
      required: true,
    },
    num_results: {
      type: "number",
      description: "返回结果数量",
      default: 5,
    },
  },
  async execute(params): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }> {
    try {
      const query = params.query as string;
      const numResults = (params.num_results as number) ?? 5;

      // 这里是占位实现，实际应该调用搜索 API
      return {
        success: true,
        data: {
          query,
          results: Array.from({ length: numResults }, (_, i) => ({
            title: `搜索结果 ${i + 1}`,
            url: `https://example.com/${i}`,
            snippet: `关于 "${query}" 的搜索结果 ${i + 1}`,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  },
};

/**
 * 日期时间工具
 */
export const dateTimeTool: Tool = {
  name: "date_time",
  description: "获取当前日期时间",
  parameters: {},
  async execute(): Promise<{
    success: boolean;
    data?: { iso: string; timestamp: number };
  }> {
    const now = new Date();
    return {
      success: true,
      data: {
        iso: now.toISOString(),
        timestamp: now.getTime(),
      },
    };
  },
};

/**
 * 内存读取工具（用于访问 Agent 的记忆）
 */
export const memoryReadTool: Tool = {
  name: "memory_read",
  description: "读取存储的记忆信息",
  parameters: {
    query: {
      type: "string",
      description: "搜索查询",
      required: true,
    },
    limit: {
      type: "number",
      description: "返回结果数量限制",
      default: 5,
    },
  },
  async execute(params): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }> {
    try {
      const query = params.query as string;

      // 这里是占位实现，实际应该从存储中检索
      return {
        success: true,
        data: {
          query,
          results: [],
          message: "Memory search not implemented yet",
        },
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  },
};

/**
 * 注册所有内置工具
 */
export function registerBuiltinTools(): void {
  globalToolRegistry.register(fileReadTool);
  globalToolRegistry.register(fileWriteTool);
  globalToolRegistry.register(webSearchTool);
  globalToolRegistry.register(dateTimeTool);
  globalToolRegistry.register(memoryReadTool);
}
