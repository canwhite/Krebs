/**
 * Agent 错误处理系统
 *
 * 参考 openclaw-cn-ds 的设计，实现错误分类和处理机制
 */

/**
 * 工具错误分类
 */
export enum ToolErrorKind {
  /** 可恢复：工具执行失败，但可以继续执行 */
  RECOVERABLE = 'recoverable',

  /** 可重试：网络错误、rate limit 等，可以重试 */
  RETRYABLE = 'retryable',

  /** 致命：认证失败、上下文溢出等，必须终止 */
  FATAL = 'fatal',
}

/**
 * Agent 错误类
 */
export class AgentError extends Error {
  constructor(
    message: string,
    public kind: ToolErrorKind,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

/**
 * 上下文溢出错误
 */
export class ContextOverflowError extends AgentError {
  constructor(message: string, originalError?: Error) {
    super(message, ToolErrorKind.FATAL, originalError);
    this.name = 'ContextOverflowError';
  }
}

/**
 * 认证错误
 */
export class AuthenticationError extends AgentError {
  constructor(message: string, originalError?: Error) {
    super(message, ToolErrorKind.FATAL, originalError);
    this.name = 'AuthenticationError';
  }
}

/**
 * 网络错误（可重试）
 */
export class NetworkError extends AgentError {
  constructor(message: string, originalError?: Error) {
    super(message, ToolErrorKind.RETRYABLE, originalError);
    this.name = 'NetworkError';
  }
}

/**
 * 工具执行错误（可恢复）
 */
export class ToolExecutionError extends AgentError {
  constructor(
    message: string,
    public toolName: string,
    originalError?: Error
  ) {
    super(message, ToolErrorKind.RECOVERABLE, originalError);
    this.name = 'ToolExecutionError';
  }
}

/**
 * 错误关键词匹配模式
 */
const ERROR_PATTERNS = {
  // 上下文溢出
  contextOverflow: [
    'context length',
    'maximum context length',
    'too long',
    'context overflow',
    'token limit',
  ],

  // 认证错误
  authentication: [
    'authentication',
    'unauthorized',
    'invalid api key',
    '401',
    '403',
    'forbidden',
  ],

  // 网络错误
  network: [
    'network',
    'connection',
    'timeout',
    'econnrefused',
    'econnreset',
    'etimedout',
    'rate limit',
    '429',
    '502',
    '503',
    '504',
  ],
};

/**
 * 分类工具错误
 *
 * @param error - 错误对象或错误消息
 * @returns 错误分类
 */
export function classifyToolError(error: Error | string): ToolErrorKind {
  const message = typeof error === 'string' ? error : error.message;
  const lowerMessage = message.toLowerCase();

  // 检查上下文溢出
  if (ERROR_PATTERNS.contextOverflow.some(pattern => lowerMessage.includes(pattern))) {
    return ToolErrorKind.FATAL;
  }

  // 检查认证错误
  if (ERROR_PATTERNS.authentication.some(pattern => lowerMessage.includes(pattern))) {
    return ToolErrorKind.FATAL;
  }

  // 检查网络错误
  if (ERROR_PATTERNS.network.some(pattern => lowerMessage.includes(pattern))) {
    return ToolErrorKind.RETRYABLE;
  }

  // 默认为可恢复错误
  return ToolErrorKind.RECOVERABLE;
}

/**
 * 是否为上下文溢出错误
 */
export function isContextOverflowError(error: Error | string): boolean {
  return classifyToolError(error) === ToolErrorKind.FATAL &&
    (typeof error === 'string' ? error : error.message).toLowerCase().includes('context');
}

/**
 * 是否为认证错误
 */
export function isAuthenticationError(error: Error | string): boolean {
  return classifyToolError(error) === ToolErrorKind.FATAL &&
    (ERROR_PATTERNS.authentication.some(pattern =>
      (typeof error === 'string' ? error : error.message).toLowerCase().includes(pattern)
    ));
}

/**
 * 是否为网络错误
 */
export function isNetworkError(error: Error | string): boolean {
  return classifyToolError(error) === ToolErrorKind.RETRYABLE;
}
