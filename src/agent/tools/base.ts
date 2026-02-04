/**
 * Tool 基础定义
 */

export type ToolParameter = {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
  default?: unknown;
};

export type ToolParameters = Record<string, ToolParameter>;

export interface Tool {
  /**
   * 工具名称（唯一标识）
   */
  name: string;

  /**
   * 工具描述（用于 Agent 理解）
   */
  description: string;

  /**
   * 参数定义
   */
  parameters?: ToolParameters;

  /**
   * 执行工具
   */
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 返回数据
   */
  data?: unknown;

  /**
   * 错误信息
   */
  error?: string;
}

/**
 * 工具注册表
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  getNames(): string[] {
    return Array.from(this.tools.keys());
  }
}

// 全局工具注册表
export const globalToolRegistry = new ToolRegistry();
