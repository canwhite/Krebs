/**
 * Sandbox Tools 类型定义
 */

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

// Bash 工具参数类型
export const BashToolSchema = Type.Object({
  command: Type.String({
    description: "The bash command to execute",
  }),
});

export type BashToolParams = Static<typeof BashToolSchema>;

export type BashTool = ToolDefinition<
  typeof BashToolSchema,
  { exitCode: number; stderr: string }
>;
