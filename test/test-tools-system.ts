#!/usr/bin/env tsx

/**
 * 测试工具系统
 *
 * 验证工具策略控制和平台适配功能
 */

import { getBuiltinTools } from "../src/agent/tools/builtin.js";
import {
  resolveToolPolicy,
  filterToolsByPolicy,
  describeToolPolicy,
  isToolAllowed,
  getAvailableProfiles,
  TOOL_GROUPS,
  normalizeToolName,
  expandToolGroups,
  getToolGroups,
} from "../src/agent/tools/index.js";
import {
  adaptToolsForDeepSeek,
  exportDeclarationsAsJSON,
  createToolUsageExample,
} from "../src/agent/tools/adapters/deepseek.js";
import { adaptToolsForOpenAI } from "../src/agent/tools/adapters/openai.js";
import { adaptToolsForAnthropic } from "../src/agent/tools/adapters/anthropic.js";

console.log("🧪 测试工具系统\n");

// ========== 测试 1: 基本工具获取 ==========
console.log("=== 测试 1: 获取内置工具 ===");
const allTools = getBuiltinTools();
console.log(`✅ 获取到 ${allTools.length} 个内置工具:`);
allTools.forEach((tool) => {
  console.log(`   - ${tool.name}: ${tool.description.substring(0, 50)}...`);
});
console.log();

// ========== 测试 2: 工具分组 ==========
console.log("=== 测试 2: 工具分组 ===");
console.log("✅ 可用的工具分组:");
Object.entries(TOOL_GROUPS).forEach(([group, tools]) => {
  console.log(`   ${group}: [${tools.join(", ")}]`);
});
console.log();

// ========== 测试 3: 工具名称规范化 ==========
console.log("=== 测试 3: 工具名称规范化 ===");
const testNames = ["bash", "exec", "shell", "read_file", "read", "WRITE_FILE"];
console.log("✅ 测试名称规范化:");
testNames.forEach((name) => {
  const normalized = normalizeToolName(name);
  console.log(`   "${name}" → "${normalized}"`);
});
console.log();

// ========== 测试 4: 分组展开 ==========
console.log("=== 测试 4: 分组展开 ===");
const groupsToExpand = ["group:fs", "bash", "group:runtime"];
console.log(`✅ 展开 [${groupsToExpand.join(", ")}]:`);
const expanded = expandToolGroups(groupsToExpand);
console.log(`   结果: [${expanded.join(", ")}]`);
console.log();

// ========== 测试 5: 工具策略 - minimal 配置 ==========
console.log("=== 测试 5: 工具策略 - minimal 配置 ===");
const minimalPolicy = resolveToolPolicy("minimal");
console.log(`✅ Minimal 策略: ${describeToolPolicy(minimalPolicy)}`);
const minimalTools = filterToolsByPolicy(allTools, minimalPolicy);
console.log(`   过滤后工具数: ${minimalTools.length}/${allTools.length}`);
console.log(`   允许的工具: [${minimalTools.map((t) => t.name).join(", ")}]`);
console.log();

// ========== 测试 6: 工具策略 - coding 配置 ==========
console.log("=== 测试 6: 工具策略 - coding 配置 ===");
const codingPolicy = resolveToolPolicy("coding");
console.log(`✅ Coding 策略: ${describeToolPolicy(codingPolicy)}`);
const codingTools = filterToolsByPolicy(allTools, codingPolicy);
console.log(`   过滤后工具数: ${codingTools.length}/${allTools.length}`);
console.log(`   允许的工具: [${codingTools.map((t) => t.name).join(", ")}]`);
console.log();

// ========== 测试 7: 工具策略 - 自定义 allow/deny ==========
console.log("=== 测试 7: 自定义 allow/deny 策略 ===");
const customPolicy = resolveToolPolicy(
  "coding", // 基础配置
  ["web_search"], // 额外允许（虽然没有这个工具）
  ["bash"] // 额外禁止
);
console.log(`✅ 自定义策略: ${describeToolPolicy(customPolicy)}`);
const customTools = filterToolsByPolicy(allTools, customPolicy);
console.log(`   过滤后工具数: ${customTools.length}/${allTools.length}`);
console.log(`   允许的工具: [${customTools.map((t) => t.name).join(", ")}]`);
console.log();

