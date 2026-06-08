/**
 * 日志工具类
 * 支持根据 LOG_LEVEL 环境变量控制日志输出
 * - NORMAL: 只输出到控制台
 * - DEBUG: 输出到控制台并写入 monitor.log 文件
 */

/**
 * 日志级别配置
 */
type LogLevel = "NORMAL" | "DEBUG";

/**
 * 获取日志级别配置
 */
function getLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL?.toUpperCase();
  return level === "DEBUG" ? "DEBUG" : "NORMAL";
}

/**
 * Logger 接口
 */
interface Logger {
  log(message: string): void;
  close(): void;
  isDebugEnabled(): boolean;
}

/**
 * 日志工具类
 * 每次创建都是新实例，无单例模式
 */
class MonitorLogger implements Logger {
  private logStream: any = null;
  private isEnabled: boolean = false;
  private name: string;

  private constructor(name?: string) {
    const logLevel = getLogLevel();
    this.isEnabled = logLevel === "DEBUG";
    this.name = name || "default";

    if (this.isEnabled) {
      const fs = require("fs");
      this.logStream = fs.createWriteStream("./monitor.log", { flags: "a" });
      if (this.name === "default") {
        console.log("[MONITOR] Logger initialized with DEBUG level");
      }
    }
  }

  /**
   * 创建新的日志实例
   * @param name 可选的实例名称，用于区分不同连接/请求的日志
   */
  public static createInstance(name?: string): MonitorLogger {
    return new MonitorLogger(name);
  }

  /**
   * 写入日志
   */
  public log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${this.name}] ${message}`;

    // 始终输出到控制台
    console.log(logMessage);

    // 只有 DEBUG 模式才写入文件
    if (this.isEnabled && this.logStream) {
      this.logStream.write(logMessage + "\n");
    }
  }

  /**
   * 关闭日志流
   */
  public close(): void {
    if (this.isEnabled && this.logStream) {
      this.logStream.write(`[${new Date().toISOString()}] [${this.name}] Logger closed\n`);
      this.logStream.end();
      this.logStream = null;
    }
  }

  /**
   * 检查是否启用 DEBUG 模式
   */
  public isDebugEnabled(): boolean {
    return this.isEnabled;
  }
}

/**
 * 导出类和接口
 */
export { MonitorLogger };
