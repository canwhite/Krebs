/**
 * Sandbox Module - wasmtime + wasi-coreutils 沙箱执行
 *
 * 读操作 → 透传到原 bash 工具
 * 写操作 → 通过 wasi-coreutils 沙箱执行
 */

export { createWasmtimeExecutor, getDefaultExecutor, type WasmtimeExecutor, type ExecResult } from "./executor";
export { createSandboxBashTool } from "./tools/bash";
export type { BashTool, BashToolParams } from "./tools/types";
