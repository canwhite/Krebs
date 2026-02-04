/**
 * Provider 工厂
 */

import type { LLMProvider, ProviderConfig } from "./base.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { DeepSeekProvider } from "./deepseek.js";

export type ProviderType = "anthropic" | "openai" | "deepseek";

export function createProvider(
  type: ProviderType,
  config: ProviderConfig
): LLMProvider {
  switch (type) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai":
      return new OpenAIProvider(config);
    case "deepseek":
      return new DeepSeekProvider(config);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

export function createAnthropicProvider(config: ProviderConfig): LLMProvider {
  return new AnthropicProvider(config);
}

export function createOpenAIProvider(config: ProviderConfig): LLMProvider {
  return new OpenAIProvider(config);
}

export function createDeepSeekProvider(config: ProviderConfig): LLMProvider {
  return new DeepSeekProvider(config);
}
