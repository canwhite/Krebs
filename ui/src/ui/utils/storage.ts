/**
 * LocalStorage 工具类
 *
 * 用于管理浏览器 localStorage,包括API keys等配置
 */

export interface ToolApiKey {
  /** 工具名称 */
  toolName: string;

  /** API Key 值 */
  apiKey: string;

  /** 显示名称 */
  displayName: string;

  /** 描述 */
  description?: string;

  /** 是否已配置 */
  isConfigured: boolean;
}

/**
 * Storage keys
 */
const STORAGE_KEYS = {
  TOOL_API_KEYS: 'krebs_tool_api_keys',
} as const;

/**
 * LocalStorage 管理类
 */
export class StorageManager {
  /**
   * 保存工具 API Key
   */
  static saveToolApiKey(toolName: string, apiKey: string): void {
    const keys = this.getAllToolApiKeys();
    keys[toolName] = {
      toolName,
      apiKey,
      displayName: this.getToolDisplayName(toolName),
      description: this.getToolDescription(toolName),
      isConfigured: !!apiKey,
    };
    localStorage.setItem(STORAGE_KEYS.TOOL_API_KEYS, JSON.stringify(keys));
  }

  /**
   * 获取工具 API Key
   */
  static getToolApiKey(toolName: string): string | null {
    const keys = this.getAllToolApiKeys();
    return keys[toolName]?.apiKey || null;
  }

  /**
   * 获取所有工具 API Keys
   */
  static getAllToolApiKeys(): Record<string, ToolApiKey> {
    const data = localStorage.getItem(STORAGE_KEYS.TOOL_API_KEYS);
    if (!data) return {};
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  /**
   * 删除工具 API Key
   */
  static removeToolApiKey(toolName: string): void {
    const keys = this.getAllToolApiKeys();
    delete keys[toolName];
    localStorage.setItem(STORAGE_KEYS.TOOL_API_KEYS, JSON.stringify(keys));
  }

  /**
   * 清空所有工具 API Keys
   */
  static clearAllToolApiKeys(): void {
    localStorage.removeItem(STORAGE_KEYS.TOOL_API_KEYS);
  }

  /**
   * 检查工具是否已配置 API Key
   */
  static isToolApiKeyConfigured(toolName: string): boolean {
    const apiKey = this.getToolApiKey(toolName);
    return !!apiKey && apiKey.length > 0;
  }

  /**
   * 获取工具显示名称
   */
  private static getToolDisplayName(toolName: string): string {
    const displayNames: Record<string, string> = {
      'web_search': 'Web Search',
      'web_fetch': 'Web Fetch',
      'bash': 'Bash',
      'read_file': 'Read File',
      'write_file': 'Write File',
      'edit_file': 'Edit File',
    };
    return displayNames[toolName] || toolName;
  }

  /**
   * 获取工具描述
   */
  private static getToolDescription(toolName: string): string {
    const descriptions: Record<string, string> = {
      'web_search': 'Brave Search API key for web search functionality',
      'web_fetch': 'No API key required',
      'bash': 'No API key required',
      'read_file': 'No API key required',
      'write_file': 'No API key required',
      'edit_file': 'No API key required',
    };
    return descriptions[toolName] || '';
  }

  /**
   * 获取需要 API Key 的工具列表
   */
  static getToolsRequiringApiKey(): string[] {
    return ['web_search'];
  }
}

/**
 * API Key 管理器
 *
 * 提供统一的 API Key 管理接口
 */
export class ApiKeyManager {
  /**
   * 将 API Keys 发送到后端
   */
  static async sendKeysToBackend(): Promise<{ success: boolean; error?: string }> {
    const keys = StorageManager.getAllToolApiKeys();

    try {
      const response = await fetch('/api/tools/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keys }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.message || 'Failed to send API keys to backend',
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * 验证 API Key 格式
   */
  static validateApiKeyFormat(toolName: string, apiKey: string): { valid: boolean; error?: string } {
    if (!apiKey || apiKey.trim().length === 0) {
      return { valid: false, error: 'API Key cannot be empty' };
    }

    // 特定工具的验证规则
    if (toolName === 'web_search') {
      // Brave Search API key 通常较长
      if (apiKey.length < 10) {
        return { valid: false, error: 'API Key seems too short' };
      }
    }

    return { valid: true };
  }
}
