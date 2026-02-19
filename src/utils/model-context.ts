/**
 * 模型上下文窗口配置
 *
 * 定义各个 LLM 模型的上下文窗口大小（token 数量）
 */

export interface ModelContextInfo {
  /**
   * 模型名称（支持前缀匹配）
   */
  name: string;

  /**
   * 上下文窗口大小（token 数量）
   */
  contextWindow: number;

  /**
   * 最大输出 token 数量
   */
  maxOutput?: number;
}

/**
 * 常见模型的上下文窗口配置
 *
 * 数据来源：各模型官方文档
 */
export const MODEL_CONTEXT_WINDOWS: ModelContextInfo[] = [
  // ========== Anthropic Claude ==========
  {
    name: "claude-3-5-sonnet",
    contextWindow: 200_000,
    maxOutput: 8192,
  },
  {
    name: "claude-3-5-haiku",
    contextWindow: 200_000,
    maxOutput: 8192,
  },
  {
    name: "claude-3-opus",
    contextWindow: 200_000,
    maxOutput: 4096,
  },
  {
    name: "claude-3-sonnet",
    contextWindow: 200_000,
    maxOutput: 4096,
  },
  {
    name: "claude-3-haiku",
    contextWindow: 200_000,
    maxOutput: 4096,
  },
  {
    name: "claude",
    contextWindow: 200_000, // 默认 Claude
    maxOutput: 4096,
  },

  // ========== OpenAI GPT ==========
  {
    name: "gpt-4o",
    contextWindow: 128_000,
    maxOutput: 4096,
  },
  {
    name: "gpt-4o-mini",
    contextWindow: 128_000,
    maxOutput: 16384,
  },
  {
    name: "gpt-4-turbo",
    contextWindow: 128_000,
    maxOutput: 4096,
  },
  {
    name: "gpt-4",
    contextWindow: 8192,
    maxOutput: 4096,
  },
  {
    name: "gpt-3.5-turbo",
    contextWindow: 16385,
    maxOutput: 4096,
  },
  {
    name: "gpt",
    contextWindow: 128_000, // 默认 GPT
  },

  // ========== DeepSeek ==========
  {
    name: "deepseek-chat",
    contextWindow: 128_000,
    maxOutput: 4096,
  },
  {
    name: "deepseek-coder",
    contextWindow: 128_000,
    maxOutput: 4096,
  },
  {
    name: "deepseek",
    contextWindow: 128_000, // 默认 DeepSeek
  },

  // ========== Google Gemini ==========
  {
    name: "gemini-2.5",
    contextWindow: 1_000_000,
    maxOutput: 8192,
  },
  {
    name: "gemini-2.0",
    contextWindow: 2_000_000,
    maxOutput: 8192,
  },
  {
    name: "gemini-1.5",
    contextWindow: 2_000_000,
    maxOutput: 8192,
  },
  {
    name: "gemini",
    contextWindow: 1_000_000, // 默认 Gemini
  },

  // ========== Open Source ==========
  {
    name: "llama-3.3",
    contextWindow: 128_000,
  },
  {
    name: "llama-3.1",
    contextWindow: 128_000,
  },
  {
    name: "llama-3",
    contextWindow: 8192,
  },
  {
    name: "llama",
    contextWindow: 4096, // 默认 LLaMA
  },
  {
    name: "mistral",
    contextWindow: 128_000,
  },
  {
    name: "mixtral",
    contextWindow: 32768,
  },
  {
    name: "qwen",
    contextWindow: 32768,
  },
];

/**
 * 默认上下文窗口大小（用于未知模型）
 */
export const DEFAULT_CONTEXT_WINDOW = 128_000;

/**
 * 最小上下文窗口（硬性限制）
 */
export const MIN_CONTEXT_WINDOW = 16_000;

/**
 * 警告阈值（低于此值会警告）
 */
export const WARN_CONTEXT_WINDOW = 32_000;

/**
 * 根据模型名称获取上下文窗口大小
 *
 * @param modelName - 模型名称
 * @returns 上下文窗口大小
 */
export function getModelContextWindow(modelName: string): number {
  // 尝试精确匹配
  const exactMatch = MODEL_CONTEXT_WINDOWS.find(
    (m) => m.name.toLowerCase() === modelName.toLowerCase()
  );
  if (exactMatch) {
    return exactMatch.contextWindow;
  }

  // 尝试前缀匹配
  const prefixMatch = MODEL_CONTEXT_WINDOWS.find((m) =>
    modelName.toLowerCase().startsWith(m.name.toLowerCase())
  );
  if (prefixMatch) {
    return prefixMatch.contextWindow;
  }

  // 未找到，返回默认值
  console.warn(
    `[ModelContext] Unknown model "${modelName}", using default context window (${DEFAULT_CONTEXT_WINDOW})`
  );
  return DEFAULT_CONTEXT_WINDOW;
}

/**
 * 获取模型的详细信息
 *
 * @param modelName - 模型名称
 * @returns 模型信息，未找到返回 null
 */
export function getModelInfo(modelName: string): ModelContextInfo | null {
  // 精确匹配
  const exactMatch = MODEL_CONTEXT_WINDOWS.find(
    (m) => m.name.toLowerCase() === modelName.toLowerCase()
  );
  if (exactMatch) {
    return exactMatch;
  }

  // 前缀匹配
  const prefixMatch = MODEL_CONTEXT_WINDOWS.find((m) =>
    modelName.toLowerCase().startsWith(m.name.toLowerCase())
  );
  if (prefixMatch) {
    return {
      ...prefixMatch,
      name: modelName, // 返回实际的模型名称
    };
  }

  return null;
}

/**
 * 检查上下文窗口是否足够
 *
 * @param contextWindow - 上下文窗口大小
 * @returns 检查结果
 */
export function validateContextWindow(contextWindow: number): {
  isValid: boolean;
  shouldWarn: boolean;
  reason?: string;
} {
  if (contextWindow < MIN_CONTEXT_WINDOW) {
    return {
      isValid: false,
      shouldWarn: false,
      reason: `Context window (${contextWindow}) is below minimum (${MIN_CONTEXT_WINDOW})`,
    };
  }

  if (contextWindow < WARN_CONTEXT_WINDOW) {
    return {
      isValid: true,
      shouldWarn: true,
      reason: `Context window (${contextWindow}) is below recommended minimum (${WARN_CONTEXT_WINDOW})`,
    };
  }

  return {
    isValid: true,
    shouldWarn: false,
  };
}
