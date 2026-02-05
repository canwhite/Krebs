#!/usr/bin/env tsx

/**
 * DeepSeek 工具调用示例
 *
 * 展示如何在实际的 DeepSeek API 调用中使用工具系统
 */

import { getBuiltinTools } from "../src/agent/tools/builtin.js";
import { resolveToolPolicy, filterToolsByPolicy } from "../src/agent/tools/index.js";
import { adaptToolsForDeepSeek } from "../src/agent/tools/adapters/deepseek.js";

console.log("🔧 DeepSeek 工具调用示例\n");

// ========== 步骤 1: 获取所有工具 ==========
console.log("步骤 1: 获取所有内置工具");
const allTools = getBuiltinTools();
console.log(`✅ 获取到 ${allTools.length} 个工具\n`);

// ========== 步骤 2: 应用工具策略 ==========
console.log("步骤 2: 应用工具策略");
console.log("使用 'coding' 配置文件（允许文件操作和命令执行）");

const policy = resolveToolPolicy("coding");
const filteredTools = filterToolsByPolicy(allTools, policy);

console.log(`✅ 策略过滤后: ${filteredTools.length} 个工具`);
console.log(`   允许的工具: ${filteredTools.map((t) => t.name).join(", ")}\n`);

// ========== 步骤 3: 转换为 DeepSeek 格式 ==========
console.log("步骤 3: 转换为 DeepSeek 格式");
const deepseekTools = adaptToolsForDeepSeek(filteredTools);
console.log(`✅ 转换完成: ${deepseekTools.length} 个工具\n`);

// ========== 步骤 4: 显示工具声明 ==========
console.log("步骤 4: DeepSeek 工具声明（用于 API 调用）");
console.log("=" .repeat(80));
console.log(JSON.stringify(deepseekTools, null, 2));
console.log("=" .repeat(80));
console.log();

// ========== 步骤 5: 模拟 API 调用 ==========
console.log("步骤 5: 模拟 DeepSeek API 调用");
console.log("=" .repeat(80));

const mockAPICall = {
  model: "deepseek-chat",
  messages: [
    {
      role: "system",
      content: "You are a helpful coding assistant.",
    },
    {
      role: "user",
      content: "请帮我读取 package.json 文件的内容",
    },
  ],
  tools: deepseekTools, // ✅ 使用转换后的工具声明
  temperature: 0.7,
};

console.log("POST https://api.deepseek.com/v1/chat/completions");
console.log();
console.log(JSON.stringify(mockAPICall, null, 2));
console.log("=" .repeat(80));
console.log();

// ========== 步骤 6: 说明 ==========
console.log("📝 使用说明");
console.log("-".repeat(80));
console.log(`
1. 工具策略控制:
   - 使用 'minimal' 只允许读取文件
   - 使用 'coding' 允许文件操作和命令执行
   - 使用 'full' 允许所有工具

2. 自定义策略:
   const policy = resolveToolPolicy(
     'coding',              // 基础配置
     ['web_search'],        // 额外允许
     ['bash']               // 额外禁止
   );

3. 在 Agent 中使用:
   export class Agent {
     async callLLM(messages) {
       const policy = resolveToolPolicy(this.config.toolProfile);
       const filtered = filterToolsByPolicy(this.tools, policy);
       const adapted = adaptToolsForDeepSeek(filtered);

       return await deepseek.chat.completions.create({
         model: "deepseek-chat",
         messages,
         tools: adapted,  // ✅ DeepSeek 格式
       });
     }
   }

4. 配置文件:
   // .env 或配置文件
   AGENT_TOOL_PROFILE=coding
   AGENT_TOOL_ALLOWLIST=web_search,web_fetch
   AGENT_TOOL_DENYLIST=bash
`);
console.log("-".repeat(80));
console.log();

console.log("🎉 示例完成！");
console.log();
console.log("📚 更多信息请查看:");
console.log("   - docs/TOOLS_SYSTEM.md");
console.log("   - schema/task_tools_test_results_260205_220500.md");
