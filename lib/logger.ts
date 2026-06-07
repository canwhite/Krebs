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
 * 日志工具类（单例模式）
 */
class MonitorLogger {
  private static instance: MonitorLogger | null = null;
  private logStream: any = null;
  private isEnabled: boolean = false;

  private constructor() {
    const logLevel = getLogLevel();
    this.isEnabled = logLevel === "DEBUG";

    if (this.isEnabled) {
      const fs = require("fs");
      this.logStream = fs.createWriteStream("./monitor.log", { flags: "a" });
      console.log("[MONITOR] Logger initialized with DEBUG level");
    }
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): MonitorLogger {
    if (!MonitorLogger.instance) {
      MonitorLogger.instance = new MonitorLogger();
    }
    return MonitorLogger.instance;
  }

  /**
   * 创建新的日志实例（用于多连接场景）
   * 每个实例独立管理自己的日志流
   */
  public static createInstance(): MonitorLogger {
    return new MonitorLogger();
  }

  /**
   * 写入日志
   */
  public log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;

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
      this.logStream.write(`[${new Date().toISOString()}] [MONITOR] Logger closed\n`);
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
 * 导出单例实例和类
 */
export { MonitorLogger };
export const logger = MonitorLogger.getInstance();
