/**
 * 内置工具实现
 *
 * 提供 bash、read、write、web_search、web_fetch 等基础工具
 */

import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { createLogger } from "@/shared/logger.js";

import type { Tool } from "./types.js";
import { webSearchTool, webFetchTool } from "./web.js";
import { createSpawnSubagentTool } from "./spawn-subagent.js";

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
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000, range: 1000-120000). For network requests, consider increasing this value.",
      },
    },
    required: ["command"],
  },

  async execute(params): Promise<{ success: boolean; output?: string; error?: string }> {
    const command = params.command as string;
    const cwd = params.cwd as string | undefined;
    const timeout = (params.timeout as number) || 30000;

    // 限制超时范围：1秒 - 120秒
    const actualTimeout = Math.min(Math.max(timeout, 1000), 120000);

    if (!command || typeof command !== "string") {
      return {
        success: false,
        error: "Command is required and must be a string",
      };
    }

    return new Promise((resolve) => {
      const startTime = Date.now();

      logger.debug(`Executing bash command: ${command} (timeout: ${actualTimeout}ms)`);

      let capturedOutput = "";
      let capturedError = "";

      const childProcess = exec(
        command,
        {
          cwd: cwd || process.cwd(),
          timeout: actualTimeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        },
        (error, stdout, stderr) => {
          const duration = Date.now() - startTime;

          // 捕获输出
          if (stdout) capturedOutput = stdout;
          if (stderr) capturedError = stderr;

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
        logger.error(`Bash command timeout: ${command} after ${actualTimeout}ms`);
        childProcess.kill("SIGKILL");

        resolve({
          success: false,
          error: `Command timed out after ${actualTimeout}ms. ` +
                 `For network requests, try increasing the timeout parameter or using curl's --max-time option.`,
          output: capturedError || capturedOutput,
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
 * Edit 工具
 *
 * 编辑文件内容（精确字符串替换）
 */
export const editTool: Tool = {
  name: "edit_file",
  description: "Make precise edits to a file by replacing exact string matches. Use this to modify specific parts of a file without rewriting the entire content.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path to the file to edit",
      },
      oldString: {
        type: "string",
        description: "The exact string to replace. Must match exactly (case-sensitive)",
      },
      newString: {
        type: "string",
        description: "The new string to replace the old string with",
      },
      replaceAll: {
        type: "boolean",
        description: "Replace all occurrences (default: false, only replaces first match)",
      },
    },
    required: ["path", "oldString", "newString"],
  },

  async execute(params): Promise<{ success: boolean; message?: string; error?: string }> {
    const filePath = params.path as string;
    const oldString = params.oldString as string;
    const newString = params.newString as string;
    const replaceAll = params.replaceAll as boolean || false;

    // 参数验证
    if (!filePath || typeof filePath !== "string") {
      return {
        success: false,
        error: "Path is required and must be a string",
      };
    }

    if (!oldString || typeof oldString !== "string") {
      return {
        success: false,
        error: "oldString is required and must be a string",
      };
    }

    if (newString === null || newString === undefined) {
      return {
        success: false,
        error: "newString is required",
      };
    }

    try {
      // 读取文件内容
      const content = await fs.readFile(filePath, "utf-8");

      // 检查 oldString 是否存在
      if (!content.includes(oldString)) {
        return {
          success: false,
          error: `Could not find the specified oldString in the file. The exact string was not found.`,
        };
      }

      // 执行替换
      let newContent: string;
      let replacements = 0;

      if (replaceAll) {
        // 替换所有匹配项
        const matches = content.split(oldString);
        replacements = matches.length - 1;
        newContent = content.split(oldString).join(newString);
      } else {
        // 只替换第一个匹配项
        const index = content.indexOf(oldString);
        if (index !== -1) {
          replacements = 1;
          newContent = content.substring(0, index) + newString + content.substring(index + oldString.length);
        } else {
          newContent = content;
        }
      }

      // 写回文件
      await fs.writeFile(filePath, newContent, "utf-8");

      logger.debug(`File edited successfully: ${filePath}`, {
        replacements,
        replaceAll,
      });

      return {
        success: true,
        message: `Successfully replaced ${replacements} occurrence(s) in ${filePath}`,
      };
    } catch (error) {
      // 文件不存在错误
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return {
          success: false,
          error: `File not found: ${filePath}. Use write_file to create new files.`,
        };
      }

      logger.error(`Failed to edit file: ${filePath}`, error);

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
export function getBuiltinTools(
  getSessionKey?: () => string,
  getDisplayName?: () => string,
  getRegistry?: () => any,
): Tool[] {
  const tools = [bashTool, readTool, writeTool, editTool];

  // spawn_subagent 工具始终包含在列表中
  // 但执行时会检查依赖是否可用
  if (getSessionKey && getDisplayName && getRegistry) {
    tools.push(
      createSpawnSubagentTool(getSessionKey, getDisplayName, getRegistry),
    );
  } else {
    // 如果依赖不可用，创建一个返回错误的版本
    tools.push(
      createSpawnSubagentTool(
        () => "unknown",
        () => "unknown",
        () => undefined,
      ),
    );
  }

  // 将 web 工具放在最后
  tools.push(webFetchTool, webSearchTool);

  return tools;
}
