# 优化版 Pi-Subagents 实现计划

## Context

当前 `@tintinweb/pi-subagents` 存在多个性能瓶颈，导致 Krebs 项目中子 agent 启动慢、内存占用高。项目已禁用该扩展（见 `server/session-service.ts:136` 扩展列表为空）。

**已识别的性能瓶颈：**

| 问题 | 位置 | 影响 |
|------|------|------|
| O(n) queue shift() | agent-manager.ts | 并发场景下队列操作慢 |
| 每次 spawn 都执行 full loader.reload() | agent-runner.ts | Extension 重复加载 |
| 3次 syscalls 读单个文件 | memory.ts | 内存读取慢 |
| Message array spread copies | contextCollapse.ts | 内存复制开销 |
| Skill path BFS 遍历 | skill-loader.ts | 启动延迟 |
| 无 extension loading 缓存 | agent-runner.ts | 多 agent 场景重复工作 |

## 目标

实现一个轻量、高性能的 subagent 扩展，修复上述性能问题，同时保持功能完整。

## 核心设计

### 1. 架构

```
.pi/extensions/
├── subagent/                    # 新扩展
│   ├── index.ts                 # 入口，注册工具
│   ├── agent-manager.ts         # 优化后的 agent 生命周期管理
│   ├── agent-runner.ts         # 优化后的执行引擎
│   ├── queue.ts                 # 高效队列实现（LinkedList）
│   ├── session-cache.ts         # Session/Extension 缓存
│   └── types.ts                 # 类型定义
```

### 2. 关键优化

#### 2.1 高效队列 (queue.ts)

```typescript
// 使用 Map + 双向链表实现 O(1) 入队出队
class AgentQueue {
  private byId = new Map<string, AgentRecord>();
  private head: string | null = null;
  private tail: string | null = null;

  enqueue(id: string, record: AgentRecord) // O(1)
  dequeue(): AgentRecord | undefined      // O(1)
  remove(id: string): boolean              // O(1)
}
```

#### 2.2 Session/Extension 缓存 (session-cache.ts)

```typescript
// 缓存 loader.reload() 结果，避免每次 spawn 重复加载
class ExtensionCache {
  private cache = new Map<string, CachedExtensions>();
  private lastReload = 0;
  private TTL = 60_000; // 1分钟缓存

  async getOrReload(loader, force?: boolean): Promise<CachedExtensions>
}
```

#### 2.3 优化文件读取

```typescript
// 单次 syscall 替代 3 次
async function safeReadFile(path: string): Promise<string | null> {
  const fd = await fs.open(path, 'r').catch(() => null);
  if (!fd) return null;
  try {
    const stat = await fd.stat();
    if (!stat.isFile()) return null;
    const content = await fd.readFile();
    return content.toString();
  } finally {
    await fd.close();
  }
}
```

#### 2.4 Context 构建与隔离

**原版问题分析：**

原 `pi-subagents` 的 `buildParentContext` 存在安全风险：

```typescript
// 原版实现 (context.js:16-56)
export function buildParentContext(ctx) {
  const entries = ctx.sessionManager.getBranch();
  // 直接拼接所有 user/assistant 消息和 compaction summaries
  // 风险：敏感信息（API keys、密码）直接泄露给 subagent
}
```

**Krebs 安全 Context 设计：**

