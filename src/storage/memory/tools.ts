/**
 * Memory Tools - 记忆工具集
 *
 * Agent 可以调用的记忆相关工具：
 * - memory_search: 搜索长期记忆
 * - memory_save: 保存记忆
 * - memory_stats: 获取记忆统计
 *
 * 参考：openclaw-cn-ds/src/agents/tools/memory-tool.ts
 */

import type { AgentContext } from "@/types/index.js";
import type { SkillResult } from "@/agent/skills/base.js";
import type { MemoryService } from "../memory/service.js";

/**
 * 创建记忆搜索工具
 */
export function createMemorySearchTool(memoryService: MemoryService) {
  return {
    name: "memory_search",
    description:
      "搜索长期记忆。用于查找相关的历史信息、用户偏好、项目知识等。" +
      "使用场景：当需要回忆过去的信息、查找相关上下文时调用。",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索查询，描述要查找的内容",
        },
        max_results: {
          type: "number",
          description: "最大返回结果数（可选，默认6）",
          default: 6,
        },
      },
      required: ["query"],
    },

    async execute(
      _context: AgentContext,
      args?: { query?: string; max_results?: number }
    ): Promise<SkillResult> {
      const query = args?.query ?? "";
      const max_results = args?.max_results ?? 6;

      if (!query) {
        return {
          success: false,
          error: "缺少搜索查询",
        };
      }

      const results = await memoryService.searchMemories(query);
      const limitedResults = results.slice(0, max_results);

      if (limitedResults.length === 0) {
        return {
          success: true,
          data: {
            message: "未找到相关记忆",
            results: [],
          },
        };
      }

      const formattedResults = limitedResults.map((r) => ({
        source: r.path,
        line: `${r.startLine}-${r.endLine}`,
        score: r.score,
        content: r.snippet,
      }));

      return {
        success: true,
        data: {
          message: `找到 ${limitedResults.length} 条相关记忆`,
          results: formattedResults,
        },
      };
    },
  };
}

/**
 * 创建记忆保存工具
 */
export function createMemorySaveTool(_memoryService: MemoryService) {
  return {
    name: "memory_save",
    description:
      "保存重要信息到长期记忆。用于记录用户偏好、重要决策、项目信息等。" +
      "使用场景：当用户明确表示要记住某事，或者识别到重要信息时调用。",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "要保存的内容",
        },
        title: {
          type: "string",
          description: "记忆标题（可选）",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "标签列表（可选），如 ['preference', 'project']",
        },
      },
      required: ["content"],
    },

    async execute(
      _context: AgentContext,
      args?: { content?: string; title?: string; tags?: string[] }
    ): Promise<SkillResult> {
      const content = args?.content ?? "";

      if (!content) {
        return {
          success: false,
          error: "缺少要保存的内容",
        };
      }

      const title = args?.title;
      const tags = args?.tags;

      // TODO: 实现保存逻辑
      // 1. 确定保存文件（MEMORY.md 或每日日志）
      // 2. 格式化内容
      // 3. 追加到文件
      // 4. 触发索引更新

      return {
        success: true,
        data: {
          message: "记忆已保存（TODO）",
          title,
          tags,
        },
      };
    },
  };
}

/**
 * 创建记忆统计工具
 */
export function createMemoryStatsTool(memoryService: MemoryService) {
  return {
    name: "memory_stats",
    description: "获取记忆系统统计信息。用于了解当前记忆库的状态。",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },

    async execute(_context: AgentContext): Promise<SkillResult> {
      const stats = memoryService.getStats();

      return {
        success: true,
        data: {
          message: "记忆统计信息",
          file_count: stats.fileCount,
          chunk_count: stats.chunkCount,
          total_size: stats.totalSize,
        },
      };
    },
  };
}
