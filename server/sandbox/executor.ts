/**
 * Wasmtime Executor - 写命令沙箱执行
 *
 * 写命令 → wasmtime + coreutils
 * 读命令不在这里处理（透传到原 bash）
 */

import { spawn } from "child_process";
import { join } from "path";

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

/**
 * 创建 Wasmtime Executor
 *
 * 注意：只处理写命令，读命令应透传到原 bash
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
      return runWriteCommand(wasmtimePath, wasmFile, command, args, opts);
    },
  };
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
