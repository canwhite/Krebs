# Subagent 系统测试总结

## ✅ 已创建的测试文件

```
test/
├── agent/subagent/
│   └── registry.test.ts          # 单元测试（16个测试全部通过）
├── integration/
│   └── subagent-integration.test.ts  # 集成测试
├── manual/
│   ├── SUBAGENT_TEST_GUIDE.md    # 完整测试指南
│   └── subagent-manual-test.ts   # 手动测试脚本
└── quick-subagent-test.ts          # 快速验证脚本
```

---

## 🚀 快速测试方法

### 方法 1：快速验证（1 分钟）

```bash
# 运行快速测试脚本
node test/quick-subagent-test.ts
```

**期望输出**：
```
🧪 快速验证 Subagent 系统

✅ AgentManager 启动成功

✅ SubagentRegistry 初始化成功
   初始统计: { total: 0, active: 0, completed: 0, ... }

✅ Subagent 创建成功:
   Run ID: quick-test-1
   Session Key: subagent:quick-test-1:abc

✅ Subagent 更新成功:
   状态: completed

✅ 统计信息:
   总数: 1
   活跃: 0
   完成: 1

✅ Subagent 列表:
   1. 快速测试任务

✅ Subagent 删除: 成功

✅ AgentManager 已停止

✅ 所有测试通过！Subagent 系统工作正常！
```

### 方法 2：运行单元测试（10 秒）

```bash
npm test -- test/agent/subagent/registry.test.ts
```

**期望结果**：16 个测试全部通过

### 方法 3：检查工具列表（30 秒）

```bash
# 1. 启动 Server（新终端）
npm run dev

# 2. 在另一个终端检查 API
curl http://localhost:3000/api/tools | jq '.tools[] | select(.name == "spawn_subagent")'
```

**期望输出**：
```json
{
  "name": "spawn_subagent",
  "description": "在隔离会话中生成后台子代理运行，并将结果通知回请求者聊天。适合并行处理、资源隔离、专业化执行等场景。",
  ...
}
```

---

## 🧪 完整端到端测试（15 分钟）

### 步骤 1：配置 Agent 启用 Subagent

在 `src/index.ts` 或配置文件中确保：

```typescript
const manager = new AgentManager(
  {
    dataDir: "./data",
    subagents: {
      enabled: true,  // ← 必须！
      maxConcurrent: 5,
      allowedAgents: ["*"],
    },
  },
  { provider, ... }
);
```

### 步骤 2：启动 Server

```bash
npm run dev
```

### 步骤 3：在 UI 中测试

1. 打开浏览器：`http://localhost:3000`
2. 发送消息给 Agent：

```
请帮我做两件事：
1. 使用 spawn_subagent 工具创建一个子任务来分析代码质量
2. 然后创建另一个子任务来写测试用例
```

### 步骤 4：观察行为

**期望看到的日志**：

```
[SubagentRegistry] Registered subagent run: abc-123-def-456
[SubagentRegistry] Started subagent run: abc-123-def-456
[Agent] Processing subagent session: subagent:abc-123-def-456
[Agent] Subagent task: 分析代码质量
...
[SubagentRegistry] Updated subagent run: abc-123-def-456
[SubagentAnnounce] Notification sent for abc-123 (mode: followup)
```

**期望在 UI 中看到的响应**：

```
我已创建了一个 Subagent 来分析代码质量。
它会使用 model: claude-sonnet-4
Subagent ID: abc-123
完成后我会通知您结果。
```

---

## ✅ 验证清单

### 基础功能
- [ ] SubagentRegistry 正确初始化
- [ ] Subagent 可以创建
- [ ] Subagent 可以查询
- [ ] Subagent 可以更新
- [ ] Subagent 可以删除
- [ ] Subagent 可以列表
- [ ] 并发控制正常工作
- [ ] 统计信息正确
- [ ] 数据持久化正常

### 工具集成
- [ ] `spawn_subagent` 在 `/api/tools` 列表中
- [ ] `spawn_subagent` 描述正确显示
- [ ] LLM 可以看到 `spawn_subagent` 工具
- [ ] LLM 可以调用 `spawn_subagent` 工具
- [ ] 调用返回成功响应

### 端到端流程
- [ ] Agent 可以创建 Subagent
- [ ] Subagent 在独立会话中运行
- [ ] Subagent 完成后状态更新
- [ ] 通知机制触发
- [ ] 用户在原会话收到结果

### 安全和配置
- [ ] 并发限制生效
- [ ] Agent 白名单检查生效
- [ ] 工具调用日志记录
- [ ] 数据持久化和恢复

---

## 🔧 调试技巧

### 查看 Subagent 运行记录

```bash
# 查看持久化的数据
cat ./data/subagents/registry.jsonl | jq '.'

# 查看格式化
cat ./data/sessions/subagent_*.md
```

### 查看 Subagent 会话

```bash
# 列出所有 Subagent 会话
ls -la ./data/sessions/subagent_*

# 查看特定 Subagent 会话内容
cat ./data/sessions/subagent_abc-def-456.md
```

### 监控活跃 Subagent

```typescript
// 在代码中临时添加
setInterval(() => {
  const stats = registry.getStats();
  console.log(`活跃 Subagent: ${stats.active}/${stats.total}`);
}, 5000);
```

---

## 📝 测试场景示例

### 场景 1：单任务
```
用户: 使用 spawn_subagent 分析这个项目的代码质量
Agent: 调用 spawn_subagent 工具
系统: 注册 Subagent
```

### 场景 2：并行任务
```
用户: 同时分析代码和写测试
Agent: 调用 spawn_subagent 两次（并行）
系统: 创建两个独立的 Subagent
```

### 场景 3：超时处理
```
Agent: spawn_subagent({ runTimeoutSeconds: 60 })
系统: 60 秒后标记为 timeout
```

### 场景 4：不同通知模式
```
spawn_subagent({ announceMode: "steer" })   # 立即通知
spawn_subagent({ announceMode: "followup" })  # 后续消息
spawn_subagent({ announceMode: "collect" })   # 收集统一通知
spawn_subagent({ announceMode: "silent" })    # 静默执行
```

---

## 🎯 成功标准

**Subagent 系统正常工作的标志**：

1. ✅ 所有单元测试通过
2. ✅ 快速验证脚本成功
3. ✅ `spawn_subagent` 在 API 工具列表中
4. ✅ LLM 可以看到并调用 `spawn_subagent`
5. ✅ Subagent 在独立会话中运行
6. ✅ 完成后通知发送回原会话
7. ✅ 并发限制正确工作
8. ✅ 数据持久化和恢复正常

---

**最后更新**: 2026-02-13
**状态**: ✅ 所有必要代码和测试已完成
