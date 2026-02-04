/**
 * 统一日志系统
 *
 * 支持模块级别的日志实例，自动添加模块名称前缀
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogOptions {
  module?: string;
  level?: LogLevel;
}

class Logger {
  private level: LogLevel;
  private module?: string;

  constructor(options: LogOptions = {}) {
    this.level = options.level ?? "info";
    this.module = options.module;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  private format(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    const moduleStr = this.module ? `[${this.module}] ` : "";
    return `${timestamp} ${levelStr} ${moduleStr}${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.debug(this.format("debug", message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.info(this.format("info", message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(this.format("warn", message), ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(this.format("error", message), ...args);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * 创建子日志器，继承当前日志器的级别
   */
  withModule(moduleName: string): Logger {
    return new Logger({
      module: this.module ? `${this.module}:${moduleName}` : moduleName,
      level: this.level,
    });
  }
}

/**
 * 全局默认日志器（无模块前缀）
 */
export const logger = new Logger();

/**
 * 创建模块专属的日志器
 *
 * @example
 * ```ts
 * import { createLogger } from "./shared/logger.js";
 *
 * const log = createLogger("WS");
 * log.info("Client connected");
 * // 输出: 2026-02-04T12:00:00.000Z INFO  [WS] Client connected
 * ```
 */
export function createLogger(moduleName: string, level?: LogLevel): Logger {
  return new Logger({ module: moduleName, level });
}

export { Logger };
