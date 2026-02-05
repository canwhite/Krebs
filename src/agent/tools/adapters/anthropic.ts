/**
 * Anthropic Claude 平台适配器
 *
 * 将 Krebs 工具定义转换为 Anthropic API 格式
 * Anthropic 使用不同的工具定义格式
 */

import type { Tool } from "../types.js";
import type { ToolParameterSchema } from "../types.js";
import { BaseAdapter } from "./base.js";

/**
 * Anthropic 工具声明格式
 *
 * Anthropic 的格式更简洁，直接使用 input_schema
 */
export interface AnthropicToolDeclaration {
  name: string;
  description: string;
  input_schema: AnthropicInputSchema;
}

/**
 * Anthropic Input Schema 格式
 *
 * 使用简化的 JSON Schema
 */
export interface AnthropicInputSchema {
  type: "object";
  properties?: Record<string, AnthropicPropertySchema>;
  required?: string[];
}

/**
 * Anthropic 属性 Schema 格式
 *
 * 基础类型：string, number, boolean, array, object
 */
export type AnthropicPropertySchema =
  | { type: "string"; description?: string; enum?: string[] }
  | {
      type: "number";
      description?: string;
      minimum?: number;
      maximum?: number;
    }
  | { type: "boolean"; description?: string }
  | { type: "array"; items: AnthropicPropertySchema; description?: string }
  | {
      type: "object";
      properties?: Record<string, AnthropicPropertySchema>;
      description?: string;
    };

/**
 * 将单个工具适配为 Anthropic 格式
 *
 * @param tool - Krebs 工具定义
 * @returns Anthropic 工具声明
 */
export function adaptToolForAnthropic(tool: Tool): AnthropicToolDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: convertInputSchema(tool.inputSchema),
  };
}

/**
 * 批量适配工具
 *
 * @param tools - Krebs 工具列表
 * @returns Anthropic 工具声明列表
 */
export function adaptToolsForAnthropic(tools: Tool[]): AnthropicToolDeclaration[] {
  return tools.map(adaptToolForAnthropic);
}

/**
 * 转换参数 Schema
 *
 * Krebs 的 ToolParameterSchema 已经很接近 Anthropic 格式
 * 只需要做少量调整
 *
 * @param schema - Krebs 参数 Schema
 * @returns Anthropic Input Schema
 */
function convertInputSchema(schema: ToolParameterSchema): AnthropicInputSchema {
  const base: AnthropicInputSchema = {
    type: "object",
  };

  // 转换属性
  if (schema.properties) {
    base.properties = convertProperties(schema.properties);
  }

  // 添加必需字段
  if (schema.required && schema.required.length > 0) {
    base.required = schema.required;
  }

  return base;
}

/**
 * 转换属性定义
 *
 * @param properties - Krebs 属性定义
 * @returns Anthropic 属性定义
 */
function convertProperties(
  properties: Record<string, ToolParameterSchema>
): Record<string, AnthropicPropertySchema> {
  const result: Record<string, AnthropicPropertySchema> = {};

  for (const [key, value] of Object.entries(properties)) {
    result[key] = convertProperty(value);
  }

  return result;
}

/**
 * 转换单个属性
 *
 * @param property - Krebs 属性定义
 * @returns Anthropic 属性定义
 */
function convertProperty(property: ToolParameterSchema): AnthropicPropertySchema {
  const base: any = {
    type: property.type,
  };

  // 添加描述
  if (property.description) {
    base.description = property.description;
  }

  // 处理 enum
  if (property.enum && property.enum.length > 0) {
    base.enum = property.enum;
  }

  // 处理对象
  if (property.type === "object" && property.properties) {
    base.properties = convertProperties(property.properties);
  }

  // 处理数组
  if (property.type === "array") {
    // 数组元素类型处理
    // 简化处理：假设所有数组元素都是字符串
    base.items = { type: "string" };
  }

  // 处理数字限制（从 TypeBox 等格式中提取）
  // 这里简化处理，实际项目中可能需要更复杂的逻辑

  return base as AnthropicPropertySchema;
}

/**
 * Anthropic 适配器类
 */
export class AnthropicAdapter extends BaseAdapter<AnthropicToolDeclaration> {
  readonly platform = "anthropic";

  adaptTool(tool: Tool): AnthropicToolDeclaration {
    return adaptToolForAnthropic(tool);
  }

  adaptTools(tools: Tool[]): AnthropicToolDeclaration[] {
    return adaptToolsForAnthropic(tools);
  }

  validateDeclaration(declaration: AnthropicToolDeclaration): boolean {
    if (!declaration.name || typeof declaration.name !== "string") {
      return false;
    }

    if (!declaration.description || typeof declaration.description !== "string") {
      return false;
    }

    if (declaration.input_schema.type !== "object") {
      return false;
    }

    return true;
  }

  getDefaults() {
    return {
      model: "claude-3-5-sonnet-20241022",
      temperature: 0.7,
      max_tokens: 4096,
    };
  }
}

/**
 * 导出单例
 */
export const anthropicAdapter = new AnthropicAdapter();
