/**
 * 内置技能实现
 */

import type { AgentContext } from "@/types/index.js";
import type { Skill, SkillRegistry } from "./base.js";

/**
 * 总结技能
 */
export const summarizeSkill: Skill = {
  name: "summarize",
  description: "总结长文本内容",
  triggers: ["总结", "摘要", "summary"],
  async execute(context: AgentContext): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    const lastMessage = context.messages[context.messages.length - 1];
    if (!lastMessage) {
      return {
        success: false,
        error: "No message to summarize",
      };
    }

    // 这里简化实现，实际应该调用 LLM 进行总结
    return {
      success: true,
      response: `这是对您输入的总结：\n\n${lastMessage.content.slice(0, 100)}...`,
    };
  },
};

/**
 * 代码解释技能
 */
export const explainCodeSkill: Skill = {
  name: "explain_code",
  description: "解释代码的功能",
  triggers: ["解释代码", "代码解释", "explain code"],
  async execute(context: AgentContext): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    const lastMessage = context.messages[context.messages.length - 1];
    if (!lastMessage) {
      return {
        success: false,
        error: "No code to explain",
      };
    }

    return {
      success: true,
      response: `我会帮您分析这段代码。\n\n代码内容：\n${lastMessage.content}`,
    };
  },
};

/**
 * 翻译技能
 */
export const translateSkill: Skill = {
  name: "translate",
  description: "翻译文本",
  triggers: ["翻译", "translate"],
  async execute(context: AgentContext): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    const lastMessage = context.messages[context.messages.length - 1];
    if (!lastMessage) {
      return {
        success: false,
        error: "No text to translate",
      };
    }

    return {
      success: true,
      response: `我会帮您翻译这段文本：\n\n${lastMessage.content}`,
    };
  },
};

/**
 * 创意写作技能
 */
export const creativeWritingSkill: Skill = {
  name: "creative_writing",
  description: "创意写作（故事、诗歌等）",
  triggers: ["写", "创作", "story", "poem"],
  async execute(context: AgentContext): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    const lastMessage = context.messages[context.messages.length - 1];
    if (!lastMessage) {
      return {
        success: false,
        error: "No writing prompt",
      };
    }

    return {
      success: true,
      response: `我会为您创作以下内容：\n\n${lastMessage.content}\n\n请稍候...`,
    };
  },
};

/**
 * 问题解决技能
 */
export const problemSolvingSkill: Skill = {
  name: "problem_solving",
  description: "帮助解决问题",
  triggers: ["解决", "问题", "help", "solve"],
  async execute(context: AgentContext): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    const lastMessage = context.messages[context.messages.length - 1];
    if (!lastMessage) {
      return {
        success: false,
        error: "No problem to solve",
      };
    }

    return {
      success: true,
      response: `我会帮您分析并解决这个问题：\n\n${lastMessage.content}\n\n让我们一步步来思考...`,
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
