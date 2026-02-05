/**
 * OpenAI 平台适配器
 *
 * 将 Krebs 工具定义转换为 OpenAI API 格式
 * OpenAI 和 DeepSeek 使用相同的格式（都兼容 OpenAI）
 */

import type { Tool } from "../types.js";
import { BaseAdapter } from "./base.js";

/**
 * OpenAI 工具声明格式
 */
export interface OpenAIToolDeclaration {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: OpenAIParameterSchema;
  };
}

/**
 * OpenAI 参数 Schema 格式
 */
export interface OpenAIParameterSchema {
  type: "object";
  properties: Record<string, OpenAIPropertySchema>;
  required?: string[];
}

/**
 * OpenAI 属性 Schema 格式
 */
export type OpenAIPropertySchema =
  | { type: "string"; description?: string; enum?: string[] }
  | { type: "number"; description?: string }
  | { type: "integer"; description?: string }
  | { type: "boolean"; description?: string }
  | { type: "array"; items: OpenAIPropertySchema; description?: string }
  | { type: "object"; properties: Record<string, OpenAIPropertySchema>; description?: string };

/**
 * 导入 DeepSeek 的适配逻辑（格式相同）
 */
import { adaptToolForDeepSeek, adaptToolsForDeepSeek } from "./deepseek.js";

/**
 * 重新导出为 OpenAI 类型（格式完全相同）
 */
export const adaptToolForOpenAI = adaptToolForDeepSeek as (tool: Tool) => OpenAIToolDeclaration;
export const adaptToolsForOpenAI = adaptToolsForDeepSeek as (tools: Tool[]) => OpenAIToolDeclaration[];

/**
 * OpenAI 适配器类
 */
export class OpenAIAdapter extends BaseAdapter<OpenAIToolDeclaration> {
  readonly platform = "openai";

  adaptTool(tool: Tool): OpenAIToolDeclaration {
    return adaptToolForOpenAI(tool);
  }

  adaptTools(tools: Tool[]): OpenAIToolDeclaration[] {
    return adaptToolsForOpenAI(tools);
  }

  getDefaults() {
    return {
      model: "gpt-4-turbo-preview",
      temperature: 0.7,
      max_tokens: 4096,
    };
  }
}

/**
 * 导出单例
 */
export const openaiAdapter = new OpenAIAdapter();