```typescript
// 敏感信息过滤模式（增强版，覆盖常见 secret 格式）
const SENSITIVE_PATTERNS = [
  // API Keys
  /sk-[\w]{20,}/gi,                              // OpenAI
  /sk-ant-[\w]{20,}/gi,                          // Anthropic
  /sk-[A-Za-z0-9]{48}/gi,                        // Anthropic (full)
  /AIza[A-Za-z0-9_-]{35,}/gi,                    // Google API
  /sq0[A-Za-z0-9_-]{50,}/gi,                     // Square
  /EAA[A-Za-z0-9]{50,}/gi,                       // Facebook
  /[A-Za-z0-9_]{20,}?(?:api[_-]?key|API[_-]?KEY)["\s:=]+[^"'\s]{10,}/gi,

  // AWS
  /(?:aws[_-]?)?(?:access[_-]?key[_-]?id|secret[_-]?access[_-]?key)["\s:=]+[\w\/-]{20,}/gi,
  /AKIA[A-Z0-9]{16}/gi,                          // AWS Access Key ID

  // Generic secrets
  /(?:"password"|'password'|password)["\s:=]+["']?[^\s"']{8,}/gi,
  /(?:"secret"|'secret'|secret)["\s:=]+["']?[\w\/-]{16,}/gi,
  /(?:"token"|'token'|token)["\s:=]+["']?[A-Za-z0-9_\-]{20,}/gi,

  // Private keys
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/gi,

  // JWT
  /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/gi,

  // Connection strings
  /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']+:[^\s"']+@[^\s"']+/gi,

  // GitHub tokens
  /gh[pousr]_[A-Za-z0-9_]{36,}/gi,

  // Stripe
  /sk_live_[A-Za-z0-9]{24,}/gi,
  /rk_live_[A-Za-z0-9]{24,}/gi,
];

function filterSensitiveData(text: string): string {
  let filtered = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    filtered = filtered.replace(pattern, '[REDACTED]');
  }
  return filtered;
}

// 干净上下文构建
interface CleanContextOptions {
  includeUserMessages: boolean;  // 默认 true
  includeAssistantMessages: boolean;  // 默认 true
  includeSummaries: boolean;  // 默认 false（不包含 consolidation summaries）
  maxMessages: number;  // 默认 10（限制历史长度）
  filterSensitive: boolean;  // 默认 true
}

function buildCleanContext(
  ctx,
  options: CleanContextOptions = {}
): string {
  const {
    includeUserMessages = true,
    includeAssistantMessages = true,
    includeSummaries = false,
    maxMessages = 10,
    filterSensitive = true,
  } = options;

  const entries = ctx.sessionManager.getBranch();
  if (!entries?.length) return "";

  const parts: string[] = [];
  let messageCount = 0;

  for (const entry of entries) {
    if (entry.type === "message") {
      const msg = entry.message;
      let content = "";

      if (msg.role === "user" && includeUserMessages) {
        content = extractText(msg.content);
        if (filterSensitive) content = filterSensitiveData(content);
        if (content.trim()) {
          parts.push(`[User]: ${content.trim()}`);
          messageCount++;
        }
      } else if (msg.role === "assistant" && includeAssistantMessages) {
        content = extractText(msg.content);
        if (filterSensitive) content = filterSensitiveData(content);
        if (content.trim()) {
          parts.push(`[Assistant]: ${content.trim()}`);
          messageCount++;
        }
      }

      if (messageCount >= maxMessages) break;
    } else if (entry.type === "compaction" && includeSummaries) {
      // 默认不包含 consolidation summaries（可能含敏感信息）
      if (entry.summary) {
        parts.push(`[Summary]: ${entry.summary}`);
      }
    }
  }

  if (parts.length === 0) return "";

  return `# Parent Conversation Context
The following is the conversation history from the parent session that spawned you.
Use this context to understand what has been discussed and decided so far.

${parts.join("\n\n")}

---
# Your Task (below)
`;
}
```

**Context 隔离级别：**

| 级别 | 描述 | 适用场景 |
|------|------|----------|
| `clean` | 无 parent context，仅 prompt | 默认，推荐大多数场景 |
| `minimal` | 仅保留最后 N 条消息，过滤敏感 | 需要部分上下文 |
| `full` | 保留全部过滤后的消息 | 需要完整历史 |
| `summary` | 仅保留 consolidation summaries | 需要高层理解 |

**Extension 工具隔离：**

Subagent 默认不继承 Krebs 专用 extensions：

```typescript
// agent-runner.ts 中的 extensions 配置
const extensionsOverride = (base) => ({
  ...base,
  // 排除 Krebs 专用 extensions
  extensions: base.extensions.filter((ext) => {
    const name = extensionCanonicalName(ext.path);
    // 排除可能泄露信息的 extensions
    return ![
      'memory-context',      // 注入 MEMORY.md
      'memory',              // 内存 consolidation
      'session-history-rag', // 历史 RAG
      'goal-constraint',     // 目标约束
      'self-verification',  // 自验证
    ].includes(name);
  }),
});
```

**Agent 类型的 Context 配置：**

```typescript
// 默认 agent 类型配置
const DEFAULT_AGENTS = {
  "general-purpose": {
    inheritContext: false,  // 默认不继承
    extensions: true,       // 继承基础工具
    maxContextMessages: 0,  // 无限制（不使用 parent context）
  },
  "research": {
    inheritContext: true,   // 需要上下文
    maxContextMessages: 20,
    filterSensitive: true,
  },
};
```

### 3. 完整功能模块

#### 3.1 工具集

