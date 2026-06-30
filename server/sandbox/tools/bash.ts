/**
 * Sandbox Bash Tool - 只处理写操作，读操作透传到原 bash 工具
 *
 * 读命令 (ls, cat, etc.) → 透传到原 bash 工具
 * 写命令 (echo, mkdir, rm, etc.) → 沙箱执行
 */

import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { WasmtimeExecutor } from "../executor";
import type { BashTool } from "./types";
import { BashToolSchema } from "./types";
import { spawn } from "child_process";

// 写命令 - 走沙箱
const WRITE_COMMANDS = new Set([
  "echo", "mkdir", "rm", "rmdir", "cp", "mv", "touch", "chmod", "chown",
]);

function isWriteCommand(cmd: string): boolean {
  return WRITE_COMMANDS.has(cmd);
}

/**
 * 解析简单的 bash 命令（不支持管道、重定向）
 */
function parseCommand(command: string): { cmd: string; args: string[] } | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  // 检查不支持的 shell 语法
  const unsupportedPatterns = [
    /\|/,    // 管道
    />/,     // 输出重定向
    /</,     // 输入重定向
    /2>/,    // 错误重定向
    /&&/,    // 命令链
    /\|\|/,  // 条件链
    /;\s*$/, // 命令分隔符（结尾）
  ];

  for (const pattern of unsupportedPatterns) {
    if (pattern.test(trimmed)) {
      return null;
    }
  }

  // 简单分割命令和参数
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0]!;
  const args = parts.slice(1);

  return { cmd, args };
}

/**
 * 创建沙箱 Bash 工具
 * 读命令透传，写命令沙箱执行
 */
export function createSandboxBashTool(
  wasmtime: WasmtimeExecutor,
  cwd: string,
  passthroughBash: (command: string, cwd: string) => Promise<AgentToolResult<any>>
): BashTool {
  return {
    name: "bash",
    label: "bash",
    description: "Execute bash command - writes go through sandbox",
    parameters: BashToolSchema,

    async execute(
      _toolCallId: string,
      params: { command: string },
      signal: AbortSignal | undefined,
      onUpdate: any,
      _ctx: any
    ): Promise<AgentToolResult<{ exitCode: number; stderr: string }>> {
      const { command } = params;

      // 解析命令
      const parsed = parseCommand(command);
      if (!parsed) {
        return {
          content: [
            {
              type: "text",
              text: "Shell syntax not supported. Only single commands without pipes, redirects, or chaining are allowed.",
            },
          ],
          details: { exitCode: 1, stderr: "Unsupported shell syntax" },
        };
      }

      // 读命令 - 透传到原 bash 工具
      if (!isWriteCommand(parsed.cmd)) {
        try {
          return await passthroughBash(command, cwd);
        } catch (error) {
          return {
            content: [{ type: "text", text: String(error) }],
            details: { exitCode: 1, stderr: String(error) },
          };
        }
      }

      // 写命令 - 检查是否在白名单
      const allowedCommands = [
        "echo", "mkdir", "rm", "rmdir",
        "cp", "mv", "touch", "chmod", "chown",
      ];

      if (!allowedCommands.includes(parsed.cmd)) {
        return {
          content: [
            {
              type: "text",
              text: `Write command '${parsed.cmd}' not allowed in sandbox. Allowed: ${allowedCommands.join(", ")}`,
            },
          ],
          details: { exitCode: 1, stderr: "Command not allowed" },
        };
      }

      // 沙箱执行
      try {
        const result = await wasmtime.run(parsed.cmd, parsed.args, { cwd });

        return {
          content: [{ type: "text", text: result.stdout || (result.exitCode !== 0 ? result.stderr : "") }],
          details: { exitCode: result.exitCode, stderr: result.stderr },
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: String(error) }],
          details: { exitCode: 1, stderr: String(error) },
        };
      }
    },
  };
}
