/**
 * 测试环境设置
 *
 * 在每个测试文件之前运行
 */

import { vi } from "vitest";

// Mock console 方法以减少测试输出
global.console = {
  ...console,
  // 在测试中禁用 log，除非显式启用
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// 全局测试钩子
beforeEach(() => {
  // 在每个测试前清除所有 mocks
  vi.clearAllMocks();
});

// 设置测试超时
vi.setConfig({
  testTimeout: 10000,
});
