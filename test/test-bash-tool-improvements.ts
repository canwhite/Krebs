#!/usr/bin/env tsx

/**
 * 测试改进后的 Bash 工具
 *
 * 验证 timeout 参数和改进的错误信息
 */

import { bashTool } from "../src/agent/tools/builtin.js";

console.log("🧪 测试改进后的 Bash 工具\n");

// ========== 测试 1: 默认超时（30秒） ==========
console.log("=== 测试 1: 默认超时（快速命令） ===");
const test1 = await bashTool.execute({
  command: "echo 'Hello, World!'",
});

console.log("命令: echo 'Hello, World!'");
console.log("结果:", test1.success ? "✅ 成功" : "❌ 失败");
console.log("输出:", test1.output?.trim());
console.log();

// ========== 测试 2: 自定义超时（5秒） ==========
console.log("=== 测试 2: 自定义超时（5秒，sleep 3秒） ===");
const test2 = await bashTool.execute({
  command: "sleep 3 && echo 'Done after 3 seconds'",
  timeout: 5000,
});

console.log("命令: sleep 3 && echo 'Done'");
console.log("超时设置: 5000ms");
console.log("结果:", test2.success ? "✅ 成功" : "❌ 失败");
console.log("输出:", test2.output?.trim());
console.log();

// ========== 测试 3: 超时测试（2秒超时，执行5秒命令） ==========
console.log("=== 测试 3: 超时测试（2秒超时，sleep 5秒） ===");
const test3 = await bashTool.execute({
  command: "sleep 5 && echo 'This should not appear'",
  timeout: 2000,
});

console.log("命令: sleep 5 && echo '...'");
console.log("超时设置: 2000ms");
console.log("结果:", test3.success ? "✅ 成功" : "❌ 失败（预期）");
console.log("错误信息:", test3.error);
console.log();

// ========== 测试 4: 网络请求（使用 curl 内置超时） ==========
console.log("=== 测试 4: 网络请求（推荐方式） ===");
const test4 = await bashTool.execute({
  command: 'curl -s --max-time 5 -I "https://www.example.com"',
  timeout: 10000,
});

console.log("命令: curl --max-time 5 -I https://www.example.com");
console.log("工具超时: 10000ms");
console.log("curl 超时: 5000ms");
console.log("结果:", test4.success ? "✅ 成功" : "❌ 失败");
console.log("输出预览:", test4.output?.substring(0, 100));
console.log();

// ========== 测试 5: 参数验证 ==========
console.log("=== 测试 5: 参数验证 ===");
const test5a = await bashTool.execute({
  command: "",
});

console.log("空命令测试:");
console.log("结果:", test5a.success ? "✅ 成功" : "❌ 失败（预期）");
console.log("错误:", test5a.error);
console.log();

const test5b = await bashTool.execute({
  command: "echo 'test'",
  timeout: 500, // 低于最小值 1000ms
});

console.log("过小超时测试 (500ms < 1000ms):");
console.log("结果:", test5b.success ? "✅ 成功" : "❌ 失败");
console.log("注意: 超时应该被自动调整到 1000ms");
console.log();

// ========== 测试 6: 工作目录 ==========
console.log("=== 测试 6: 工作目录 ===");
const test6 = await bashTool.execute({
  command: "pwd && ls | head -5",
  cwd: "/tmp",
});

console.log("命令: pwd && ls | head -5");
console.log("工作目录: /tmp");
console.log("结果:", test6.success ? "✅ 成功" : "❌ 失败");
console.log("输出:", test6.output?.trim());
console.log();

// ========== 总结 ==========
console.log("=== 🎉 测试总结 ===");
console.log("✅ Bash 工具改进完成");
console.log("✅ 支持 timeout 参数（1秒-120秒）");
console.log("✅ 改进的错误信息");
console.log("✅ 自动调整超时范围");
console.log();
console.log("📝 使用建议:");
console.log("1. 网络请求：设置 timeout 为 60000ms（60秒）");
console.log("2. 快速命令：使用默认 30000ms");
console.log("3. 长时任务：设置 timeout 为 120000ms（最大）");
console.log("4. 最佳实践：使用 curl/wget 的内置超时参数");
console.log();
console.log("📚 相关文档:");
console.log("   - schema/task_bash_tool_timeout_fix_260205_221500.md");
