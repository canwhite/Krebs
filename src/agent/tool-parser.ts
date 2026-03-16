/**
 * 工具调用解析器
 *
 * 用于从模型响应中解析工具调用
 * 主要用于不支持 Function Calling 的模型（如 DeepSeek）
 */

import type { Tool } from "./tools/index.js";

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  confidence: number; // 0-1, 表示解析的可信度
}

/**
 * 从文本中解析工具调用
 *
 * 支持多种格式：
 * - `tool_name "arg1" "arg2"`
 * - `tool_name(arg1="value1", arg2="value2")`
 * - ```bash tool_name "arg" ```
 * - markdown 代码块中的工具调用
 */
export function parseToolCallsFromText(
  text: string,
  availableTools: Tool[]
): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];
  const toolNames = new Set(availableTools.map(t => t.name));

  // 模式 1: `tool_name "arg"` 格式
  const pattern1 = /`(\w+)\s+([^`]+)`/g;
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    const toolName = match[1];
    const argsStr = match[2];

    if (toolNames.has(toolName)) {
      const args = parseArgumentsString(argsStr, toolName, availableTools);
      toolCalls.push({
        name: toolName,
        args,
        confidence: 0.8,
      });
    }
  }

  // 模式 2: tool_name(arg1="value", arg2="value") 格式
  const pattern2 = /(\w+)\s*\(\s*([^)]+)\s*\)/g;
  while ((match = pattern2.exec(text)) !== null) {
    const toolName = match[1];
    const argsStr = match[2];

    if (toolNames.has(toolName)) {
      const args = parseKeyValueArguments(argsStr);
      toolCalls.push({
        name: toolName,
        args,
        confidence: 0.9,
      });
    }
  }

  // 模式 3: ```bash ... ``` 代码块中的命令
  const pattern3 = /```bash\s*([\s\S]*?)```/g;
  while ((match = pattern3.exec(text)) !== null) {
    const bashContent = match[1].trim();
    const bashToolCalls = parseBashToolCalls(bashContent, availableTools);
    toolCalls.push(...bashToolCalls);
  }

  // 模式 4: 直接文本描述 "使用 tool_name 来..."
  const pattern4 = /使用\s+(\w+)\s+(?:来|去|获取|搜索|执行)/g;
  while ((match = pattern4.exec(text)) !== null) {
    const toolName = match[1];
    if (toolNames.has(toolName)) {
      // 这种方式需要从上下文推断参数，置信度较低
      toolCalls.push({
        name: toolName,
        args: {},
        confidence: 0.3,
      });
    }
  }

  // 去重（相同工具只保留置信度最高的）
  const uniqueToolCalls = new Map<string, ParsedToolCall>();
  for (const tc of toolCalls) {
    const key = JSON.stringify({ name: tc.name, args: tc.args });
    const existing = uniqueToolCalls.get(key);
    if (!existing || tc.confidence > existing.confidence) {
      uniqueToolCalls.set(key, tc);
    }
  }

  // 过滤掉置信度太低的
  return Array.from(uniqueToolCalls.values()).filter(tc => tc.confidence > 0.5);
}

/**
 * 解析参数字符串 (arg1 arg2 arg3)
 */
function parseArgumentsString(
  argsStr: string,
  toolName: string,
  availableTools: Tool[]
): Record<string, unknown> {
  const tool = availableTools.find(t => t.name === toolName);
  if (!tool) return {};

  const args: Record<string, unknown> = {};
  const parameters = tool.inputSchema?.properties || {};

  // 简单的引号分割
  const matches = argsStr.matchAll(/"([^"]+)"/g);
  const paramNames = Object.keys(parameters);
  let i = 0;

  for (const match of matches) {
    if (i < paramNames.length) {
      args[paramNames[i]] = match[1];
      i++;
    }
  }

  return args;
}

/**
 * 解析键值对参数 (arg1="value", arg2="value")
 */
function parseKeyValueArguments(argsStr: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  const pattern = /(\w+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(argsStr)) !== null) {
    args[match[1]] = match[2];
  }

  return args;
}

/**
 * 从 bash 命令中解析工具调用
 */
function parseBashToolCalls(
  bashContent: string,
  availableTools: Tool[]
): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];

  // 查找工具调用模式
  for (const tool of availableTools) {
    const pattern = new RegExp(`${tool.name}\\s+"([^"]+)"`, 'g');
    let match;
    while ((match = pattern.exec(bashContent)) !== null) {
      toolCalls.push({
        name: tool.name,
        args: parseArgumentsString(match[0], tool.name, availableTools),
        confidence: 0.85,
      });
    }
  }

  return toolCalls;
}

/**
 * 生成工具调用 ID
 */
export function generateToolCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
