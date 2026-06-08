/**
 * Lua 工具注册表
 *
 * 维护 Map<string, LuaScript>，存储所有可用的 Lua 工具
 * 提供从 .lua 文件解析元信息并生成 ToolDefinition 的能力
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { luaRuntime } from "./lua-runtime.js";

export interface LuaScript {
  name: string;
  script: string;
  description?: string;
}

export interface LuaToolMeta {
  name: string;
  description: string;
  params: Record<string, { type: string; description: string }>;
  script: string;
}

const luaToolMap: Map<string, LuaScript> = new Map();

/**
 * 注册一个 Lua 工具
 */
export function registerLuaTool(
  name: string,
  script: string,
  description?: string
): void {
  luaToolMap.set(name, { name, script, description });
}

/**
 * 注销一个 Lua 工具
 */
export function unregisterLuaTool(name: string): boolean {
  return luaToolMap.delete(name);
}

/**
 * 根据名称获取 Lua 工具
 */
export function getLuaTool(name: string): LuaScript | undefined {
  return luaToolMap.get(name);
}

/**
 * 获取所有 Lua 工具
 */
export function getAllLuaTools(): LuaScript[] {
  return Array.from(luaToolMap.values());
}

/**
 * 获取所有 Lua 工具名称
 */
export function listLuaToolNames(): string[] {
  return Array.from(luaToolMap.keys());
}

/**
 * 清空注册表
 */
export function clearRegistry(): void {
  luaToolMap.clear();
}

/**
 * 从目录加载所有 .lua 文件
 * 文件名转换: "string-upper.lua" -> "string.upper"
 */
export async function loadLuaToolsFromDirectory(
  dirPath: string
): Promise<number> {
  const { readdirSync, existsSync } = await import("node:fs");

  if (!existsSync(dirPath)) {
    return 0;
  }

  const files = readdirSync(dirPath).filter((f) => f.endsWith(".lua"));
  let count = 0;

  for (const file of files) {
    const name = file.replace(".lua", "").replace(/-/g, ".");
    const filePath = join(dirPath, file);
    const script = await readFile(filePath, "utf-8");
    registerLuaTool(name, script);
    count++;
  }

  return count;
}

/**
 * 解析 Lua 文件元信息
 */
export function parseLuaMetadata(
  content: string,
  filename: string
): LuaToolMeta {
  const lines = content.split("\n");
  const meta: Partial<LuaToolMeta> = {
    params: {},
  };
  const scriptLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("-- name:")) {
      meta.name = line.replace("-- name:", "").trim();
    } else if (line.startsWith("-- description:")) {
      meta.description = line.replace("-- description:", "").trim();
    } else if (line.startsWith("-- params:")) {
      const paramsStr = line.replace("-- params:", "").trim();
      try {
        meta.params = JSON.parse(paramsStr);
      } catch {
        meta.params = {};
      }
    } else if (!line.trim().startsWith("--")) {
      scriptLines.push(line);
    }
  }

  // 如果没有显式 name，从文件名推导
  if (!meta.name) {
    meta.name = filename.replace(".lua", "").replace(/-/g, ".");
  }

  // 如果没有描述，使用空字符串
  if (!meta.description) {
    meta.description = "";
  }

  meta.script = scriptLines.join("\n").trim();
  return meta as LuaToolMeta;
}

/**
 * 从 LuaToolMeta 创建 ToolDefinition
 */
export function createToolDefinition(meta: LuaToolMeta): ToolDefinition {
  // "file.write" → "file_write"
  const toolName = meta.name.replace(/\./g, "_");

  // 构建 TypeBox 参数 schema
  const paramProps: Record<string, any> = {};
  for (const [key, val] of Object.entries(meta.params)) {
    paramProps[key] = Type.String({ description: val.description || "" });
  }

  const script = meta.script;

  return {
    name: toolName,
    label: meta.name,
    description: meta.description,
    parameters: Type.Object(paramProps),
    execute: async (_, params, _signal, _onUpdate, _ctx) => {
      try {
        const result = await luaRuntime.execute(script, params as Record<string, unknown> | undefined);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result) },
          ],
          details: {},
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: false, error: error.message }),
            },
          ],
          details: {},
        };
      }
    },
  };
}

/**
 * 从目录加载 .lua 文件并生成 ToolDefinition 数组
 */
export async function loadLuaToolDefinitions(
  dirPath: string
): Promise<ToolDefinition[]> {
  const { readdirSync, existsSync } = await import("node:fs");

  if (!existsSync(dirPath)) {
    return [];
  }

  const files = readdirSync(dirPath).filter((f) => f.endsWith(".lua"));
  const definitions: ToolDefinition[] = [];

  for (const file of files) {
    const filePath = join(dirPath, file);
    const content = await readFile(filePath, "utf-8");
    const meta = parseLuaMetadata(content, file);
    const def = createToolDefinition(meta);
    definitions.push(def);
  }

  return definitions;
}
