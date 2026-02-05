/**
 * Model Fallback 机制
 *
 * 当模型调用失败时，自动降级到备用模型
 * 参考 openclaw-cn-ds 的多层级重试机制
 */

/**
 * 模型配置
 */
export interface ModelConfig {
  provider: string;
  model: string;
}

/**
 * Fallback 选项
 */
export interface FallbackOptions {
  // 是否启用 fallback
  enabled?: boolean;
  // 可恢复的错误类型（正则表达式数组）
  recoverableErrors?: RegExp[];
  // 最大重试次数（每个模型）
  maxRetries?: number;
  // 重试延迟（毫秒）
  retryDelay?: number;
  // 回调函数
  onFallback?: (from: ModelConfig, to: ModelConfig, error: Error) => void;
  onRetry?: (model: ModelConfig, attempt: number, error: Error) => void;
}

/**
 * Fallback 上下文
 */
export interface FallbackContext {
  // 当前模型索引
  currentIndex: number;
  // 当前尝试次数（当前模型）
  currentAttempt: number;
  // 总尝试次数
  totalAttempts: number;
  // 最后的错误
  lastError?: Error;
}
