# Task: 分析 openclaw-cn-ds 的任务规划和 subagent 机制

**任务ID**: task_plan_analysis_260213_114804
**创建时间**: 2026-02-13
**状态**: 进行中
**目标**: 了解 openclaw-cn-ds 项目的任务规划（plan）和 subagent 机制，然后评估 Krebs 项目的扩展方向

## 最终目标
- ✅ 理解 openclaw-cn-ds 的任务规划机制
- ✅ 理解 openclaw-cn-ds 的 subagent 架构
- ✅ 分析 Krebs 项目如何借鉴这些机制
- ⏳ 提供具体的扩展建议

## 核心发现

### 1. OpenClaw-CN-DS 的"规划"机制

**关键洞察：OpenClaw 没有传统的"Planner"组件！**

OpenClaw 使用的是**分布式、事件驱动的任务编排**，而不是中央规划器：

#### A. Subagent 系统（核心"规划"机制）

**核心文件**：
- `src/agents/tools/sessions-spawn-tool.ts` - 创建 subagent 的工具
- `src/agents/subagent-registry.ts` - Subagent 注册和生命周期管理
- `src/agents/subagent-announce.ts` - Subagent 结果通知机制

**工作原理**：
1. 主 Agent 调用 `sessions_spawn` 工具创建 subagent
2. Subagent 在独立的 session 中运行（`agent:<agentId>:subagent:<uuid>`）
3. Subagent 完成任务后，结果通过 announce 机制返回
4. 主 Agent 收到结果后，决定下一步行动

#### B. 事件驱动的协调

**关键特性**：
- 生命周期事件：`start`, `end`, `error`, `heartbeat`
- Queue-based execution：使用 Lane 系统隔离不同类型的工作
  - `Main` lane - 用户交互
  - `Cron` lane - 定时任务
  - `Subagent` lane - 后台任务
  - `Nested` lane - Agent 步骤

#### C. Announce 协议

**结果返回机制**：
```typescript
// Subagent 完成后触发 announce flow
runSubagentAnnounceFlow({
  childSessionKey,
  childRunId,
  requesterSessionKey,
  task,
  outcome, // "ok" | "error" | "timeout" | "unknown"
  // ...
})
```

**通知模式**：
- `collect` - 收集结果但不通知用户
- `steer` - 流式处理结果
- `followup` - 作为后续任务排队
- `interrupt` - 立即打断当前流程

### 2. Subagent 架构特点

#### A. 隔离性

```typescript
// Subagent 拥有独立的：
- 独立的 session key（agent:<id>:subagent:<uuid>）
- 独立的 context 和 history
- 独立的认证和权限
- 可配置的 model（可以与主 Agent 不同）
- 可配置的 timeout
- 可配置的 cleanup 策略（delete/keep）
```

#### B. 生命周期管理

```typescript
type SubagentRunRecord = {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  task: string;
  cleanup: "delete" | "keep";
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  outcome?: SubagentRunOutcome;
  archiveAtMs?: number;  // 自动归档时间
}
```

**自动化管理**：
- 注册时自动创建记录
- 启动时恢复未完成的任务
- 定时清理过期的 subagent
- 自动删除或保留 session

#### C. 权限控制

```typescript
// 配置允许的 subagent 目标
allowAgents: ["*", "specific-agent-id"]
```

- Subagent 不能再创建 subagent（禁止嵌套）
- 可以限制哪些 agent 可以被 spawn
- 支持跨 agent 的任务委派

### 3. 与 Krebs 项目的对比

#### A. Krebs 当前架构

**优点**：
- ✅ 文档驱动的任务规划（`schema/task_*.md`）
- ✅ Orchestrator 层作为统一入口
- ✅ AgentManager 管理 Agent 生命周期
- ✅ Session 管理系统完善
- ✅ Skills 系统（新旧两套）
- ✅ Tool Calling 系统

**缺少的**：
- ❌ Subagent 机制（无法创建临时的辅助 agent）
- ❌ 事件驱动的任务协调
- ❌ 异步任务队列系统
- ❌ 任务结果通知机制
- ❌ 自动化的生命周期管理

#### B. 架构对比

| 维度 | OpenClaw | Krebs | 差距 |
|------|----------|-------|------|
| **任务规划** | 分布式事件驱动 | 文档驱动规划 | 不同哲学 |
| **Subagent** | ✅ 完整实现 | ❌ 无 | **重大差距** |
| **任务队列** | Lane-based 队列 | 基础并发控制 | 中等差距 |
| **事件系统** | Lifecycle events | ❌ 无 | 重大差距 |
| **结果通知** | Announce 协议 | ❌ 无 | 中等差距 |
| **生命周期管理** | 自动化 | 手动管理 | 中等差距 |

