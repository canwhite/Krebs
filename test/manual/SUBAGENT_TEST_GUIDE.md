# Subagent 系统测试指南

## 📋 测试概述

本文档提供了完整的 Subagent 系统测试方法，包括：
- ✅ 单元测试（已实现）
- ✅ 集成测试（已创建）
- ✅ 手动测试脚本（已创建）
- ✅ 端到端测试（本指南）

---

## 1️⃣ 快速验证（5 分钟）

### 步骤 1：运行单元测试

```bash
npm test -- test/agent/subagent/registry.test.ts
```

**期望结果**：
- ✅ 16 个测试全部通过
- ✅ 覆盖注册、查询、更新、删除、列表、统计、持久化等功能

### 步骤 2：检查工具列表

```bash
# 1. 启动 Server
npm run dev

# 2. 在浏览器访问
open http://localhost:3000

# 3. 调用 API
curl http://localhost:3000/api/tools
```

**期望结果**：
```json
{
  "tools": [
    { "name": "bash", ... },
    { "name": "read_file", ... },
    { "name": "write_file", ... },
    { "name": "edit_file", ... },
    { "name": "web_search", ... },
    { "name": "web_fetch", ... },
    {
      "name": "spawn_subagent",
      "description": "在隔离会话中生成后台子代理运行...",
      ...
    }
  ]
}
```

**验证点**：
- ✅ `spawn_subagent` 在工具列表中
- ✅ 描述正确显示

### 步骤 3：运行集成测试

```bash
npm test -- test/integration/subagent-integration.test.ts
```

**期望结果**：
- ✅ SubagentRegistry 正确初始化
- ✅ 能够注册、更新、删除 Subagent
- ✅ 并发控制正常工作
- ✅ 持久化和恢复正常

---

## 2️⃣ 完整测试（15 分钟）

### 步骤 1：配置 Agent 启用 Subagent

确保你的 Agent 配置启用了 Subagent：

```typescript
// 在初始化 AgentManager 时
const agentManager = new AgentManager(
  {
    dataDir: "./data",
    subagents: {
      enabled: true,              // ← 必须为 true
      maxConcurrent: 5,
      archiveAfterMinutes: 60 * 24 * 7,
      defaultCleanup: "delete",
      allowedAgents: ["*"],
    },
  },
  { provider, ... }
);
```

### 步骤 2：测试 Subagent 创建流程

在聊天界面发送以下消息给 Agent：

```
请帮我做两件事：
1. 分析当前项目的代码质量
2. 检查测试覆盖率
```

**期望行为**：

1. **LLM 调用 spawn_subagent 工具**
2. **工具执行**：
   - 调用 `SubagentRegistry.register()`
   - 生成唯一 `runId`
   - 创建 `childSessionKey`（格式：`subagent:{runId}:{taskHash}`）
   - 返回成功响应

3. **LLM 告诉用户**：
   ```
   我已经创建了两个 Subagent 来处理这些任务：
   - 代码质量分析 Subagent
   - 测试覆盖率检查 Subagent

   它们会在后台运行，完成后会通知您。
   ```

### 步骤 3：验证 Subagent 执行

检查 Server 日志，应该看到：

```
[SubagentRegistry] Registered subagent run: abc-123-def-456
[SubagentRegistry] Started subagent abc-123-def-456
[Agent] Processing subagent session: subagent:abc-123-def-456
...
[SubagentRegistry] Updated subagent run: abc-123-def-456
[SubagentAnnounce] Notification sent for abc-123-def-456 (mode: followup)
```

### 步骤 4：验证结果通知

在聊天界面，你应该收到：

```
📢 **代码质量分析** ✅ 完成
- 代码规范：良好
- 测试覆盖率：75%
- 发现问题：3 个

📢 **测试覆盖率检查** ✅ 完成
- 单元测试：覆盖 80%
- 集成测试：覆盖 60%
```

---

## 3️⃣ 高级测试（30 分钟）

### 测试场景 1：并发控制

创建多个 Subagent 测试并发限制：

```
请帮我并行处理以下任务：
1. 分析模块 A
2. 分析模块 B
3. 分析模块 C
4. 分析模块 D
5. 分析模块 E
6. 分析模块 F
```

**验证点**：
- ✅ 前 5 个 Subagent 正常创建
- ✅ 第 6 个被拒绝（超过 maxConcurrent = 5）
- ✅ 错误消息："Max concurrent subagents limit reached"