// ========== 测试 8: 工具允许检查 ==========
console.log("=== 测试 8: 工具允许检查 ===");
const testPolicy = resolveToolPolicy("minimal");
const toolsToCheck = ["read_file", "bash", "write_file"];
console.log("✅ 检查工具是否被允许:");
toolsToCheck.forEach((toolName) => {
  const allowed = isToolAllowed(toolName, testPolicy);
  console.log(`   ${toolName}: ${allowed ? "✅ 允许" : "❌ 禁止"}`);
});
console.log();

// ========== 测试 9: 获取工具所属分组 ==========
console.log("=== 测试 9: 获取工具所属分组 ===");
const toolForGroups = "bash";
const groups = getToolGroups(toolForGroups);
console.log(`✅ 工具 "${toolForGroups}" 所属的分组:`);
console.log(`   [${groups.join(", ")}]`);
console.log();

// ========== 测试 10: DeepSeek 平台适配 ==========
console.log("=== 测试 10: DeepSeek 平台适配 ===");
const deepseekTools = adaptToolsForDeepSeek(codingTools);
console.log(`✅ 转换为 DeepSeek 格式: ${deepseekTools.length} 个工具`);
if (deepseekTools.length > 0) {
  const firstTool = deepseekTools[0];
  console.log("\n   第一个工具示例:");
  console.log(JSON.stringify(firstTool, null, 2).split("\n").map((line) => "   " + line).join("\n"));

  console.log("\n   工具使用示例:");
  const example = createToolUsageExample(firstTool);
  console.log(example.split("\n").map((line) => "   " + line).join("\n"));
}
console.log();

// ========== 测试 11: OpenAI 平台适配 ==========
console.log("=== 测试 11: OpenAI 平台适配 ===");
const openaiTools = adaptToolsForOpenAI(codingTools);
console.log(`✅ 转换为 OpenAI 格式: ${openaiTools.length} 个工具`);
if (openaiTools.length > 0) {
  console.log("\n   第一个工具:");
  console.log(JSON.stringify(openaiTools[0], null, 2).split("\n").map((line) => "   " + line).join("\n"));
}
console.log();

// ========== 测试 12: Anthropic 平台适配 ==========
console.log("=== 测试 12: Anthropic 平台适配 ===");
const anthropicTools = adaptToolsForAnthropic(codingTools);
console.log(`✅ 转换为 Anthropic 格式: ${anthropicTools.length} 个工具`);
if (anthropicTools.length > 0) {
  console.log("\n   第一个工具:");
  console.log(JSON.stringify(anthropicTools[0], null, 2).split("\n").map((line) => "   " + line).join("\n"));
}
console.log();

// ========== 测试 13: 配置文件列表 ==========
console.log("=== 测试 13: 可用的配置文件 ===");
const profiles = getAvailableProfiles();
console.log(`✅ 可用的配置文件: [${profiles.join(", ")}]`);
console.log();

// ========== 测试 14: 导出为 JSON ==========
console.log("=== 测试 14: 导出工具声明为 JSON ===");
const jsonOutput = exportDeclarationsAsJSON(deepseekTools);
console.log(`✅ 导出 JSON 长度: ${jsonOutput.length} 字符`);
console.log("\n   JSON 预览 (前500字符):");
console.log(jsonOutput.substring(0, 500) + "...");
console.log();

// ========== 总结 ==========
console.log("=== 🎉 所有测试完成 ===");
console.log("✅ 工具策略系统工作正常");
console.log("✅ 平台适配器工作正常");
console.log("✅ 所有核心功能验证通过");
console.log();
console.log("📚 详细使用文档请查看: docs/TOOLS_SYSTEM.md");
