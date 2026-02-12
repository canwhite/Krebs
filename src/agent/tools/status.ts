/**
 * 工具状态系统
 *
 * 用于检查工具的配置状态，支持优雅降级
 */

/**
 * 工具状态枚举
 */
export enum ToolStatus {
  /** 工具可用，所有配置完整 */
  AVAILABLE = "available",

  /** 缺少必要配置（如 API Key） */
  MISSING_CONFIG = "missing_config",

  /** 配置无效或错误 */
  INVALID_CONFIG = "invalid_config",

  /** 工具执行出错 */
  ERROR = "error",
}

/**
 * 工具状态信息
 */
export interface ToolStatusInfo {
  /** 工具名称 */
  name: string;

  /** 工具状态 */
  status: ToolStatus;

  /** 状态消息（用户可见） */
  message: string;

  /** 缺少的配置项（如 ["BRAVE_API_KEY"]） */
  missingConfigs?: string[];

  /** 是否可以调用 */
  isCallable: boolean;
}

/**
 * 工具配置检查函数类型
 *
 * 工具可以实现此函数来声明自己需要哪些配置
 */
export type ToolConfigChecker = () => ToolStatusInfo | Promise<ToolStatusInfo>;

/**
 * 检查工具状态
 *
 * @param toolName - 工具名称
 * @param requiresApiKey - 是否需要 API Key
 * @param apiKeyName - API Key 名称
 * @returns 工具状态
 */
export function checkToolStatus(
  toolName: string,
  requiresApiKey?: boolean,
  apiKeyName?: string
): ToolStatusInfo {
  // 如果不需要 API Key，工具可用
  if (!requiresApiKey) {
    return {
      name: toolName,
      status: ToolStatus.AVAILABLE,
      message: "Tool is available",
      isCallable: true,
    };
  }

  // 检查 API Key 是否已提供
  if (!apiKeyName) {
    return {
      name: toolName,
      status: ToolStatus.INVALID_CONFIG,
      message: "Tool requires API key but apiKeyName is not defined",
      isCallable: false,
    };
  }

  // 动态导入 apiKeyManager 避免循环依赖
  const { apiKeyManager } = require("@/shared/api-keys.js");
  const hasKey = apiKeyManager.hasApiKey(apiKeyName);

  if (!hasKey) {
    return {
      name: toolName,
      status: ToolStatus.MISSING_CONFIG,
      message: `Requires ${apiKeyName}`,
      missingConfigs: [apiKeyName],
      isCallable: false,
    };
  }

  return {
    name: toolName,
    status: ToolStatus.AVAILABLE,
    message: "Tool is available",
    isCallable: true,
  };
}
