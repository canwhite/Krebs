/**
 * Model Fallback 执行器
 */

import type {
  ModelConfig,
  FallbackOptions,
  FallbackContext,
} from "./types.js";

/**
 * 默认的可恢复错误
 */
const DEFAULT_RECOVERABLE_ERRORS = [
  // Rate limit errors
  /rate.*limit/i,
  /too.*many.*requests/i,
  /429/i,
  // Server errors
  /503/i,
  /502/i,
  /504/i,
  // Timeout errors
  /timeout/i,
  /timed out/i,
  // Network errors
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  // Context length errors
  /context.*length/i,
  /maximum.*context/i,
  /too.*long/i,
  // Authentication errors（可能需要切换 profile）
  /401/i,
  /403/i,
  /unauthorized/i,
  // Model overload
  /overloaded/i,
  /capacity/i,
];

/**
 * 检查错误是否可恢复
 */
function isRecoverableError(
  error: Error,
  recoverablePatterns: RegExp[]
): boolean {
  const message = error.message.toLowerCase();
  const stack = error.stack?.toLowerCase() || "";

  for (const pattern of recoverablePatterns) {
    if (pattern.test(message) || pattern.test(stack)) {
      return true;
    }
  }

  return false;
}

/**
 * 等待指定时间
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 使用 Model Fallback 执行函数
 */
export async function runWithModelFallback<T>(params: {
  // 主模型
  primary: ModelConfig;
  // 备用模型列表（按优先级排序）
  fallbacks: ModelConfig[];
  // 要执行的函数
  run: (config: ModelConfig, context: FallbackContext) => Promise<T>;
  // 选项
  options?: FallbackOptions;
}): Promise<T> {
  const {
    primary,
    fallbacks,
    run,
    options = {},
  } = params;

  const {
    enabled = true,
    recoverableErrors = DEFAULT_RECOVERABLE_ERRORS,
    maxRetries = 2,
    retryDelay = 1000,
    onFallback,
    onRetry,
  } = options;

  // 如果未启用，直接运行主模型
  if (!enabled) {
    return await run(primary, {
      currentIndex: 0,
      currentAttempt: 1,
      totalAttempts: 1,
    });
  }

  // 合并所有模型（主模型 + 备用模型）
  const allModels: ModelConfig[] = [primary, ...fallbacks];
  const context: FallbackContext = {
    currentIndex: 0,
    currentAttempt: 0,
    totalAttempts: 0,
  };

  // 遍历所有模型
  for (let i = 0; i < allModels.length; i++) {
    const model = allModels[i];
    context.currentIndex = i;

    // 对每个模型进行多次尝试
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      context.currentAttempt = attempt;
      context.totalAttempts++;

      try {
        // 执行函数
        const result = await run(model, context);
        return result;

      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        context.lastError = err;

        // 检查是否是可恢复的错误
        const isRecoverable = isRecoverableError(err, recoverableErrors);

        // 触发重试回调
        if (onRetry) {
          onRetry(model, attempt, err);
        }

        // 如果不是最后一次尝试，且是可恢复的错误，等待后重试
        if (attempt < maxRetries && isRecoverable) {
          console.warn(
            `[Model Fallback] ${model.provider}/${model.model} failed (attempt ${attempt}/${maxRetries}): ${err.message}. Retrying in ${retryDelay}ms...`
          );
          await delay(retryDelay);
          continue;
        }

        // 如果是最后一次尝试，或者不是可恢复的错误，切换到下一个模型
        if (i < allModels.length - 1) {
          const nextModel = allModels[i + 1];
          console.warn(
            `[Model Fallback] ${model.provider}/${model.model} failed after ${attempt} attempts. Switching to ${nextModel.provider}/${nextModel.model}...`
          );

          // 触发 fallback 回调
          if (onFallback) {
            onFallback(model, nextModel, err);
          }

          // 跳出当前模型的重试循环，尝试下一个模型
          break;
        }

        // 如果已经是最后一个模型，抛出错误
        throw new Error(
          `All models failed. Last error (${model.provider}/${model.model}): ${err.message}`
        );
      }
    }
  }

  // 理论上不会到这里（因为上面会抛出错误）
  throw new Error("Model fallback failed: No models available");
}

/**
 * 创建一个带 fallback 的 LLM 调用器
 */
export function createFallbackLLMCaller(params: {
  primary: ModelConfig;
  fallbacks: ModelConfig[];
  options?: FallbackOptions;
}) {
  return async <T>(
    run: (config: ModelConfig, context: FallbackContext) => Promise<T>
  ): Promise<T> => {
    return runWithModelFallback({
      primary: params.primary,
      fallbacks: params.fallbacks,
      run,
      options: params.options,
    });
  };
}
