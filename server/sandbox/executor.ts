/**
 * Wasmtime Executor - 混合模式
 *
 * 读操作 → 直接通过 Node.js fs（穿透 host）
 * 写操作 → 通过 wasmtime + coreutils（沙箱执行）
 */

import { spawn } from "child_process";
import { join } from "path";
import {
  readdir,
  readFile,
  stat,
  access,
} from "fs/promises";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface WasmtimeExecutor {
  run(
    command: string,
    args: string[],
    opts: {
      cwd: string;
      env?: Record<string, string>;
    }
  ): Promise<ExecResult>;
}

interface WasmtimeOptions {
  wasmtimePath?: string;
  coreutilsPath?: string;
}

// 读命令 - 直接穿透 host
const READ_COMMANDS = new Set([
  "ls", "cat", "head", "tail", "wc", "sort", "uniq", "grep", "find", "xargs", "stat", "test",
]);

// 写命令 - 走沙箱
const WRITE_COMMANDS = new Set([
  "echo", "mkdir", "rm", "rmdir", "cp", "mv", "touch", "chmod", "chown",
]);

function isReadCommand(cmd: string): boolean {
  return READ_COMMANDS.has(cmd);
}

function isWriteCommand(cmd: string): boolean {
  return WRITE_COMMANDS.has(cmd);
}

/**
 * 创建混合模式的 Wasmtime Executor
 *
 * 读命令直接用 Node.js fs，写命令用 wasmtime + coreutils
 */
export function createWasmtimeExecutor(options: WasmtimeOptions = {}): WasmtimeExecutor {
  const wasmtimePath =
    options.wasmtimePath || join(process.cwd(), "wasm", "bin", "wasmtime");
  const coreutilsPath =
    options.coreutilsPath ||
    join(process.cwd(), "wasm", "coreutils");
  const wasmFile = join(coreutilsPath, "coreutils-0.9.0-wasm32-wasip1", "coreutils.wasm");

  return {
    async run(
      command: string,
      args: string[],
      opts: { cwd: string; env?: Record<string, string> }
    ): Promise<ExecResult> {
      // 读命令 - 穿透 host
      if (isReadCommand(command)) {
        return runReadCommand(command, args, opts);
      }

      // 写命令 - 沙箱执行
      if (isWriteCommand(command)) {
        return runWriteCommand(wasmtimePath, wasmFile, command, args, opts);
      }

      // 未知命令，尝试沙箱执行
      return runWriteCommand(wasmtimePath, wasmFile, command, args, opts);
    },
  };
}

/**
 * 读命令直接通过 Node.js fs 执行
 */
async function runReadCommand(
  command: string,
  args: string[],
  opts: { cwd: string }
): Promise<ExecResult> {
  const { cwd } = opts;

  try {
    switch (command) {
      case "ls": {
        // ls [path]
        const targetPath = args[0] ? join(cwd, args[0]!) : cwd;
        const entries = await readdir(targetPath);
        return { stdout: entries.join("\n") + "\n", stderr: "", exitCode: 0 };
      }

      case "cat": {
        // cat <file>
        if (args.length === 0) {
          return { stdout: "", stderr: "cat: missing operand\n", exitCode: 1 };
        }
        const filePath = args[0]!;
        const content = await readFile(join(cwd, filePath), "utf-8");
        return { stdout: content, stderr: "", exitCode: 0 };
      }

      case "head": {
        // head [-n <lines>] <file>
        const nIndex = args.indexOf("-n");
        const lines = nIndex >= 0 ? parseInt(args[nIndex + 1]!) || 10 : 10;
        const fileArg = nIndex >= 0 ? args[nIndex + 2] || args[nIndex - 1] : args[0];
        if (!fileArg) {
          return { stdout: "", stderr: "head: missing operand\n", exitCode: 1 };
        }
        const content = await readFile(join(cwd, fileArg), "utf-8");
        const lines_arr = content.split("\n").slice(0, lines);
        return { stdout: lines_arr.join("\n") + "\n", stderr: "", exitCode: 0 };
      }

      case "tail": {
        // tail [-n <lines>] <file>
        const nIndex = args.indexOf("-n");
        const lines = nIndex >= 0 ? parseInt(args[nIndex + 1]!) || 10 : 10;
        const fileArg = nIndex >= 0 ? args[nIndex + 2] || args[nIndex - 1] : args[0];
        if (!fileArg) {
          return { stdout: "", stderr: "tail: missing operand\n", exitCode: 1 };
        }
        const content = await readFile(join(cwd, fileArg), "utf-8");
        const lines_arr = content.split("\n").slice(-lines);
        return { stdout: lines_arr.join("\n") + "\n", stderr: "", exitCode: 0 };
      }

      case "wc": {
        // wc [-l] <file>
        const fileArg = args[args.length - 1];
        if (!fileArg || fileArg.startsWith("-")) {
          return { stdout: "", stderr: "wc: missing operand\n", exitCode: 1 };
        }
        const content = await readFile(join(cwd, fileArg), "utf-8");
        const lineCount = content.split("\n").length - 1;
        const wordCount = content.split(/\s+/).filter(Boolean).length;
        const charCount = content.length;
        if (args.includes("-l")) {
          return { stdout: `${lineCount}\n`, stderr: "", exitCode: 0 };
        }
        return { stdout: `${lineCount} ${wordCount} ${charCount}\n`, stderr: "", exitCode: 0 };
      }

      case "stat": {
        // stat <file>
        if (args.length === 0) {
          return { stdout: "", stderr: "stat: missing operand\n", exitCode: 1 };
        }
        const filePath = join(cwd, args[0]!);
        const s = await stat(filePath);
        const size = s.size;
        const mtime = s.mtime.toISOString();
        return {
          stdout: `  File: ${args[0]}\n  Size: ${size}\n  Modified: ${mtime}\n`,
          stderr: "",
          exitCode: 0,
        };
      }

      case "test": {
        // test -e <file> 等
        if (args.includes("-e") || args.includes("-f")) {
          const idx = args.includes("-e") ? args.indexOf("-e") : args.indexOf("-f");
          const fileArg = args[idx + 1];
          if (!fileArg) {
            return { stdout: "", stderr: "", exitCode: 1 };
          }
          try {
            await access(join(cwd, fileArg));
            return { stdout: "", stderr: "", exitCode: 0 };
          } catch {
            return { stdout: "", stderr: "", exitCode: 1 };
          }
        }
        return { stdout: "", stderr: "", exitCode: 1 };
      }

      default: {
        // 未知读命令，尝试通过沙箱执行
        return runWriteCommand(
          join(process.cwd(), "wasm", "bin", "wasmtime"),
          join(process.cwd(), "wasm", "coreutils", "coreutils-0.9.0-wasm32-wasip1", "coreutils.wasm"),
          command,
          args,
          opts
        );
      }
    }
  } catch (error: any) {
    return { stdout: "", stderr: `${command}: ${error.message}\n`, exitCode: 1 };
  }
}

/**
 * 写命令通过 wasmtime + coreutils 沙箱执行
 */
function runWriteCommand(
  wasmtimePath: string,
  wasmFile: string,
  command: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string> }
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(wasmtimePath, ["--dir", opts.cwd, wasmFile, command, ...args], {
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * 获取默认的 Wasmtime Executor 实例
 */
let defaultExecutor: WasmtimeExecutor | null = null;

export function getDefaultExecutor(): WasmtimeExecutor {
  if (!defaultExecutor) {
    defaultExecutor = createWasmtimeExecutor();
  }
  return defaultExecutor;
}
