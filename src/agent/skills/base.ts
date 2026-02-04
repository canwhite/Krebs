/**
 * Skill 基础定义
 */

import type { AgentContext } from "@/types/index.js";

export interface Skill {
  /**
   * 技能名称
   */
  name: string;

  /**
   * 技能描述
   */
  description: string;

  /**
   * 触发关键词（可选）
   */
  triggers?: string[];

  /**
   * 执行技能
   */
  execute: (context: AgentContext) => Promise<SkillResult>;
}

export interface SkillResult {
  /**
   * 是否成功
   */
  success: boolean;

  /**
   * 响应内容
   */
  response?: string;

  /**
   * 额外数据
   */
  data?: unknown;

  /**
   * 错误信息
   */
  error?: string;
}

/**
 * 技能注册表
 */
export class SkillRegistry {
  private skills = new Map<string, Skill>();

  register(skill: Skill): void {
    if (this.skills.has(skill.name)) {
      throw new Error(`Skill already registered: ${skill.name}`);
    }
    this.skills.set(skill.name, skill);
  }

  unregister(name: string): void {
    this.skills.delete(name);
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * 根据触发词查找技能
   */
  findByTrigger(text: string): Skill[] {
    const lowerText = text.toLowerCase();
    return this.list().filter((skill) =>
      skill.triggers?.some((trigger) => lowerText.includes(trigger.toLowerCase()))
    );
  }

  getNames(): string[] {
    return Array.from(this.skills.keys());
  }
}

// 全局技能注册表
export const globalSkillRegistry = new SkillRegistry();
