/**
 * lua_exec 工具
 *
 * AI 可通过此工具调用预注册的 Lua 脚本
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { luaRuntime } from "./lua-runtime.js";
import { getLuaTool, listLuaToolNames } from "./lua-tools-registry.js";

export interface LuaExecParams {
  tool_name: string;
  params?: Record<string, unknown>;
}

export const luaExecTool: ToolDefinition = {
  name: "lua_exec",
  label: "Execute Lua Tool",
  description:
    "Executes a Lua script by name with optional parameters. Use this to run pre-registered Lua tools.",
  parameters: Type.Object({
    tool_name: Type.String({
      description:
        "Name of the Lua tool to execute (e.g., 'string.upper')",
    }),
    params: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: "Parameters to pass to the Lua script as a key-value table",
      })
    ),
  }),

  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    const { tool_name, params: luaParams } = params as LuaExecParams;

    // 1. 查找 Lua 脚本
    const luaTool = getLuaTool(tool_name);
    if (!luaTool) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: `Lua tool not found: ${tool_name}`,
                available: listLuaToolNames(),
              },
              null,
              2
            ),
          },
        ],
        details: {},
      };
    }

    // 2. 执行 Lua 脚本
    try {
      const result = await luaRuntime.execute(luaTool.script, luaParams);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                result,
              },
              null,
              2
            ),
          },
        ],
        details: {},
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
                tool: tool_name,
              },
              null,
              2
            ),
          },
        ],
        details: {},
      };
    }
  },
};
