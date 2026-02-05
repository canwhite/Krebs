/**
 * 内置技能实现
 */

import type { AgentContext } from "@/types/index.js";
import type { Skill, SkillRegistry } from "./base.js";

/**
 * 总结技能
 *
 * 注意：此技能仅在用户明确要求总结已有对话内容时触发
 * 对于"搜索并总结"这类复杂请求，应该让 LLM 处理
 */
export const summarizeSkill: Skill = {
  name: "summarize",
  description: "总结长文本内容",
  // 使用更精确的触发关键词，避免误触发"搜索并总结"等请求
  triggers: [
    "总结上面的",
    "总结前面的",
    "总结这段对话",
    "总结一下上面的",
    "总结我们的对话",
    "做个摘要",
    "对上面的内容做个摘要",
  ],
  async execute(context: AgentContext): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    // 检查是否有足够的对话历史可以总结
    if (context.messages.length < 2) {
      // 没有历史对话，返回 false 让 LLM 处理
      return {
        success: false,
        error: "No conversation history to summarize",
      };
    }

    // 这里简化实现，实际应该调用 LLM 进行总结
    // 返回 false 让 LLM 处理，因为 LLM 更适合做总结
    return {
      success: false,
      error: "Summarization should be handled by LLM",
    };
  },
};

/**
 * 代码解释技能
 *
 * 注意：代码解释应该由 LLM 处理，此技能已禁用
 */
export const explainCodeSkill: Skill = {
  name: "explain_code",
  description: "解释代码的功能",
  triggers: [],  // 空触发词，禁用此技能
  async execute(_context: AgentContext): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    // 此技能已禁用，让 LLM 处理
    return {
      success: false,
      error: "Code explanation should be handled by LLM",
    };
  },
};

/**
 * 翻译技能
 *
 * 注意：翻译应该由 LLM 处理，此技能已禁用
 */
export const translateSkill: Skill = {
  name: "translate",
  description: "翻译文本",
  triggers: [],  // 空触发词，禁用此技能
  async execute(_context: AgentContext): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    // 此技能已禁用，让 LLM 处理
    return {
      success: false,
      error: "Translation should be handled by LLM",
    };
  },
};

/**
 * 创意写作技能
 *
 * 注意：创意写作应该由 LLM 处理，此技能已禁用
 */
export const creativeWritingSkill: Skill = {
  name: "creative_writing",
  description: "创意写作（故事、诗歌等）",
  triggers: [],  // 空触发词，禁用此技能
  async execute(_context: AgentContext): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    // 此技能已禁用，让 LLM 处理
    return {
      success: false,
      error: "Creative writing should be handled by LLM",
    };
  },
};

/**
 * 问题解决技能
 *
 * 注意：问题解决应该由 LLM 处理，此技能已禁用
 */
export const problemSolvingSkill: Skill = {
  name: "problem_solving",
  description: "帮助解决问题",
  triggers: [],  // 空触发词，禁用此技能
  async execute(_context: AgentContext): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    // 此技能已禁用，让 LLM 处理
    return {
      success: false,
      error: "Problem solving should be handled by LLM",
    };
  },
};

/**
 * 注册所有内置技能到指定的注册表
 *
 * @param registry - 技能注册表实例
 */
export function registerBuiltinSkills(registry: SkillRegistry): void {
  registry.register(summarizeSkill);
  registry.register(explainCodeSkill);
  registry.register(translateSkill);
  registry.register(creativeWritingSkill);
  registry.register(problemSolvingSkill);
}

/**
 * 获取所有内置技能列表
 *
 * @returns 内置技能数组
 */
export function getBuiltinSkills(): Skill[] {
  return [
    summarizeSkill,
    explainCodeSkill,
    translateSkill,
    creativeWritingSkill,
    problemSolvingSkill,
  ];
}
