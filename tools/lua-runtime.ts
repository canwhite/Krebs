/**
 * wasmoon Lua WASM 运行时单例
 *
 * 使用单例模式管理 wasmoon Lua 虚拟机实例
 * 提供 JS-Lua 桥接能力
 */

import { LuaFactory } from "wasmoon";
import { join } from "node:path";

let luaEngine: any = null;
let initPromise: Promise<void> | null = null;

interface LuaRuntime {
  initialize(): Promise<void>;
  execute(script: string, params?: Record<string, unknown>): Promise<unknown>;
  isReady(): boolean;
  registerJsFunction(name: string, fn: (...args: any[]) => any): void;
}

/**
 * 异步锁，保证并发安全
 */
class AsyncMutex {
  private mutex = Promise.resolve();

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    // 捕获当前的 mutex 链
    const release = this.mutex;

    // 创建新的锁
    let unlock: () => void;
    const lock = new Promise<void>((resolve) => {
      unlock = resolve;
    });

    // 将新锁添加到链中
    this.mutex = this.mutex.then(async () => {
      await lock;
    });

    try {
      // 等待之前的操作完成
      await release;
      // 执行当前操作
      return await fn();
    } finally {
      // 释放锁
      unlock!();
    }
  }
}

const mutex = new AsyncMutex();
const DEFAULT_TIMEOUT_MS = 5000;
const CUSTOM_DIR = join(process.cwd(), "custom");

/**
 * 安全路径校验
 */
function validatePath(path: string): string {
  if (path.startsWith("/")) {
    throw new Error("Absolute paths not allowed");
  }
  if (path.includes("..")) {
    throw new Error("Path traversal not allowed");
  }
  const fullPath = join(CUSTOM_DIR, path);
  if (!fullPath.startsWith(CUSTOM_DIR)) {
    throw new Error("Path traversal detected");
  }
  return fullPath;
}

export const luaRuntime: LuaRuntime = {
  async initialize(): Promise<void> {
    if (luaEngine) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const factory = new LuaFactory();
      luaEngine = await factory.createEngine();

      // ===== 注册 JS 桥接函数 =====

      // 时间相关
      luaEngine.global.set("js_now", () => Date.now());

      luaEngine.global.set(
        "js_format_date",
        (ts: number, tz?: string) => {
          return new Date(ts).toLocaleString("zh-CN", {
            timeZone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
        }
      );

      // 数学相关
      luaEngine.global.set(
        "js_random",
        (min: number, max: number) => {
          return (
            Math.floor(Math.random() * (max - min + 1)) + min
          );
        }
      );

      // 文件操作相关
      luaEngine.global.set(
        "js_write_file",
        async (path: string, content: string) => {
          const fs = await import("node:fs/promises");
          const safePath = validatePath(path);
          await fs.writeFile(safePath, content, "utf-8");
          return { success: true, path: safePath };
        }
      );

      luaEngine.global.set("js_read_file", async (path: string) => {
        const fs = await import("node:fs/promises");
        const safePath = validatePath(path);
        const content = await fs.readFile(safePath, "utf-8");
        return { success: true, content };
      });

      luaEngine.global.set("js_exists", async (path: string) => {
        const fs = await import("node:fs/promises");
        try {
          await fs.access(validatePath(path));
          return true;
        } catch {
          return false;
        }
      });
    })();

    await initPromise;
  },

  isReady(): boolean {
    return luaEngine !== null;
  },

  async execute(
    script: string,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.isReady()) {
      await this.initialize();
    }

    return mutex.withLock(async () => {
      const lua = luaEngine;

      // 将 params 设置为全局变量
      if (params) {
        lua.global.set("params", params);
      }

      // 执行脚本，params 通过全局变量访问
      const wrappedScript = `
        local params = params
        ${script}
      `;

      // 执行，带超时
      const result = await Promise.race([
        lua.doString(wrappedScript),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Lua execution timeout")),
            DEFAULT_TIMEOUT_MS
          )
        ),
      ]);

      return result;
    });
  },

  registerJsFunction(name: string, fn: (...args: any[]) => any): void {
    if (!luaEngine) throw new Error("Lua engine not initialized");
    luaEngine.global.set(name, fn);
  },
};