### 测试场景 2：超时处理

创建一个会超时的 Subagent：

```
请使用 spawn_subagent 工具创建一个任务：
- runTimeoutSeconds: 1  # 只给 1 秒
- task: "执行一个很长的任务..."
```

**验证点**：
- ✅ 1 秒后 Subagent 被标记为 timeout
- ✅ 收到超时通知

### 测试场景 3：不同通知模式

测试不同的 announceMode：

**steer 模式**：
```
spawn_subagent({
  task: "重要任务",
  announceMode: "steer"
})
```
**期望**：立即通知，引导用户关注

**followup 模式**：
```
spawn_subagent({
  task: "常规任务",
  announceMode: "followup"
})
```
**期望**：作为后续消息追加

**collect 模式**：
```
spawn_subagent({
  task: "批量任务",
  announceMode: "collect"
})
```
**期望**：收集结果，稍后统一通知

**silent 模式**：
```
spawn_subagent({
  task: "静默任务",
  announceMode: "silent"
})
```
**期望**：不发送通知

### 测试场景 4：持久化和恢复

1. 创建 Subagent
2. 重启 Server
3. 验证 Subagent 状态是否恢复

**验证点**：
- ✅ 重启后 `SubagentRegistry.restore()` 加载之前的数据
- ✅ 统计信息正确

---

## 4️⃣ 调试技巧

### 查看 Subagent 运行记录

```bash
# 查看持久化的数据
cat ./data/subagents/registry.jsonl

# 或在代码中
const registry = agentManager.getSubagentRegistry();
const list = registry.list();
console.log(list);
```

### 查看 Subagent 会话文件

```bash
# Subagent 会话文件格式：subagent:{runId}:{taskHash}.md
ls -la ./data/sessions/subagent_*/
```

### 监控工具调用

```bash
# 查看工具调用日志
const logs = registry.getToolCallLogs(runId);
logs.forEach(log => {
  console.log(`${log.toolName} at ${new Date(log.calledAt)}`);
});
```

---

## 5️⃣ 常见问题排查

### 问题 1：spawn_subagent 不在工具列表

**原因**：
- `getBuiltinTools()` 没有包含 spawn_subagent
- 或调用时没传依赖参数

**解决**：
- ✅ 已修复：spawn_subagent 始终在列表中
- ✅ 执行时检查依赖是否可用

### 问题 2：Subagent 创建失败

**错误信息**：
```
"Subagent system is not enabled"
```

**解决**：
```typescript
// 在 AgentManager 配置中启用
const manager = new AgentManager(
  { subagents: { enabled: true } },  // ← 必须设置
  { provider }
);
```

### 问题 3：并发限制不生效

**检查**：
```typescript
const stats = registry.getStats();
console.log(`活跃: ${stats.active}, 最大: ${config.maxConcurrent}`);
```

**解决**：
- 确认 `maxConcurrent` 配置正确
- 检查 Subagent 完成后是否正确更新状态

### 问题 4：通知没有收到

**检查**：
```typescript
// 1. SubagentAnnounce 是否设置处理器
announce.setNotificationHandler(handler);

// 2. 通知模式是否正确
record.metadata?.announceMode === "followup"
```

**解决**：
- 在 ChatService 或 Gateway 中设置通知处理器
- 将通知发送到原会话

---

## ✅ 测试检查清单

- [ ] 单元测试全部通过（16/16）
- [ ] 集成测试通过
- [ ] spawn_subagent 在 `/api/tools` 列表中
- [ ] 可以通过 UI 看到 spawn_subagent
- [ ] LLM 能够调用 spawn_subagent
- [ ] Subagent 正确注册到 Registry
- [ ] Subagent 状态可以更新
- [ ] 并发控制正常工作
- [ ] 数据持久化和恢复正常
- [ ] 通知机制正常工作
- [ ] 工具调用日志正常记录

---

## 🎯 成功标准

**Subagent 系统正常工作的标志**：

1. ✅ 可以通过 API 获取工具列表（包含 spawn_subagent）
2. ✅ LLM 能够调用 spawn_subagent 工具
3. ✅ Subagent 被正确注册到 Registry
4. ✅ Subagent 在独立会话中运行
5. ✅ Subagent 完成后状态更新到 Registry
6. ✅ 通知被发送回原会话
7. ✅ 用户在原会话中收到结果

---

**最后更新**: 2026-02-13