## 扩展建议

### 阶段 1：Subagent 系统（高优先级）

#### 1.1 核心组件

**需要创建的模块**：

```
src/agent/subagent/
├── subagent-registry.ts      # Subagent 注册表
├── subagent-spawn.ts         # Subagent 创建工具
├── subagent-announce.ts      # 结果通知机制
└── types.ts                # 类型定义
```

**核心接口**：
```typescript
interface SubagentRunRecord {
  runId: string;
  childSessionKey: string;
  requesterSessionKey: string;
  task: string;
  cleanup: "delete" | "keep";
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  outcome?: "ok" | "error" | "timeout" | "unknown";
}

interface SubagentSpawnOptions {
  task: string;
  agentId?: string;
  model?: string;
  timeout?: number;
  cleanup?: "delete" | "keep";
}
```

#### 1.2 工具集成

**添加到 Tool Calling 系统**：
```typescript
// src/agent/tools/subagent-spawn-tool.ts
{
  name: "subagent_spawn",
  description: "Spawn a background sub-agent for a specific task",
  parameters: {
    task: { type: "string", required: true },
    agentId: { type: "string" },
    model: { type: "string" },
    timeout: { type: "number" },
    cleanup: { type: "string", enum: ["delete", "keep"] }
  }
}
```

#### 1.3 AgentManager 集成

**扩展 AgentManager**：
```typescript
class AgentManager {
  private subagentRegistry: SubagentRegistry;

  spawnSubagent(options: SubagentSpawnOptions): Promise<SubagentRunResult> {
    // 1. 验证权限
    // 2. 创建 subagent session
    // 3. 配置独立的环境
    // 4. 启动任务
    // 5. 注册到 registry
  }

  cleanupSubagent(runId: string): Promise<void> {
    // 自动清理过期或完成的 subagent
  }
}
```

### 阶段 2：事件系统（中优先级）

#### 2.1 事件总线

**创建事件系统**：
```typescript
// src/shared/event-bus.ts
type AgentEvent =
  | { type: "start"; runId: string; timestamp: number }
  | { type: "end"; runId: string; timestamp: number }
  | { type: "error"; runId: string; error: string; timestamp: number }
  | { type: "heartbeat"; runId: string; timestamp: number };

class EventBus {
  on(event: AgentEvent, callback: () => void): void;
  emit(event: AgentEvent): void;
  off(event: AgentEvent, callback: () => void): void;
}
```

#### 2.2 Lifecycle Hooks

**Agent 集成**：
```typescript
class Agent {
  private eventBus: EventBus;

  async process(message: string, sessionId: string) {
    const runId = uuid();
    this.eventBus.emit({ type: "start", runId, timestamp: Date.now() });

    try {
      const result = await this.doProcess(message, sessionId);
      this.eventBus.emit({ type: "end", runId, timestamp: Date.now() });
      return result;
    } catch (error) {
      this.eventBus.emit({ type: "error", runId, error, timestamp: Date.now() });
      throw error;
    }
  }
}
```

### 阶段 3：任务队列系统（低优先级）

#### 3.1 Lane 队列

**Krebs 已有基础实现**（`src/scheduler/lanes.ts`），需要增强：

```typescript
// 扩展现有 Lane 系统
interface LaneConfig {
  name: string;
  maxConcurrent: number;
  timeout?: number;
  priority?: number;  // 新增：优先级
}

class LaneQueue {
  // 现有功能...
  add(task: Task, priority?: number): void;  // 添加优先级
  getStats(): QueueStats;  // 新增：统计信息
}
```

#### 3.2 任务持久化

**支持任务恢复**：
```typescript
interface TaskRecord {
  taskId: string;
  lane: string;
  payload: unknown;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: "pending" | "running" | "completed" | "failed";
}

class TaskStore {
  save(task: TaskRecord): Promise<void>;
  load(): Promise<TaskRecord[]>;
  delete(taskId: string): Promise<void>;
}
```

### 阶段 4：Announce 协议（中优先级）

#### 4.1 结果通知

**创建 Announce 系统**：
```typescript
interface AnnounceMessage {
  fromSessionKey: string;
  toSessionKey: string;
  task: string;
  outcome: SubagentRunOutcome;
  result?: string;
  stats?: TaskStats;
}

class AnnounceQueue {
  enqueue(message: AnnounceMessage): void;
  process(): Promise<void>;
}
```