| 工具 | 功能 |
|------|------|
| `Agent` | 启动子 agent，支持 background/foreground |
| `get_subagent_result` | 获取 agent 结果 |
| `steer_subagent` | 向运行中的 agent 发消息 |
| `TaskCreate` | 创建任务 |
| `TaskList` | 列出所有任务 |
| `TaskGet` | 查看任务详情 |
| `TaskUpdate` | 更新任务状态 |
| `TaskExecute` | 派子 agent 执行任务 |

#### 3.2 Scheduling 调度器

```typescript
// 支持 cron 表达式和间隔调度
class SubagentScheduler {
  addJob(job: ScheduledJob): string
  removeJob(id: string): void
  getNextRun(id: string): Date | null
  list(): ScheduledJob[]
}
```

#### 3.3 Custom Agent 加载

```typescript
// 从 .pi/agents/*.md 加载自定义 agent
interface AgentDefinition {
  name: string;
  description: string;
  displayName?: string;
  tools: string[];
  model?: string;
  thinking?: string;
  maxTurns?: number;
  systemPrompt: string;
}

function loadCustomAgents(cwd: string): AgentDefinition[]
```

#### 3.4 Fleet View UI

**注意：** Krebs 是无 UI 的 WebSocket gateway，不支持 TUI 组件渲染。Fleet View 实现为 **无操作（no-op）**，不尝试调用 `ctx.ui.setWidget()`。

```typescript
// fleet-view.ts
class FleetView {
  setUICtx(ui: any) {
    // No-op: Krebs gateway 不支持 TUI
    // 日志记录以便调试
    console.debug("[FleetView] TUI not available in gateway mode");
  }
}
```

### 4. 实现文件

| 文件 | 职责 |
|------|------|
| `.pi/extensions/subagent/index.ts` | 扩展入口，工具注册、事件处理 |
| `.pi/extensions/subagent/agent-manager.ts` | Agent 生命周期、队列、并发控制 |
| `.pi/extensions/subagent/agent-runner.ts` | Session 创建、执行、context 构建 |
| `.pi/extensions/subagent/queue.ts` | 高效队列实现（O(1)） |
| `.pi/extensions/subagent/session-cache.ts` | Extension/Session 缓存 |
| `.pi/extensions/subagent/types.ts` | 类型定义 |
| `.pi/extensions/subagent/scheduler.ts` | 定时调度器 |
| `.pi/extensions/subagent/custom-agents.ts` | .md 文件加载 |
| `.pi/extensions/subagent/fleet-view.ts` | Fleet View UI（no-op，Krebs 无 TUI） |
| `.pi/extensions/subagent/group-join.ts` | 多 agent 结果合并 |
| `.pi/extensions/subagent/memory.ts` | 子 agent 记忆管理 |
| `.pi/extensions/subagent/context.ts` | 上下文构建与敏感信息过滤 |
| `.pi/extensions/subagent/context-filter.ts` | 敏感信息过滤 |
| `.pi/extensions/subagent/worktree.ts` | git worktree 隔离 |
| `.pi/extensions/subagent/skill-loader.ts` | skill 加载（优化版） |

### 5. 入口修改

**server/session-service.ts**:

```typescript
// 移除 @tintinweb/pi-subagents 和 @tintinweb/pi-tasks
// 替换为本地实现
import subagentExtension from "./.pi/extensions/subagent/index.js";
import taskExtension from "./.pi/extensions/task/index.js"; // 可选分离

const resourceLoader = new DefaultResourceLoader({
  ...
  extensionFactories: [
    subagentExtension as any,
    taskExtension as any,  // 如需要
    memoryExtension as any,
    ...
  ],
});
```

## 关键复用

### 现有 Krebs 基础设施

- `server/services/memory/engine.ts` - 内存 consolidation
- `server/services/self-verification/` - 自验证机制
- `.pi/extensions/context/` - 上下文管理扩展
- `@mariozechner/pi-coding-agent` - 核心 session API

### 原 pi-subagents 思路复用

- `agent-runner.ts` 的 session 创建逻辑
- `agent-types.ts` 的 agent 类型解析
- 工具定义和渲染模式

## 验证方案

1. **构建测试**: `bun run build` 通过
2. **类型检查**: `bunx tsc --noEmit` 无错误
3. **功能验证**:
   - 启动单个 foreground agent
   - 启动多个 background agents 并验证并发
   - 使用 `get_subagent_result` 获取结果
   - 使用 `steer_subagent` 干预运行中的 agent
