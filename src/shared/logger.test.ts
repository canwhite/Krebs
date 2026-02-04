/**
 * Logger 单元测试
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Logger, createLogger } from "./logger.js";

describe("Logger", () => {
  let logger: Logger;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new Logger({ level: "debug" });
    consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("基础功能", () => {
    it("应该正确创建 Logger 实例", () => {
      expect(logger).toBeInstanceOf(Logger);
    });

    it("应该支持设置日志级别", () => {
      logger.setLevel("warn");
      logger.info("test");
      expect(consoleInfoSpy).not.toHaveBeenCalled();
    });
  });

  describe("日志级别过滤", () => {
    it("debug 级别应该输出所有日志", () => {
      const debugLogger = new Logger({ level: "debug" });
      debugLogger.debug("debug message");
      debugLogger.info("info message");
      debugLogger.warn("warn message");
      debugLogger.error("error message");

      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("info 级别应该输出 info、warn、error", () => {
      const infoLogger = new Logger({ level: "info" });
      infoLogger.debug("debug message");
      infoLogger.info("info message");
      infoLogger.warn("warn message");
      infoLogger.error("error message");

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("warn 级别应该输出 warn、error", () => {
      const warnLogger = new Logger({ level: "warn" });
      warnLogger.debug("debug message");
      warnLogger.info("info message");
      warnLogger.warn("warn message");
      warnLogger.error("error message");

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("error 级别应该只输出 error", () => {
      const errorLogger = new Logger({ level: "error" });
      errorLogger.debug("debug message");
      errorLogger.info("info message");
      errorLogger.warn("warn message");
      errorLogger.error("error message");

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("日志格式", () => {
    it("应该正确格式化日志消息", () => {
      logger.info("test message");
      const callArgs = consoleInfoSpy.mock.calls[0];
      const logMessage = callArgs[0] as string;

      expect(logMessage).toContain("INFO");
      expect(logMessage).toContain("test message");
      expect(logMessage).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    it("应该支持传递额外参数", () => {
      logger.info("test message", { foo: "bar" });
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining("test message"),
        { foo: "bar" }
      );
    });
  });

  describe("模块日志器", () => {
    it("应该创建带有模块名称的日志器", () => {
      const moduleLogger = createLogger("TestModule");
      moduleLogger.info("test message");
      const callArgs = consoleInfoSpy.mock.calls[0];
      const logMessage = callArgs[0] as string;

      expect(logMessage).toContain("[TestModule]");
    });

    it("应该支持创建子日志器", () => {
      const parentLogger = createLogger("Parent");
      const childLogger = parentLogger.withModule("Child");

      childLogger.info("test message");
      const callArgs = consoleInfoSpy.mock.calls[0];
      const logMessage = callArgs[0] as string;

      expect(logMessage).toContain("[Parent:Child]");
    });

    it("子日志器应该继承父日志器的级别", () => {
      const parentLogger = new Logger({ module: "Parent", level: "warn" });
      const childLogger = parentLogger.withModule("Child");

      childLogger.info("info message");
      expect(consoleInfoSpy).not.toHaveBeenCalled();

      childLogger.warn("warn message");
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("setLevel", () => {
    it("应该动态更新日志级别", () => {
      logger.setLevel("error");
      logger.info("info message");
      expect(consoleInfoSpy).not.toHaveBeenCalled();

      logger.setLevel("debug");
      logger.info("info message");
      expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe("createLogger", () => {
  it("应该创建指定模块的日志器", () => {
    const logger = createLogger("MyModule");
    logger.info("test");
    expect(logger).toBeInstanceOf(Logger);
  });

  it("应该支持自定义日志级别", () => {
    const logger = createLogger("MyModule", "warn");
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logger.info("test");
    expect(consoleInfoSpy).not.toHaveBeenCalled();
  });
});