#### 4.2 消息格式化

**自动生成通知消息**：
```typescript
function formatAnnounce(params: {
  task: string;
  outcome: SubagentRunOutcome;
  result?: string;
  stats?: TaskStats;
}): string {
  const status =
    params.outcome.status === "ok" ? "completed successfully" :
    params.outcome.status === "timeout" ? "timed out" :
    params.outcome.status === "error" ? `failed: ${params.outcome.error}` :
    "finished with unknown status";

  return [
    `Background task "${params.task}" just ${status}.`,
    "",
    "Findings:",
    params.result || "(no output)",
    params.stats ? formatStats(params.stats) : "",
  ].join("\n");
}
```

## 实施计划

### Phase 1: 基础 Subagent（2-3 周）

**目标**：实现基本的 subagent 创建和管理

- [ ] 创建 `src/agent/subagent/` 模块结构
- [ ] 实现 `SubagentRegistry`
- [ ] 实现 `subagent_spawn` 工具
- [ ] 扩展 `AgentManager` 支持 subagent
- [ ] 编写单元测试
- [ ] 编写集成测试

**验收标准**：
- ✅ 可以通过工具调用创建 subagent
- ✅ Subagent 在独立 session 中运行
- ✅ Subagent 完成后可以返回结果
- ✅ 测试覆盖率 ≥ 80%

### Phase 2: 事件系统（1-2 周）

**目标**：实现基础的事件总线

- [ ] 创建 `src/shared/event-bus.ts`
- [ ] 在 Agent 中集成事件发射
- [ ] 在 AgentManager 中监听事件
- [ ] 编写单元测试

**验收标准**：
- ✅ Agent 执行时发射生命周期事件
- ✅ 可以监听和处理事件
- ✅ 事件支持异步处理

### Phase 3: Announce 协议（1-2 周）

**目标**：实现结果通知机制

- [ ] 创建 `src/agent/subagent/subagent-announce.ts`
- [ ] 实现 `AnnounceQueue`
- [ ] 集成到 SubagentRegistry
- [ ] 编写集成测试

**验收标准**：
- ✅ Subagent 完成后自动通知主 Agent
- ✅ 支持多种通知模式
- ✅ 通知消息格式化正确

### Phase 4: 高级特性（2-3 周）

**目标**：完善 subagent 生态系统

- [ ] 实现自动清理机制
- [ ] 支持跨 agent 的 subagent
- [ ] 实现权限控制
- [ ] 添加监控和统计
- [ ] 性能优化

**验收标准**：
- ✅ 自动清理过期的 subagent
- ✅ 支持跨 agent 任务委派
- ✅ 完整的监控和统计

## 架构优势

采用 Subagent 系统后，Krebs 将获得：

### 1. 并行任务处理

```
主 Agent
  ├─ Subagent 1 (搜索文件)
  ├─ Subagent 2 (分析数据)
  └─ Subagent 3 (生成报告)
  ↓
主 Agent 收集结果并综合
```

### 2. 任务隔离

- 每个 subagent 有独立的 context
- 失败不影响主 agent
- 可以使用不同的 model 和参数

### 3. 可扩展性

- 支持复杂的多步任务
- 支持异步后台任务
- 支持任务依赖和组合

### 4. 可维护性

- 清晰的生命周期管理
- 自动化的清理机制
- 完整的事件追踪

## 潜在风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **复杂度增加** | 代码更难理解 | 充分的文档和测试 |
| **性能开销** | Session 创建成本 | 复用 session 池 |
| **权限问题** | Subagent 滥用 | 严格的权限控制 |
| **资源泄漏** | Subagent 未清理 | 自动清理机制 |

## 总结

OpenClaw-CN-DS 的"规划"不是传统的计划器，而是**基于 Subagent 的分布式任务编排系统**。

Krebs 项目可以通过以下方式借鉴：

1. **实现 Subagent 系统**（最高优先级）
2. **添加事件系统**（支持生命周期管理）
3. **完善任务队列**（基于现有 Lane 系统）
4. **实现 Announce 协议**（结果通知）

这将使 Krebs 从"文档驱动的单体 Agent"升级为"分布式多 Agent 协作系统"。

## 当前进度
### 正在进行: 总结分析结果
已完成 openclaw-cn-ds 的深入分析和 Krebs 扩展规划

## 下一步行动
1. 等待用户确认扩展方向
2. 如果确认，开始 Phase 1 实施
