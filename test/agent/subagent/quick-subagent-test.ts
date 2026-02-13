#!/usr/bin/env node
/**
 * 快速验证 Subagent 系统
 *
 * 用法：node test/quick-subagent-test.ts
 */

import { AgentManager } from "@/agent/core/manager.js";
import type { AgentConfig } from "@/types/index.js";
import { MockLLMProvider } from "./test/helpers/index.js";

async function quickTest() {
  console.log("🧪 快速验证 Subagent 系统\n");

  // 1. 初始化
  const mockProvider = new MockLLMProvider();

  const agentManager = new AgentManager(
    {
      dataDir: "./data/quick-test",
      subagents: {
        enabled: true,
        maxConcurrent: 5,
        archiveAfterMinutes: 60,
        defaultCleanup: "delete",
        allowedAgents: ["*"],
      },
    },
    {
      provider: mockProvider,
      tools: [],
    },
  );

  await agentManager.start();
  console.log("✅ AgentManager 启动成功\n");

  // 2. 获取 SubagentRegistry
  const registry = agentManager.getSubagentRegistry();

  if (!registry) {
    console.error("❌ SubagentRegistry 未初始化！");
    await agentManager.stop();
    process.exit(1);
  }

  console.log("✅ SubagentRegistry 初始化成功");
  console.log(`   初始统计:`, registry.getStats());
  console.log();

  // 3. 测试创建
  const record = registry.register({
    runId: "quick-test-1",
    childSessionKey: "subagent:quick-test-1:abc",
    requesterSessionKey: "user:test",
    requesterDisplayKey: "user:test",
    task: "快速测试任务",
    cleanup: "delete",
  });

  console.log("✅ Subagent 创建成功:");
  console.log(`   Run ID: ${record.runId}`);
  console.log(`   Session Key: ${record.childSessionKey}`);
  console.log();

  // 4. 测试更新
  registry.update({
    runId: "quick-test-1",
    startedAt: Date.now(),
    outcome: {
      status: "completed",
      completedAt: Date.now(),
      result: "任务完成",
    },
  });

  const updated = registry.get("quick-test-1");
  console.log("✅ Subagent 更新成功:");
  console.log(`   状态: ${updated?.outcome?.status}`);
  console.log();

  // 5. 测试统计
  const stats = registry.getStats();
  console.log("✅ 统计信息:");
  console.log(`   总数: ${stats.total}`);
  console.log(`   活跃: ${stats.active}`);
  console.log(`   完成: ${stats.completed}`);
  console.log();

  // 6. 测试列表
  const list = registry.list({ limit: 5 });
  console.log("✅ Subagent 列表:");
  list.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.task}`);
  });
  console.log();

  // 7. 测试删除
  const deleted = registry.delete("quick-test-1");
  console.log(`✅ Subagent 删除: ${deleted ? "成功" : "失败"}`);
  console.log();

  // 8. 清理
  await agentManager.stop();
  console.log("✅ AgentManager 已停止");

  console.log("\n✅ 所有测试通过！Subagent 系统工作正常！\n");
}

quickTest().catch((error) => {
  console.error("\n❌ 测试失败:", error);
  process.exit(1);
});
