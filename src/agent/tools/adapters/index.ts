/**
 * 平台适配器模块
 *
 * 导出所有平台适配器和相关工具
 */

export { BaseAdapter, AdapterRegistry, createAdapterRegistry, globalAdapterRegistry } from "./base.js";
export { openaiAdapter, OpenAIAdapter, adaptToolForOpenAI, adaptToolsForOpenAI } from "./openai.js";
export { anthropicAdapter, AnthropicAdapter, adaptToolForAnthropic, adaptToolsForAnthropic } from "./anthropic.js";
export {
  adaptToolForDeepSeek,
  adaptToolsForDeepSeek,
  validateDeepSeekToolDeclaration,
  createToolUsageExample,
  exportDeclarationsAsJSON,
} from "./deepseek.js";

// 类型导出
export type { GenericToolDeclaration } from "./base.js";
export type { OpenAIToolDeclaration, OpenAIParameterSchema, OpenAIPropertySchema } from "./openai.js";
export type { AnthropicToolDeclaration, AnthropicInputSchema, AnthropicPropertySchema } from "./anthropic.js";
export type { DeepSeekToolDeclaration, DeepSeekParameterSchema, DeepSeekPropertySchema } from "./deepseek.js";
