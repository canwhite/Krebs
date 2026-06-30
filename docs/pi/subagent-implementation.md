# Subagent 实现文档

## 概述

Krebs subagent 是一个优化过的子 agent 实现，替代了原有的 `@tintinweb/pi-subagents`。核心优化点：

- O(1) 入队/出队（原实现是 O(n)）
- Extension 缓存避免重复加载
- 敏感信息自动过滤
- 事件订阅在 prompt 发送之前

## 架构

```
.pi/extensions/subagent/
├── index.ts           # 扩展入口，注册工具
├── agent-manager.ts   # Agent 生命周期管理
├── agent-runner.ts   # Session 创建
├── queue.ts          # O(1) 队列
├── session-cache.ts   # Extension 缓存
├── context.ts        # Parent context 构建
├── context-filter.ts # 敏感信息过滤
├── scheduler.ts      # Cron/interval 调度
├── custom-agents.ts  # 加载 .pi/agents/*.md
├── fleet-view.ts     # Fleet 状态 (Krebs 无 UI)
├── group-join.ts    # 多 agent 结果合并
├── memory.ts        # 子 agent 记忆
├── worktree.ts      # Git worktree 隔离
├── skill-loader.ts  # Skill 加载优化
└── types.ts         # 类型定义
```

## 主体流程

### 1. 创建 Agent

```typescript
// agent-manager.ts:50-106
export async function createAgent(
  parentSessionId: string,
  task: string,
  type: string,
  cwd: string,
  options?: AgentOptions,
  ctx?: any
): Promise<{ agentId: string; status: string }> {
  const state = getOrCreateSessionState(parentSessionId);
  const agentId = generateAgentId();

  // 1. 构建 prompt (如果启用 inheritContext)
  const prompt = ctx
    ? buildSubagentPrompt(task, ctx, options ?? {})
    : task;

  // 2. 创建 session (prompt 未发送)
  const session = await createSubagentSession(prompt, type, cwd, options);

  // 3. 创建 record
  const record: AgentRecord = {
    id: agentId,
    session,
    type,
    status: "pending",
    createdAt: Date.now(),
    timeoutMs: options?.timeoutMs,
  };

  // 4. 订阅事件 (关键: 在 prompt 之前!)
  const unsubscribe = session.subscribe((event: any) => {
    const subagentEvent = event as SubagentEvent;
    handleSubagentEvent(subagentEvent, session, record);

    // 5. agent_end 时清理
    if (subagentEvent.type === "agent_end") {
      setTimeout(() => {
        onAgentComplete(parentSessionId, agentId);
      }, 0);
    }
  });
  record.unsubscribe = unsubscribe;

  // 6. 存储 record
  state.records.set(agentId, record);

  // 7. 队列管理: 满则入队, 否则立即启动
  if (state.queue.size >= state.maxConcurrent) {
    record.prompt = prompt;  // 存储以备后续出队时使用
    state.queue.enqueue(agentId, record);
    record.status = "pending";
  } else {
    startAgent(record, prompt);
  }

  return { agentId, status: record.status };
}
```

### 2. 启动 Agent

```typescript
// agent-manager.ts:112-116
function startAgent(record: AgentRecord, prompt: string): void {
  record.status = "running";
  // 订阅已设置, 现在安全发送 prompt
  startSubagentSession(record.session, prompt, record.timeoutMs);
}

// agent-runner.ts:144-157
export function startSubagentSession(
  session: AgentSession,
  prompt: string,
  timeoutMs?: number
): void {
  // 超时计时器
  if (timeoutMs) {
    startTimeout(session, timeoutMs, session.sessionId);
  }
  // 发送 prompt, agent 开始执行
  session.prompt(prompt);
}
```

### 3. 创建 Subagent Session

```typescript
// agent-runner.ts:53-142
export async function createSubagentSession(
  prompt: string,
  type: string,
  cwd: string,
  options?: AgentOptions
): Promise<AgentSession> {
  const config = getAgentConfig(type);
  const mergedOptions = { ...config, ...options };

  // 创建 bash tool (sandbox)
  const bashTool = createSandboxBashTool(getDefaultExecutor(), cwd, passthroughBash);

  // 创建 resource loader (过滤 Krebs 特定扩展)
  const filteredLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    extensionsOverride,  // 排除 memory-context, memory 等
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    systemPromptOverride: () => "",
    noPromptTemplates: true,
    noThemes: true,
  });

  // 获取缓存的 extensions
  await extensionCache.getOrReload(cwd, filteredLoader);

  // 创建 session
  const result = await createAgentSession({
    cwd,
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    tools: ["read", "bash", "edit"],
    customTools: [bashTool as any, ...TOOLS.map((t) => t.tool)],
    resourceLoader: filteredLoader,
  });

  return result.session;  // 注意: prompt 在外层发送
}
```

### 4. 事件处理

```typescript
// agent-runner.ts:168-195
export function handleSubagentEvent(
  event: SubagentEvent,
  session: AgentSession,
  record: AgentRecord
): void {
  // 跳过已取消的 (abort 正在进行)
  if (record.status === "cancelled") {
    return;
  }

  switch (event.type) {
    case "agent_start":
      record.status = "running";
      break;
    case "agent_end":
      record.status = "done";
      record.result = event.messages;
      if (record.unsubscribe) record.unsubscribe();
      break;
    case "error":
      record.status = "failed";
      console.error(`[Subagent] Error: ${event.error}`);
      break;
  }
}
```

### 5. 清理与队列处理

