/**
 * 工具注册表
 *
 * 管理所有可用工具，提供注册、查找、执行功能
 */

import { createLogger } from "@/shared/logger.js";
import type { Tool, ToolCall, ToolResult } from "./types.js";
import type { ToolStatusInfo } from "./status.js";
import { checkToolStatus } from "./status.js";

const logger = createLogger("ToolRegistry");

/**
 * 工具注册表类
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /**
   * 注册工具
   */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool already registered: ${tool.name}, overwriting...`);
    }

    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * 批量注册工具
   */
  registerAll(tools: Tool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * 注销工具
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * 获取工具
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 获取所有工具
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具名称列表
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取所有工具的状态
   */
  async getToolsStatus(): Promise<ToolStatusInfo[]> {
    const statusList: ToolStatusInfo[] = [];

    for (const tool of this.tools.values()) {
      // 如果工具定义了自定义检查函数，使用它
      if (tool.checkConfig) {
        const status = await tool.checkConfig();
        statusList.push(status);
      } else {
        // 否则使用默认检查逻辑（基于 requiresApiKey 和 apiKeyName）
        const status = checkToolStatus(
          tool.name,
          tool.requiresApiKey,
          tool.apiKeyName
        );
        statusList.push(status);
      }
    }

    return statusList;
  }

  /**
   * 获取单个工具的状态
   */
  async getToolStatus(name: string): Promise<ToolStatusInfo | null> {
    const tool = this.get(name);
    if (!tool) {
      return null;
    }

    if (tool.checkConfig) {
      return await tool.checkConfig();
    }

    return checkToolStatus(name, tool.requiresApiKey, tool.apiKeyName);
  }

  /**
   * 获取可调用的工具列表
   * （过滤掉不可用的工具）
   */
  async getCallableTools(): Promise<Tool[]> {
    const statusList = await this.getToolsStatus();
    const callableNames = new Set(
      statusList.filter((s) => s.isCallable).map((s) => s.name)
    );

    return this.getAll().filter((tool) => callableNames.has(tool.name));
  }

  /**
   * 执行工具调用
   *
   * 如果工具缺少必要配置，返回特殊结果而不是抛出错误
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.get(toolCall.name);

    if (!tool) {
      logger.error(`Tool not found: ${toolCall.name}`);
      return {
        success: false,
        error: `Tool not found: ${toolCall.name}`,
      };
    }

    // 检查工具状态（自动跳过不可用的工具）
    let status: ToolStatusInfo | null = null;
    if (tool.checkConfig) {
      status = await tool.checkConfig();
    } else if (tool.requiresApiKey) {
      status = checkToolStatus(tool.name, tool.requiresApiKey, tool.apiKeyName);
    }

    if (status && !status.isCallable) {
      logger.warn(`Tool ${toolCall.name} is not callable: ${status.message}`);

      // 返回特殊的"跳过"结果，而不是错误
      return {
        success: false,
        error: `Tool is not available: ${status.message}`,
      };
    }

    try {
      logger.debug(`Executing tool: ${toolCall.name}`, {
        args: toolCall.arguments,
      });

      const result = await tool.execute(toolCall.arguments);

      logger.debug(`Tool executed: ${toolCall.name}`, {
        success: result.success,
      });

      return result;
    } catch (error) {
      logger.error(`Tool execution error: ${toolCall.name}`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 批量执行工具调用
   *
   * 只执行可用的工具，跳过不可用的工具
   */
  async executeAll(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.execute(toolCall);
      results.push(result);
    }

    return results;
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    logger.debug("Tool registry cleared");
  }

  /**
   * 获取工具数量
   */
  size(): number {
    return this.tools.size;
  }
}

/**
 * 创建工具注册表
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry();
}

/**
 * 全局工具注册表（单例）
 *
 * @deprecated 推荐使用 createToolRegistry() 创建独立实例
 */
export const globalToolRegistry = createToolRegistry();
