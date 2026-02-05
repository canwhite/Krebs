/**
 * DeepSeek 平台适配器
 *
 * 将 Krebs 工具定义转换为 DeepSeek API 格式
 * DeepSeek 使用 OpenAI 兼容的格式
 */

import type { Tool } from "../types.js";
import type { ToolParameterSchema } from "../types.js";

/**
 * DeepSeek 工具声明格式（OpenAI 兼容）
 */
export interface DeepSeekToolDeclaration {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: DeepSeekParameterSchema;
  };
}

/**
 * DeepSeek 参数 Schema 格式
 */
export interface DeepSeekParameterSchema {
  type: "object";
  properties: Record<string, DeepSeekPropertySchema>;
  required?: string[];
}

/**
 * DeepSeek 属性 Schema 格式
 */
export type DeepSeekPropertySchema =
  | { type: "string"; description?: string; enum?: string[] }
  | { type: "number"; description?: string; minimum?: number; maximum?: number }
  | { type: "integer"; description?: string; minimum?: number; maximum?: number }
  | { type: "boolean"; description?: string }
  | { type: "array"; items: DeepSeekPropertySchema; description?: string }
  | { type: "object"; properties: Record<string, DeepSeekPropertySchema>; description?: string };

/**
 * 将单个工具适配为 DeepSeek 格式
 *
 * @param tool - Krebs 工具定义
 * @returns DeepSeek 工具声明
 */
export function adaptToolForDeepSeek(tool: Tool): DeepSeekToolDeclaration {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertInputSchema(tool.inputSchema),
    },
  };
}

/**
 * 批量适配工具
 *
 * @param tools - Krebs 工具列表
 * @returns DeepSeek 工具声明列表
 */
export function adaptToolsForDeepSeek(tools: Tool[]): DeepSeekToolDeclaration[] {
  return tools.map(adaptToolForDeepSeek);
}

/**
 * 转换参数 Schema
 *
 * 将 Krebs 的 ToolParameterSchema 转换为 DeepSeek 格式
 *
 * @param schema - Krebs 参数 Schema
 * @returns DeepSeek 参数 Schema
 */
function convertInputSchema(schema: ToolParameterSchema): DeepSeekParameterSchema {
  const base = {
    type: "object" as const,
    properties: convertProperties(schema.properties || {}),
    required: schema.required || [],
  };

  return base;
}

/**
 * 转换属性定义
 *
 * @param properties - Krebs 属性定义
 * @returns DeepSeek 属性定义
 */
function convertProperties(
  properties: Record<string, ToolParameterSchema>
): Record<string, DeepSeekPropertySchema> {
  const result: Record<string, DeepSeekPropertySchema> = {};

  for (const [key, value] of Object.entries(properties)) {
    result[key] = convertProperty(value);
  }

  return result;
}

/**
 * 转换单个属性
 *
 * @param property - Krebs 属性定义
 * @returns DeepSeek 属性定义
 */
function convertProperty(property: ToolParameterSchema): DeepSeekPropertySchema {
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

  // 处理数组
  if (property.type === "array") {
    // TypeBox 数组格式需要特殊处理
    // 这里简化处理，假设所有数组元素都是字符串
    return base as DeepSeekPropertySchema;
  }

  // 处理对象
  if (property.type === "object" && property.properties) {
    base.properties = convertProperties(property.properties);
  }

  // 处理数字限制
  if (property.type === "number") {
    // 从 TypeBox 或其他约束中提取
    // 这里简化处理
  }

  return base as DeepSeekPropertySchema;
}

/**
 * 验证工具声明是否有效
 *
 * @param declaration - DeepSeek 工具声明
 * @returns 是否有效
 */
export function validateDeepSeekToolDeclaration(declaration: DeepSeekToolDeclaration): boolean {
  if (declaration.type !== "function") {
    return false;
  }

  const { name, description, parameters } = declaration.function;

  if (!name || typeof name !== "string") {
    return false;
  }

  if (!description || typeof description !== "string") {
    return false;
  }

  if (parameters.type !== "object") {
    return false;
  }

  if (!parameters.properties || typeof parameters.properties !== "object") {
    return false;
  }

  return true;
}

/**
 * 创建工具使用示例（用于调试）
 *
 * @param declaration - DeepSeek 工具声明
 * @returns 工具使用示例
 */
export function createToolUsageExample(declaration: DeepSeekToolDeclaration): string {
  const { name, parameters } = declaration.function;

  const requiredParams = parameters.required || [];
  const exampleArgs: Record<string, any> = {};

  // 为必需参数生成示例值
  for (const param of requiredParams) {
    const paramDef = parameters.properties[param];
    if (!paramDef) continue;

    switch (paramDef.type) {
      case "string":
        exampleArgs[param] = `<${param}>`;
        break;
      case "number":
      case "integer":
        exampleArgs[param] = 0;
        break;
      case "boolean":
        exampleArgs[param] = true;
        break;
      case "array":
        exampleArgs[param] = [];
        break;
      case "object":
        exampleArgs[param] = {};
        break;
    }
  }

  return JSON.stringify({ name, arguments: exampleArgs }, null, 2);
}

/**
 * 导出工具声明为 JSON（用于配置文件）
 *
 * @param declarations - DeepSeek 工具声明列表
 * @returns JSON 字符串
 */
export function exportDeclarationsAsJSON(declarations: DeepSeekToolDeclaration[]): string {
  return JSON.stringify(declarations, null, 2);
}