```typescript
// agent-manager.ts:239-261
export function onAgentComplete(parentSessionId: string, agentId: string): void {
  const state = sessionStates.get(parentSessionId);
  if (!state) return;

  const record = state.records.get(agentId);
  if (!record) return;

  // 1. 从 records 中删除
  state.records.delete(agentId);

  // 2. 处理队列中的下一个 agent
  processQueue(state);

  // 3. 如果没有更多 agent, 延迟清理状态
  if (state.records.size === 0 && state.queue.size === 0) {
    setTimeout(() => {
      const s = sessionStates.get(parentSessionId);
      if (s && s.records.size === 0 && s.queue.size === 0) {
        cleanupSessionState(parentSessionId);
      }
    }, 5000);
  }
}

// 队列出队并启动
function processQueue(state: SessionState): void {
  while (state.queue.size > 0 && state.records.size < state.maxConcurrent) {
    const next = state.queue.dequeue();
    if (next && state.records.has(next.id)) {
      if (next.prompt) {
        startAgent(next, next.prompt);
      }
    }
  }
}
```

### 6. Context 构建 (继承父会话)

```typescript
// context.ts:20-86
export function buildCleanContext(
  ctx: ExtensionContext,
  options: CleanContextOptions = {}
): string {
  const {
    includeUserMessages = true,
    includeAssistantMessages = true,
    includeSummaries = false,
    maxMessages = 10,
    filterSensitive = true,
  } = options;

  // 从 parent 的 sessionManager 获取消息
  const entries = (ctx.sessionManager as any).getBranch();
  if (!entries?.length) return "";
  if (maxMessages === 0) return "";

  // 反向遍历获取最后 N 条消息
  const reversed = [...entries].reverse();
  const parts: string[] = [];
  let messageCount = 0;

  for (const entry of reversed) {
    // summary_anchor 始终处理, 不受 maxMessages 限制
    if (entry.type === "summary_anchor" && includeSummaries) {
      if (entry.summary) {
        parts.push(`[Summary]: ${entry.summary}`);
      }
      continue;
    }

    if (entry.type === "message") {
      const msg = entry.message as AgentMessage | undefined;
      if (!msg || !("content" in msg)) continue;

      // 先检查 limit, 再添加
      if (messageCount >= maxMessages) break;

      let content = extractText((msg as any).content);

      if (msg.role === "user" && includeUserMessages) {
        if (filterSensitive) content = filterSensitiveData(content);
        if (content.trim()) {
          parts.push(`[User]: ${content.trim()}`);
          messageCount++;
        }
      } else if (msg.role === "assistant" && includeAssistantMessages) {
        if (filterSensitive) content = filterSensitiveData(content);
        if (content.trim()) {
          parts.push(`[Assistant]: ${content.trim()}`);
          messageCount++;
        }
      }
    }
  }

  if (parts.length === 0) return "";

  return `# Parent Conversation Context
${parts.join("\n\n")}

---
# Your Task (below)
`;
}
```

## 关键设计

### O(1) 队列

```typescript
// queue.ts - Map + 双向链表
class AgentQueue {
  private byId = new Map<string, AgentRecord>();
  private head: string | null = null;
  private tail: string | null = null;

  enqueue(id: string, record: AgentRecord): void { /* O(1) */ }
  dequeue(): AgentRecord | undefined { /* O(1) */ }
  remove(id: string): boolean { /* O(1) */ }
}
```

### Extension 缓存

```typescript
// session-cache.ts - 60s TTL
class ExtensionCache {
  private cache = new Map<string, CachedExtensions>();
  private TTL = 60_000;

  async getOrReload(cwd, loader, force?): Promise<CachedExtensions["data"]> {
    const cached = this.cache.get(cwd);
    if (cached && !force && Date.now() - cached.timestamp < this.TTL) {
      return cached.data;
    }
    const data = await loader.reload();
    this.cache.set(cwd, { data, timestamp: Date.now() });
    return data;
  }
}
```

### 敏感信息过滤

```typescript
// context-filter.ts
const SENSITIVE_PATTERNS = [
  /sk-[\w]{20,}/gi,                              // OpenAI API Keys
  /AIza[A-Za-z0-9_-]{35,}/gi,                    // Google API Keys
  /-----BEGIN (?:RSA|EC|DSA|OPENSSH)?PRIVATE KEY-----/gi,  // PEM 私钥
  /(?:^|\s)eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/gi,  // JWT
  /sk_live_[A-Za-z0-9]{24,}/gi,                  // Stripe
  /ghp_[A-Za-z0-9]{36,}/gi,                      // GitHub tokens
  // ...
];
```

## 注册的工具

| 工具 | 功能 |
|------|------|
| `Agent` | 启动子 agent |
| `get_subagent_result` | 获取 agent 结果 |
| `steer_subagent` | 向运行中的 agent 发消息 |
| `TaskCreate` | 创建任务 |
| `TaskList` | 列出所有任务 |
| `TaskGet` | 查看任务详情 |
| `TaskUpdate` | 更新任务状态 |
| `TaskExecute` | 派子 agent 执行任务 |
| `FleetView` | 查看运行中的 agents |
| `Schedule` | 调度任务 |
| `CancelSchedule` | 取消调度 |
| `LoadCustomAgents` | 加载自定义 agents |
| `CleanupAgents` | 清理所有 agents |

## 集成

在 `server/session-service.ts` 中:

```typescript
import subagentExtension from "../.pi/extensions/subagent/index.js";

// extensionFactories 中注册
extensionFactories: [
  subagentExtension as any,
  memoryExtension as any,
  contextExtension as any,
  // ...
],
```

## 性能优化点

1. **O(1) 队列**: 替代原实现的 O(n) `shift()`
2. **Extension 缓存**: 避免每次 spawn 重复加载
3. **单次 syscall**: 文件读取优化
4. **事件订阅顺序**: 先订阅再发 prompt, 避免错过事件
5. **敏感信息过滤**: 自动过滤 API keys、tokens 等