4. **性能验证**:
   - 对比启动 10 个 background agents 的总时间
   - 监控内存占用

## 功能范围

- **完整功能**：包含 Scheduling、Custom Agents、Fleet View 等
- **支持 .pi/agents/*.md**：从 markdown 文件加载自定义 agent 定义

## 实现顺序

0. **Phase 0: 安全 Context 隔离（关键）**
   - 实现 context-filter.ts（敏感信息过滤）
   - 实现 context.ts（干净上下文构建）
   - 配置默认 agent 类型的隔离策略
   - 验证无敏感信息泄露

1. **Phase 1: 核心基础设施**
   - 创建目录结构
   - 实现 types.ts 类型定义
   - 实现 queue.ts 高效队列
   - 实现 session-cache.ts 缓存

2. **Phase 2: Agent 执行引擎**
   - 实现 agent-runner.ts
   - 实现 agent-manager.ts
   - 集成 context 隔离

3. **Phase 3: 工具注册**
   - 实现 index.ts 入口
   - 注册 Agent/get_subagent_result/steer_subagent 工具
   - 实现 memory.ts 和 skill-loader.ts

4. **Phase 4: 高级功能**
   - 实现 scheduler.ts 调度器
   - 实现 custom-agents.ts
   - 实现 fleet-view.ts
   - 实现 group-join.ts
   - 实现 worktree.ts

5. **Phase 5: 集成与测试**
   - 修改 server/session-service.ts
   - 功能验证
   - 性能验证

## 安全考虑

### Context 泄露风险

| 风险 | 原版处理 | Krebs 优化 |
|------|----------|------------|
| API keys in messages | 直接传递 | 敏感模式过滤 |
| 密码/secret | 直接传递 | 敏感模式过滤 |
| Memory consolidation | 包含 summaries | 默认不继承 |
| Extension 工具 | 全部继承 | 默认排除 Krebs 专用 |

### 默认策略

```typescript
// 默认配置（安全第一）
const DEFAULT_SUBAGENT_CONFIG = {
  inheritContext: false,      // 默认不继承 parent context
  includeSummaries: false,    // 不继承 consolidation summaries
  extensions: "minimal",      // 只继承基础工具
  filterSensitive: true,      // 始终过滤敏感信息
};
```

### 测试验证

1. **敏感信息泄露测试**：
   ```typescript
   // 测试：parent 包含 API key，subagent 不应看到
   const parentMessages = [
     { role: "user", content: "Use API key sk-1234567890abcdef" }
   ];
   const filtered = buildCleanContext(parentMessages);
   assert(!filtered.includes("sk-1234567890"));
   ```

2. **Extension 隔离测试**：
   ```typescript
   // 测试：subagent 不应加载 memory-context extension
   const loader = createSubagentLoader();
   const extensions = loader.getExtensions();
   const extNames = extensions.map(e => e.name);
   assert(!extNames.includes("memory-context"));
   ```

## 设计决策与风险

### 已解决

| 问题 | 解决方案 |
|------|----------|
| Fleet View UI 不适用 | 标记为 no-op，Krebs gateway 无 TUI 支持 |
| 敏感信息过滤不完整 | 增强正则模式，覆盖 AWS/GCP/GitHub/Stripe/JWT/私钥等 |

### 高优先级 - 必须确认

1. **API 版本兼容性:**
   - Krebs 使用 `@mariozechner/pi-coding-agent`
   - pi-subagents 基于 `@earendil-works/pi-coding-agent`
   - **方案**: 扩展工厂函数签名兼容，传入 `as any` 绕过类型检查
   - **风险**: 运行时可能因 API 方法签名变化出错

2. **Extension 过滤实现:**
   - 在 `agent-runner.ts` 中实现 `extensionsOverride`
   - Subagent 默认排除 Krebs 专用 extensions

### 中优先级 - 建议确认

3. **Session 隔离:**
   - AgentManager 是 extension 级别单例
   - **方案**: Session 隔离通过 `ctx.sessionManager` 实现
   - **风险**: 不同 WebSocket session 的 agents 可能混入同一个 Manager

4. **敏感信息过滤限制:**
   - 无法处理所有边界情况（如 URL 编码、拼接等）
   - **方案**: 持续迭代正则模式

### 低优先级 - 优化建议

5. **缓存策略**: 可基于 mtime 验证而非固定 TTL
6. **并发安全**: Node.js 单线程，无需锁
