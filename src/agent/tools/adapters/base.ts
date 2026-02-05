/**
 * 平台适配器基类
 *
 * 定义所有平台适配器应遵循的接口
 */

import type { Tool } from "../types.js";

/**
 * 通用工具声明格式
 */
export interface GenericToolDeclaration {
  name: string;
  description: string;
  parameters: any;
}

/**
 * 平台适配器接口
 *
 * 所有平台适配器都应实现此接口
 */
export interface PlatformAdapter<T = GenericToolDeclaration> {
  /**
   * 平台名称
   */
  readonly platform: string;

  /**
   * 适配单个工具
   *
   * @param tool - Krebs 工具定义
   * @returns 平台特定的工具声明
   */
  adaptTool(tool: Tool): T;

  /**
   * 批量适配工具
   *
   * @param tools - Krebs 工具列表
   * @returns 平台特定的工具声明列表
   */
  adaptTools(tools: Tool[]): T[];

  /**
   * 验证工具声明
   *
   * @param declaration - 平台特定的工具声明
   * @returns 是否有效
   */
  validateDeclaration?(declaration: T): boolean;

  /**
   * 获取平台特定的默认配置
   *
   * @returns 默认配置对象
   */
  getDefaults?(): Record<string, any>;
}

/**
 * 抽象适配器基类
 *
 * 提供一些通用实现
 */
export abstract class BaseAdapter<T = GenericToolDeclaration> implements PlatformAdapter<T> {
  abstract readonly platform: string;

  /**
   * 适配单个工具（必须实现）
   */
  abstract adaptTool(tool: Tool): T;

  /**
   * 批量适配工具（默认实现）
   */
  adaptTools(tools: Tool[]): T[] {
    return tools.map((tool) => this.adaptTool(tool));
  }

  /**
   * 验证工具声明（可选实现）
   */
  validateDeclaration?(declaration: T): boolean;

  /**
   * 获取默认配置（可选实现）
   */
  getDefaults?(): Record<string, any>;
}

/**
 * 适配器注册表
 *
 * 管理所有平台适配器
 */
export class AdapterRegistry {
  private adapters = new Map<string, PlatformAdapter>();

  /**
   * 注册适配器
   */
  register(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  /**
   * 获取适配器
   */
  get(platform: string): PlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  /**
   * 检查平台是否支持
   */
  has(platform: string): boolean {
    return this.adapters.has(platform);
  }

  /**
   * 获取所有支持的平台
   */
  getSupportedPlatforms(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * 自动推断并适配工具
   *
   * 根据模型名称自动选择适配器
   *
   * @param tools - 工具列表
   * @param model - 模型名称（用于推断平台）
   * @returns 平台特定的工具声明
   */
  autoAdapt(tools: Tool[], model: string): any[] {
    const platform = this.inferPlatformFromModel(model);
    const adapter = this.get(platform);

    if (!adapter) {
      throw new Error(`No adapter found for platform: ${platform}`);
    }

    return adapter.adaptTools(tools);
  }

  /**
   * 从模型名称推断平台
   *
   * @param model - 模型名称
   * @returns 平台名称
   */
  private inferPlatformFromModel(model: string): string {
    const normalized = model.toLowerCase().trim();

    // DeepSeek
    if (normalized.startsWith("deepseek")) {
      return "deepseek";
    }

    // OpenAI
    if (normalized.startsWith("gpt") || normalized.startsWith("chatgpt")) {
      return "openai";
    }

    // Anthropic Claude
    if (normalized.startsWith("claude") || normalized.startsWith("anthropic")) {
      return "anthropic";
    }

    // 默认返回 OpenAI（兼容性最好）
    return "openai";
  }
}

/**
 * 创建全局适配器注册表
 */
export function createAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry();
}

/**
 * 全局适配器注册表（单例）
 */
export const globalAdapterRegistry = createAdapterRegistry();
