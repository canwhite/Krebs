/**
 * API Key 管理器
 *
 * 用于存储和访问客户端提供的 API Keys
 */

/**
 * API Key 管理器类（单例）
 */
export class ApiKeyManager {
  private static instance: ApiKeyManager;
  private apiKeys: Record<string, string> = {};

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ApiKeyManager {
    if (!ApiKeyManager.instance) {
      ApiKeyManager.instance = new ApiKeyManager();
    }
    return ApiKeyManager.instance;
  }

  /**
   * 设置 API Key
   */
  setApiKey(toolName: string, apiKey: string): void {
    this.apiKeys[toolName] = apiKey;
  }

  /**
   * 获取 API Key
   */
  getApiKey(toolName: string): string | null {
    return this.apiKeys[toolName] || null;
  }

  /**
   * 检查工具是否已配置 API Key
   */
  hasApiKey(toolName: string): boolean {
    const key = this.apiKeys[toolName];
    return !!key && key.length > 0;
  }

  /**
   * 删除 API Key
   */
  removeApiKey(toolName: string): void {
    delete this.apiKeys[toolName];
  }

  /**
   * 清空所有 API Keys
   */
  clearAll(): void {
    this.apiKeys = {};
  }

  /**
   * 获取所有已配置的工具名称
   */
  getConfiguredTools(): string[] {
    return Object.keys(this.apiKeys);
  }
}

/**
 * 导出单例实例
 */
export const apiKeyManager = ApiKeyManager.getInstance();
