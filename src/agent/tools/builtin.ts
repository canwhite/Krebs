/**
 * 内置工具实现
 *
 * 提供 bash、read、write 等基础工具
 */

import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { createLogger } from "@/shared/logger.js";

import type { Tool } from "./types.js";

const logger = createLogger("BuiltinTools");

/**
 * Bash 工具
 *
 * 执行 shell 命令
 */
export const bashTool: Tool = {
  name: "bash",
  description: "Execute a bash shell command and return the output. Use this for running commands, scripts, and any shell operations.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute",
      },
      cwd: {
        type: "string",
        description: "The working directory for the command (optional, defaults to current directory)",
      },
    },
    required: ["command"],
  },

  async execute(params): Promise<{ success: boolean; output?: string; error?: string }> {
    const command = params.command as string;
    const cwd = params.cwd as string | undefined;

    if (!command || typeof command !== "string") {
      return {
        success: false,
        error: "Command is required and must be a string",
      };
    }

    return new Promise((resolve) => {
      const startTime = Date.now();
      const timeout = 30000; // 30 秒超时

      logger.debug(`Executing bash command: ${command}`);

      const childProcess = exec(
        command,
        {
          cwd: cwd || process.cwd(),
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        },
        (error, stdout, stderr) => {
          const duration = Date.now() - startTime;

          if (error) {
            logger.error(`Bash command failed: ${command}`, {
              error: error.message,
              duration,
            });

            resolve({
              success: false,
              error: error.message,
              output: stderr || stdout,
            });
            return;
          }

          logger.debug(`Bash command succeeded: ${command}`, {
            duration,
          });

          resolve({
            success: true,
            output: stdout,
          });
        }
      );

      // 处理超时
      childProcess.on("timeout", () => {
        logger.error(`Bash command timeout: ${command}`);
        childProcess.kill("SIGKILL");

        resolve({
          success: false,
          error: `Command timed out after ${timeout}ms`,
        });
      });
    });
  },
};

/**
 * Read 工具
 *
 * 读取文件内容
 */
export const readTool: Tool = {
  name: "read_file",
  description: "Read the contents of a file. Returns the file content as a string.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path to the file to read",
      },
    },
    required: ["path"],
  },

  async execute(params): Promise<{ success: boolean; data?: string; error?: string }> {
    const filePath = params.path as string;

    if (!filePath || typeof filePath !== "string") {
      return {
        success: false,
        error: "Path is required and must be a string",
      };
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");

      logger.debug(`File read successfully: ${filePath}`, {
        size: content.length,
      });

      return {
        success: true,
        data: content,
      };
    } catch (error) {
      logger.error(`Failed to read file: ${filePath}`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

/**
 * Write 工具
 *
 * 写入文件内容
 */
export const writeTool: Tool = {
  name: "write_file",
  description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path to the file to write",
      },
      content: {
        type: "string",
        description: "The content to write to the file",
      },
    },
    required: ["path", "content"],
  },

  async execute(params): Promise<{ success: boolean; error?: string }> {
    const filePath = params.path as string;
    const content = params.content as string;

    if (!filePath || typeof filePath !== "string") {
      return {
        success: false,
        error: "Path is required and must be a string",
      };
    }

    if (content === null || content === undefined) {
      return {
        success: false,
        error: "Content is required",
      };
    }

    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // 写入文件
      await fs.writeFile(filePath, content, "utf-8");

      logger.debug(`File written successfully: ${filePath}`, {
        size: content.length,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error(`Failed to write file: ${filePath}`, error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

/**
 * 获取所有内置工具
 */
export function getBuiltinTools(): Tool[] {
  return [bashTool, readTool, writeTool];
}
