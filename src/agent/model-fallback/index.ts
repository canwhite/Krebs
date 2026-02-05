/**
 * Model Fallback 机制
 *
 * 当模型调用失败时，自动降级到备用模型
 */

export type {
  ModelConfig,
  FallbackOptions,
  FallbackContext,
} from "./types.js";

export {
  runWithModelFallback,
  createFallbackLLMCaller,
} from "./runner.js";
