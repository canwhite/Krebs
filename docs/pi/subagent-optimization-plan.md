# 优化版 Pi-Subagents 实现计划

## Context

**Krebs 已完成 `@earendil-works/pi-coding-agent` 迁移（2026-06-30）**

Krebs 原使用 `@mariozechner/pi-coding-agent@0.66.1`，现迁移至 `@earendil-works/pi-coding-agent@0.80.2`。迁移后 Krebs 自建了完整的扩展体系，替代了原 `@tintinweb/pi-subagents` 的部分功能。

**Krebs 当前扩展体系：**

| 扩展 | 功能 | 状态 |
|------|------|------|
| `memory/` | 内存 consolidation | ✓ 自研 |
| `context/` | 上下文压缩（micro-compact + collapse） | ✓ 自研 |
| `goal-constraint/` | 目标约束 + drift 检测 | ✓ 自研 |
| `self-verification/` | 自验证 + 修正注入 | ✓ 自研 |
| `session-history-rag/` | 历史 RAG 检索 | ✓ 自研 |
| `memory-context/` | MEMORY.md 注入 | ✓ 自研 |

**待实现**：subagent 能力（Agent 工具、background execution、scheduling）

**已识别的性能瓶颈（原 @tintinweb/pi-subagents）：**

| 问题 | 位置 | 影响 |
|------|------|------|
| O(n) queue shift() | agent-manager.ts | 并发场景下队列操作慢 |
| 每次 spawn 都执行 full loader.reload() | agent-runner.ts | Extension 重复加载 |
| 3次 syscalls 读单个文件 | memory.ts | 内存读取慢 |
| Message array spread copies | context.ts | 内存复制开销（新实现需避免） |
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
// Agent 记录
interface AgentRecord {
  id: string;
  session: AgentSession;        // subagent 的 session 实例
  type: string;                 // agent 类型（如 "general-purpose"）
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  createdAt: number;
  abortSignal?: AbortSignal;    // 用于取消 agent
  timeoutMs?: number;           // 可选超时
  result?: AgentMessage[];      // agent_end 事件中的 messages，用于 get_subagent_result 返回
  unsubscribe?: () => void;    // session.subscribe() 返回的清理函数
}

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
// 缓存键：cwd（不同工作目录需要不同缓存）
interface CachedExtensions {
  data: Awaited<ReturnType<DefaultResourceLoader["reload"]>>;
  timestamp: number;
}

class ExtensionCache {
  private cache = new Map<string, CachedExtensions>();
  private TTL = 60_000; // 1分钟缓存

  async getOrReload(cwd: string, loader: { reload(): Promise<any> }, force?: boolean): Promise<CachedExtensions> {
    const cached = this.cache.get(cwd);
    if (cached && !force && Date.now() - cached.timestamp < this.TTL) {
      return cached.data;
    }
    // 重新加载
    const data = await loader.reload();
    this.cache.set(cwd, { data, timestamp: Date.now() });
    return data;
  }
}
```

#### 2.3 优化文件读取

```typescript
import { open } from "node:fs/promises";

// 单次 syscall 替代 3 次
async function safeReadFile(path: string): Promise<string | null> {
  const fd = await open(path, 'r').catch(() => null);
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

#### 2.4 Extension 过滤（已验证可行）

**研究结论**：`DefaultResourceLoader` 支持 `extensionsOverride` 选项。

```typescript
// 从 extension path 提取 canonical name（如 ".pi/extensions/memory-context/index.ts" → "memory-context"）
function extensionCanonicalName(path: string): string {
  return path.split("/").pop()?.replace(/\/index\.ts$/, "") ?? path;
}

// agent-runner.ts 中的 extensionsOverride 实现
const extensionsOverride = (base) => {
  const excludeNames = new Set(['memory-context', 'memory', 'session-history-rag', 'goal-constraint', 'self-verification']);
  return {
    ...base,
    extensions: base.extensions.filter((e) => {
      const name = extensionCanonicalName(e.path);
      return !excludeNames.has(name);
    }),
  };
};

const loader = new DefaultResourceLoader({
  cwd,                    // 来自 agent-runner.ts 参数
  agentDir,
  extensionsOverride,
  // ...
});
```

**验证**：pi-subagents 实际使用此机制过滤 extension。`extensionsOverride` 在 `loader.reload()` 时应用。

#### 2.5 Context 构建与隔离

**架构说明（来自 pi-subagents 研究）：**

Subagent 的工具执行发生在 **parent 会话**的上下文中，而不是 subagent 自己：

```
Parent Agent 会话
  └── 调用 Agent 工具（execute 函数）
        └── ctx = parent 的 extension context
        └── runAgent(ctx, ...)  ← 传入 parent ctx
              └── buildParentContext(ctx)  ← 用 parent ctx 获取 parent messages
              └── createAgentSession()  ← 创建独立的 subagent session
                    └── subagent 有自己的 sessionManager（无法直接访问 parent messages）
```

**原版问题**：`buildParentContext` 直接拼接所有消息，敏感信息泄露给 subagent。

**Krebs 安全 Context 设计**：

```typescript
import type { TextContent, ImageContent } from "@earendil-works/pi-ai";

// 敏感信息过滤模式（增强版）
const SENSITIVE_PATTERNS = [
  /sk-[\w]{20,}/gi,                              // OpenAI / Anthropic API Keys（覆盖所有 sk- 开头）
  /AIza[A-Za-z0-9_-]{35,}/gi,                    // Google API Keys
  /AKIA[A-Z0-9]{16}/gi,                          // AWS Access Key ID
  /-----BEGIN (?:RSA|EC|DSA|OPENSSH)?PRIVATE KEY-----/gi,  // PEM 私钥（无空格）
  /(?:^|\s)eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/gi,  // JWT（\s 匹配所有空白，含空格/tab/换行；单引号误触发率高，已移除）
  // ... 更多模式见完整实现
];

// 从 AgentMessage content 中提取纯文本
// ImageContent 被静默丢弃（图片无法转为文本）
function extractText(content: string | TextContent[] | ImageContent[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((c): c is TextContent => c.type === "text")
    .map(c => c.text)
    .join("");
}

function filterSensitiveData(text: string): string {
  let filtered = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    filtered = filtered.replace(pattern, '[REDACTED]');
  }
  return filtered;
}

// buildCleanContext 选项
interface CleanContextOptions {
  includeUserMessages?: boolean;   // 默认 true
  includeAssistantMessages?: boolean; // 默认 true
  includeSummaries?: boolean;     // 默认 false
  maxMessages?: number;           // 默认 10，0 = 不使用 parent context
  filterSensitive?: boolean;       // 默认 true
}

// 干净上下文构建（注意：ctx 是 parent 的 extension context）
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

  // ctx 是 parent 的 extension context，sessionManager.getBranch() 返回 parent 的消息
  const entries = ctx.sessionManager.getBranch();
  if (!entries?.length) return "";

  // maxMessages = 0 表示不使用 parent context（安全默认）
  if (maxMessages === 0) return "";

  // 反向遍历获取最后 N 条消息（getBranch() 返回从头到尾，尾是最新的）
  const reversed = [...entries].reverse();
  const parts: string[] = [];
  let messageCount = 0;

  for (const entry of reversed) {
    // summary_anchor 始终先处理，不受 maxMessages 限制（break 在消息添加之前，不影响已收集的 summaries）
    if (entry.type === "summary_anchor" && includeSummaries) {
      if (entry.summary) {
        parts.push(`[Summary]: ${entry.summary}`);
      }
      continue;  // summaries 不计入 messageCount
    }
    if (entry.type === "message") {
      const msg = entry.message;
      if (!msg) continue;
      // 先判断是否达到 limit，再决定是否添加（break 前最后一条消息不会被添加）
      if (messageCount >= maxMessages) break;
      let content = extractText(msg.content);

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

// AgentTool 实现示例
// [需从 SDK 导入] AgentSession, ExtensionContext, AgentToolResult
// [需从 Krebs 内部导入] createSubagentSession, waitForSessionComplete
async function agentTool(
  params: AgentToolParams,
  ctx: ExtensionContext
): Promise<AgentToolResult> {
  const {
    name = `agent-${Date.now()}`,
    task = "",
    type = "general-purpose",
    background = false,
    inheritContext = false,
    maxContextMessages = 0,
    includeSummaries = false,
  } = params;

  // 构建 prompt：如果 inheritContext 则注入过滤后的 parent messages
  const cleanContext = inheritContext
    ? buildCleanContext(ctx, { maxMessages: maxContextMessages, includeSummaries })
    : "";
  const fullPrompt = cleanContext
    ? `${cleanContext}\n\n# Your Task\n${task}`
    : task;

  // 创建 agentRecord（用于状态追踪和事件处理）
  const agentRecord: AgentRecord = {
    id: name,
    session: undefined as any,  // 稍后填充
    type,
    status: "pending",
    createdAt: Date.now(),
  };

  // 创建 subagent session（内部创建带 extensionsOverride 的 resourceLoader）
  const session = await createSubagentSession(
    fullPrompt,
    type,
    ctx.cwd ?? process.cwd(),
    undefined,
    { inheritContext, maxContextMessages, includeSummaries }
  );
  agentRecord.session = session;

  if (background) {
    // 后台模式：立即返回，agent 在后台运行
    // 保存 unsubscribe 函数，agent 结束时调用清理
    const unsubscribe = session.subscribe((event) => handleSubagentEvent(event, session, agentRecord));
    agentRecord.unsubscribe = unsubscribe;
    return { result: { agentId: session.id, status: "running" } };
  } else {
    // 前台模式：等待完成（注意：会阻塞 parent，需谨慎使用）
    try {
      const result = await waitForSessionComplete(session);
      return { result: { agentId: session.id, messages: result.messages } };
    } catch (err) {
      return { result: { agentId: session.id, error: String(err) } };
    }
  }
}

// 事件处理函数
function handleSubagentEvent(event: SubagentEvent, session: AgentSession, record: AgentRecord) {
  switch (event.type) {
    case "agent_start":
      record.status = "running";
      break;
    case "agent_end":
      record.status = "done";
      record.result = event.messages;
      // 清理订阅
      if (record.unsubscribe) record.unsubscribe();
      break;
    case "turn_end":
      // 可选：记录 turn 信息
      break;
    case "tool_execution_start":
      // 可选：记录工具执行日志
      break;
    case "tool_execution_end":
      // 可选：记录工具执行完成
      break;
    case "error":
      record.status = "failed";
      console.error(`[Subagent] Error: ${event.error}`);
      break;
  }
}
```

**Context 隔离级别：**

| 级别 | inheritContext | maxContextMessages | includeSummaries | 说明 |
|------|----------------|-------------------|-----------------|------|
| `clean` | false | 0 | false | 无 parent context，仅 prompt（默认） |
| `minimal` | true | N | false | 仅保留最后 N 条消息，过滤敏感 |
| `full` | true | Infinity | false | 保留全部过滤后的消息 |
| `summary` | true | 0 | true | 仅保留 consolidation summaries（需通过 CleanContextOptions 配置） |

**Extension 工具隔离：**

Subagent 默认不继承 Krebs 专用 extensions：

**注意**：`context` extension **不需要**被排除。原因是：
- 每个 subagent 通过 `extensionsOverride` 创建**独立的** `DefaultResourceLoader` 实例
- subagent 的 `context` 事件回调只访问 subagent 自己的 `event.messages`
- parent 的 `context` 事件回调访问 parent 自己的 `event.messages`
- 两者消息空间完全隔离，不会相互影响

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
// Agent 配置选项
interface AgentOptions {
  type?: string;
  inheritContext?: boolean;
  extensions?: "inherit" | "minimal";
  maxContextMessages?: number;
  filterSensitive?: boolean;
  includeSummaries?: boolean;  // 是否在 context 中包含 consolidation summaries
  timeoutMs?: number;
  cwd?: string;
  model?: string;
}

// 默认 agent 类型配置
// extensions: "inherit" = 使用 extensionsOverride 过滤后的 extensions（排除 Krebs 专用，保留基础工具）
// extensions: "minimal" = 仅使用 tools（无任何 extensions，包含内置工具如 read/bash/edit）
const DEFAULT_AGENTS = {
  "general-purpose": {
    inheritContext: false,  // 默认不继承
    extensions: "minimal",  // 仅 tools，无 extensions
    maxContextMessages: 0,  // 0 = 不使用 parent context（buildCleanContext 直接返回空）
    includeSummaries: false,
    timeoutMs: 300_000,    // 5 分钟超时
  },
  "research": {
    inheritContext: true,   // 需要上下文
    extensions: "inherit", // 使用过滤后的 extensions
    maxContextMessages: 20,
    filterSensitive: true,
    includeSummaries: false,
    timeoutMs: 600_000,    // 10 分钟超时
  },
};

// 未知类型回退到 "general-purpose"
function getAgentConfig(type: string): typeof DEFAULT_AGENTS["general-purpose"] {
  return DEFAULT_AGENTS[type] ?? DEFAULT_AGENTS["general-purpose"];
}
```

### 3. 完整功能模块

#### 3.1 工具集

| 工具 | 功能 |
|------|------|
| `Agent` | 启动子 agent，支持 background/foreground |
| `get_subagent_result` | 获取 agent 结果 |
| `steer_subagent` | 向运行中的 agent 发消息（需传 `streamingBehavior: "steer"`） |
| `TaskCreate` | 创建任务 |
| `TaskList` | 列出所有任务 |
| `TaskGet` | 查看任务详情 |
| `TaskUpdate` | 更新任务状态 |

**工具返回类型定义**：
```typescript
// get_subagent_result 返回值
interface GetSubagentResultResult {
  agentId: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  messages?: AgentMessage[];  // 仅 done 时返回
  error?: string;            // 仅 failed 时返回
}
```

**工具参数定义**：
```typescript
interface AgentToolParams { name?: string; task: string; type?: string; background?: boolean; inheritContext?: boolean; maxContextMessages?: number; }
interface GetSubagentResultParams { agentId: string; }
interface SteerSubagentParams { agentId: string; message: string; streamingBehavior?: "steer" | "followUp"; /* message 不支持多行字符串，需自行处理换行 */ }
interface TaskCreateParams { name: string; description?: string; /* name 在同一 session 内唯一，重复创建时返回已有 task */ }
interface TaskListParams { /* filter options */ }
interface TaskGetParams { taskId: string; }
interface TaskUpdateParams { taskId: string; status?: "pending" | "running" | "done" | "failed" | "cancelled"; }
```

**说明**：`TaskExecute` 由 `Agent` 工具实现（通过 `task` 参数），无需独立工具。

#### 3.2 Scheduling 调度器

```typescript
// 支持 cron 表达式和间隔调度
interface ScheduledJob {
  id: string;
  agentId: string;
  cron?: string;           // cron 表达式
  intervalMs?: number;    // 或间隔（毫秒）
  task: string;
  options?: AgentOptions;
  createdAt: number;
  nextRunAt?: Date;
}

class SubagentScheduler {
  addJob(job: ScheduledJob): string
  removeJob(id: string): void
  getNextRun(id: string): Date | null
  list(): ScheduledJob[]
  pause(): void        // 暂停所有调度任务
  resume(): void       // 恢复所有调度任务
  stop(): Promise<void>  // 停止所有调度任务
}
```

#### 3.3 Custom Agent 加载

```typescript
import { join } from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";

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

function loadCustomAgents(cwd: string): AgentDefinition[] {
  const agentsDir = join(cwd, ".pi", "agents");
  if (!existsSync(agentsDir)) return [];

  const files = readdirSync(agentsDir).filter(f => f.endsWith(".md"));
  const agents: AgentDefinition[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(agentsDir, file), "utf-8");
      const agent = parseAgentDefinition(content, file);
      if (agent) agents.push(agent);
    } catch (err) {
      console.warn(`[CustomAgents] Failed to load ${file}: ${err}`);
    }
  }

  return agents;
}

/**
 * 解析 .md 文件中的 agent 定义
 * 支持 YAML frontmatter 格式：
 * ---
 * name: my-agent
 * description: xxx
 * tools: ["read", "bash"]
 * ---
 * system prompt...
 */
function parseAgentDefinition(content: string, fileName: string): AgentDefinition | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  try {
    const [, frontmatter, systemPrompt] = match;
    const data = {} as Record<string, unknown>;
    // 简单的 YAML 解析（仅支持顶层键值对，支持带冒号的值如 URL）
    for (const line of frontmatter.split("\n")) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      if (!key) continue;
      if (value.startsWith("[")) {
        // 简单数组解析
        data[key] = value.replace(/[\[\]]/g, "").split(",").map(s => s.trim().replace(/^["']|["']$/g, ""));
      } else {
        data[key] = value.replace(/^["']|["']$/g, "");
      }
    }
    return {
      name: String(data.name ?? fileName.replace(".md", "")),
      description: String(data.description ?? ""),
      displayName: data.displayName ? String(data.displayName) : undefined,
      tools: Array.isArray(data.tools) ? data.tools as string[] : [],
      model: data.model ? String(data.model) : undefined,
      thinking: data.thinking ? String(data.thinking) : undefined,
      maxTurns: data.maxTurns ? Number(data.maxTurns) : undefined,
      systemPrompt: systemPrompt.trim(),
    };
  } catch (err) {
    console.warn(`[CustomAgents] Failed to parse ${fileName}: ${err}`);
    return null;
  }
}
```

#### 3.4 Fleet View UI

**注意：** Krebs 是无 UI 的 WebSocket gateway，不支持 TUI 组件渲染。Fleet View 实现为 **无操作（no-op）**，不尝试调用 `ctx.ui.setWidget()`。

```typescript
// fleet-view.ts
class FleetView {
  setUICtx(ui: any) {
    // No-op: Krebs gateway 不支持 TUI
    // 使用 console.warn 以便调试时发现问题
    console.warn("[FleetView] TUI not available in gateway mode");
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
| `.pi/extensions/subagent/group-join.ts` | 多 agent 结果合并（等待一组 agents 完成后汇总结果） |
| `.pi/extensions/subagent/memory.ts` | 子 agent 记忆管理 |
| `.pi/extensions/subagent/context.ts` | 上下文构建（buildCleanContext + CleanContextOptions） |
| `.pi/extensions/subagent/context-filter.ts` | 敏感信息过滤（filterSensitiveData + SENSITIVE_PATTERNS） |
| `.pi/extensions/subagent/worktree.ts` | git worktree 隔离（每个 subagent 独立的 worktree 目录） |
| `.pi/extensions/subagent/skill-loader.ts` | skill 加载（优化版，使用 mtime 缓存避免重复扫描） |

**agent-runner.ts 实现要点**：
```typescript
// 创建 subagent session
// createSubagentSession 内部创建带 extensionsOverride 的 resourceLoader，不从外部传入
async function createSubagentSession(
  prompt: string,
  type: string,
  cwd: string,
  _resourceLoader: undefined,  // 保留参数位置，实际由内部创建
  options?: AgentOptions
): Promise<AgentSession> {
  const config = getAgentConfig(type);
  const mergedOptions = { ...config, ...options };

  // 内部创建带过滤的 resourceLoader（不复用 parent 的）
  // extensionsOverride 定义在模块层，通过闭包捕获
  const filteredLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    extensionsOverride,  // 过滤 Krebs 专用 extensions
    skillsOverride: () => ({ skills, diagnostics: [] }),
    systemPromptOverride: () => subagentSystemPrompt,
    noPromptTemplates: true,
    noThemes: true,
  });

  // 缓存（以 cwd 为键），首次调用会触发 reload 并缓存结果
  const cached = await extensionCache.getOrReload(cwd, filteredLoader);

  // 创建 session（authStorage/modelRegistry 新建，不共享 parent 的）
  const session = await createAgentSession({
    cwd,
    model: /* 见 MODEL_CONFIG */,
    authStorage: AuthStorage.create(),
    modelRegistry: ModelRegistry.create(AuthStorage.create()),
    tools: ["read", "bash", "edit"],
    customTools: [bashTool, ...TOOLS.map((t) => t.tool)],
    resourceLoader: filteredLoader,
  });

  // 启动超时计时器（session.id 来自 SDK AgentSession）
  if (mergedOptions.timeoutMs) {
    startTimeout(session, mergedOptions.timeoutMs, session.id);
  }

  // 执行 prompt
  session.prompt(prompt);

  // 入队（由 caller 传入 queue 实例；实际实现中由 agent-manager.ts 统一管理）
  // queue.enqueue(session.id, { id: session.id, session, type, status: "pending", createdAt: Date.now(), timeoutMs: mergedOptions.timeoutMs });

  return session;
}

// 启动超时计时器
function startTimeout(
  session: AgentSession,
  timeoutMs: number,
  agentId: string
): void {
  setTimeout(() => {
    console.warn(`[Subagent] Agent ${agentId} timed out after ${timeoutMs}ms`);
    session.abort();  // abort() 来自 SDK AgentSession
  }, timeoutMs);
}
```

**说明**：`waitForSessionComplete` 复用 Krebs 已在 `server/session-service.ts` 中实现的函数。

**index.ts 工具注册示例**：
```typescript
// index.ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { AgentTool, GetSubagentResultTool, SteerSubagentTool } from "./agent-tool.js";
import { TaskCreateTool, TaskListTool, TaskGetTool, TaskUpdateTool } from "./task-tools.js";

export default function (api: ExtensionAPI) {
  // 注册 Agent 工具
  api.registerTool(AgentTool);

  // 注册 result 获取工具
  api.registerTool(GetSubagentResultTool);

  // 注册 steer 工具
  api.registerTool(SteerSubagentTool);

  // 注册 Task 工具
  api.registerTool(TaskCreateTool);
  api.registerTool(TaskListTool);
  api.registerTool(TaskGetTool);
  api.registerTool(TaskUpdateTool);

  // ... 事件监听器注册
}
```

**group-join.ts 接口**：
```typescript
interface AgentResult { agentId: string; status: string; messages?: AgentMessage[]; error?: string; }

interface GroupJoinOptions {
  agentIds: string[];           // 要等待的 agent ID 列表
  timeoutMs?: number;            // 可选超时
  onComplete?: (results: Map<string, AgentResult>) => void;
}

async function groupJoin(opts: GroupJoinOptions): Promise<Map<string, AgentResult>>
```

**worktree.ts 接口**：
```typescript
interface WorktreeOptions {
  agentId: string;
  cwd: string;       // parent cwd
  branch?: string;   // 可选分支名
}

class WorktreeManager {
  async create(opts: WorktreeOptions): Promise<string>  // 返回 worktree 路径
  async delete(agentId: string): Promise<void>
  getPath(agentId: string): string | undefined
}
```

**memory.ts**：subagent 记忆管理，指 subagent 私有的 `.subagent-memory/` 目录，用于存储 subagent 的中间结果，不与 parent 或其他 subagent 共享。subagent 结束后可选择将记忆合并到 parent。

### 5. 入口修改（Phase 5）

**目标**：当自研 subagent 扩展完成时，更新 `server/session-service.ts`：

```typescript
// 移除 @tintinweb/pi-subagents 和 @tintinweb/pi-tasks
// 替换为本地实现
import subagentExtension from "./.pi/extensions/subagent/index.js";
import memoryExtension from "./.pi/extensions/memory/index.js";
import contextExtension from "./.pi/extensions/context/index.js";
import memoryContextExtension from "./.pi/extensions/memory-context/index.js";
import sessionHistoryExtension from "./.pi/extensions/session-history-rag/index.js";
import goalConstraintExtension from "./.pi/extensions/goal-constraint/index.js";
import selfVerificationExtension from "./.pi/extensions/self-verification/index.js";

const resourceLoader = new DefaultResourceLoader({
  ...
  extensionFactories: [
    memoryExtension as any,
    contextExtension as any,
    memoryContextExtension as any,
    sessionHistoryExtension as any,
    goalConstraintExtension as any,
    selfVerificationExtension as any,
    subagentExtension as any,  // subagent 最后加载，确保工具能正确注册
  ],
});
```

**注意**：extension factories 加载顺序会影响工具注册优先级。subagentExtension 应最后加载。

**说明**：`TaskCreate`/`TaskList` 等任务工具属于 subagent 扩展内部功能（见 `index.ts` 工具注册），无需独立扩展。

## 关键复用

### 现有 Krebs 基础设施

- `server/services/memory/engine.ts` - 内存 consolidation
- `server/services/self-verification/` - 自验证机制
- `.pi/extensions/context/` - 上下文管理扩展
- `@earendil-works/pi-coding-agent` - 核心 session API
- `@earendil-works/pi-agent-core` - Agent core 类型

### 原 pi-subagents 思路复用

- `agent-runner.ts` 的 session 创建逻辑
- `agent-types.ts` 的 agent 类型解析
- 工具定义和渲染模式

## 验证方案

1. **构建测试**: `bun run build` 通过
2. **类型检查**: `bunx tsc --noEmit` 无错误
3. **功能验证**（自研 subagent，非 pi-subagents）：
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

**注意**：Krebs 已于 2026-06-30 完成 `@earendil-works/pi-coding-agent` 迁移，Phase 0-5 可在主分支直接开发，无需兼容旧版 API。

0. **Phase 0: 安全 Context 隔离（关键）**
   - 实现 context-filter.ts（敏感信息过滤）
   - 实现 context.ts（干净上下文构建）
   - 配置默认 agent 类型的隔离策略
   - 验证无敏感信息泄露

1. **Phase 1: 核心基础设施**
   - 创建目录结构
   - 实现 types.ts 类型定义（收集所有导出类型：AgentRecord, AgentOptions, CleanContextOptions, ScheduledJob, AgentDefinition, GroupJoinOptions, WorktreeOptions, 工具参数接口等）
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
   // 测试：parent 包含 API key，subagent 不应看到原始 key
   // 注意：实际测试需要 ctx.sessionManager.getBranch() 返回模拟数据
   const mockCtx = { sessionManager: { getBranch: () => [...] } };
   const filtered = buildCleanContext(mockCtx, { maxMessages: 10 });
   // key 应被替换为 [REDACTED]，原始格式不应出现
   assert(!/sk-1234567890abcdef/.test(filtered));
   assert(filtered.includes("[REDACTED]"));
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
| ~~API 版本兼容性~~ | ✓ Krebs 已迁移至 `@earendil-works/pi-coding-agent@0.80.2` |
| R-1: context extension 未排除 | ✓ 已验证：每个 subagent 有独立的 resourceLoader，context 事件只影响 subagent 自己的消息 |
| R-2: createAgentSession 非阻塞模式 | ✓ 已验证：SDK 支持 `session.prompt()` + `session.subscribe()` 模式 |
| R-3: taskExtension 死引用 | ✓ 已移除，TaskCreate 等工具属于 subagent 内部实现 |
| R-7: Fleet View console.debug 噪音 | ✓ 已改为 console.warn |
| R-10: maxContextMessages=0 语义不清 | ✓ 已明确：0 = 不使用 parent context，buildCleanContext 直接返回空 |
| R-11: steer_subagent 缺 streamingBehavior | ✓ 已在工具说明中添加必须传 `streamingBehavior: "steer"` |
| R-12: entry.message 可选属性未检查 | ✓ 已添加 `if (!msg) continue` |
| R-13: session.subscribe 事件路由未说明 | ✓ 已补充事件路由说明 |
| R-14: TaskExecute 与 Agent 功能重叠 | ✓ 已说明 TaskExecute 由 Agent 工具实现 |
| R-15: context 未在 exclude 中（需说明） | ✓ 已添加推理说明 |
| R-16: entry.type === "compaction" 类型错误 | ✓ 已修正为 `summary_anchor` |
| R-17: maxContextMessages=0 注释矛盾 | ✓ 已修正注释 |
| R-18: extractText 未定义 | ✓ 已补充函数定义 |
| R-19: extensionCanonicalName 未定义 | ✓ 已补充函数定义 |
| R-20: configCwd 未定义 | ✓ 已改为 `cwd` |
| R-21: 测试断言假阳性 | ✓ 已修正断言逻辑 |
| R-22: ScheduledJob 未定义 | ✓ 已补充接口定义 |
| R-23: parseAgentDefinition 未定义 | ✓ 已补充解析逻辑（含简单 YAML 解析器） |
| R-24: GroupJoin 功能未知 | ✓ 已补充说明 |
| R-25: subscribe unsubscribe 未说明 | ✓ 已补充清理说明 |
| R-26: Agent 超时未处理 | ✓ 已在 DEFAULT_AGENTS 和 AgentRecord 中添加 timeoutMs |
| R-27: extensions: true 语义不清 | ✓ 已改为 "inherit"/"minimal" 字符串语义 |
| R-28: contextCollapse 性能问题不适用 | ✓ 已修正文件名指向 context.ts |
| R-29: CleanContextOptions 未定义 | ✓ 已补充接口定义 |
| R-30: extractText 对 ImageContent[] 返回空 | ✓ 已说明图片被静默丢弃 |
| R-31: entry.summary 可能是 undefined | ✓ 保留 if (entry.summary) 检查仍安全 |
| R-32: context.ts 与 context-filter.ts 职责不清 | ✓ 已明确分工 |
| R-33: AgentOptions 未定义 | ✓ 已补充接口定义 |
| R-35: YAML 解析无法处理带冒号的值 | ✓ 已修复解析器（使用 indexOf 替代 split） |
| R-36: getBranch() 从头遍历导致取到最早的消息 | ✓ 已改为反向遍历获取最后 N 条 |
| R-38: buildCleanContext 缺少 task 参数 | ✓ 已补充 agentTool 示例，展示如何注入 task |
| R-39: Agent 工具参数未定义 | ✓ 已补充 AgentToolParams 接口 |
| R-40: session.subscribe 事件类型未定义 | ✓ 已补充 SubagentEvent 类型定义 |
| R-42: worktree.ts 完全未定义 | ✓ 已补充 WorktreeManager 接口 |
| R-43: memory.ts 功能未定义 | ✓ 已说明为 subagent 私有记忆存储 |
| R-45: session-cache.ts 缓存键未定义 | ✓ 已说明使用 cwd 作为缓存键 |
| R-48: Node.js API 未导入 | ✓ 已在 loadCustomAgents 和 safeReadFile 添加 import |
| R-51: agentTool 未定义符号 | ✓ 已添加 `[需从 SDK 导入]` 标注 |
| R-52: 测试用例签名不匹配 | ✓ 已修正为 buildCleanContext(ctx, options) |
| R-53: foreground 会阻塞 parent | ✓ 已在注释中说明需谨慎使用 |
| R-54: task 解构无默认值 | ✓ 已添加 task = "" 默认值 |
| R-55: CachedExtensions 未定义 | ✓ 已补充接口定义 |
| R-56-58: Task 工具参数未定义 | ✓ 已补充接口定义 |
| R-60: Extension factories 不完整 | ✓ 已更新为完整列表 |
| R-61: scheduler.stop() 未定义 | ✓ 已添加到接口 |
| R-65: fs.open 未导入 | ✓ 已改为 `open` |
| R-66: GroupOptions 拼写错误 | ✓ 已改为 `GroupJoinOptions` |
| R-67: createSubagentSession 未定义 | ✓ 已补充函数签名和实现要点 |
| R-68: waitForSessionComplete 未定义 | ✓ 已说明复用 Krebs 已有实现 |
| R-69: 超时机制未实现 | ✓ 已补充 startTimeout 实现要点 |
| R-72: SteerSubagentParams 缺 streamingBehavior | ✓ 已添加可选字段 |
| R-73: scheduler.stop() 返回 void | ✓ 已改为 `Promise<void>` |
| R-79: types.ts 职责范围不清 | ✓ 已明确为收集所有导出类型 |
| R-80: createSubagentSession 参数不一致 | ✓ 已统一为 (prompt, type, options?) |
| R-81: Phase 1 types.ts 任务不明确 | ✓ 已补充 scope 说明 |
| R-82: get_subagent_result 返回值未定义 | ✓ 已补充 GetSubagentResultResult 接口 |
| R-83: Section 4 Markdown 语法错误 | ✓ 已修复表格结构 |
| R-84: agentTool 注册方式未说明 | ✓ 已添加 index.ts 注册示例 |
| R-85: TaskUpdateParams.status 不一致 | ✓ 已对齐为 "pending" \| "running" \| "done" \| "failed" \| "cancelled" |
| R-86: DEFAULT_AGENTS 回退行为未说明 | ✓ 已添加 getAgentConfig 函数和说明 |
| R-87: TaskCreate name 唯一性未说明 | ✓ 已添加同一 session 内唯一说明 |
| R-88: steer_subagent message 多行未说明 | ✓ 已添加不支持多行字符串说明 |
| R-89: SubagentScheduler 缺 pause/resume | ✓ 已添加到接口定义 |
| R-90: fleet-view.ts 描述重复 | ✓ 已修复（表格结构问题导致） |
| R-91: getAgentConfig 返回类型 AgentConfig 未定义 | ✓ 已改为 `typeof DEFAULT_AGENTS["general-purpose"]` |
| R-92: AgentToolParams 在工具参数定义中缺失 | ✓ 已添加到工具参数定义中 |
| R-93: ExtensionCache.getOrReload loader 参数无类型 | ✓ 已添加 `{ reload(): Promise<any> }` 类型 |
| R-94: AgentRecord.result 类型不明确 | ✓ 已改为 `AgentMessage[]` 并说明来源 |
| R-95: JWT 正则要求前导点号，无法匹配字符串开头 | ✓ 已改为 `(?:^|\s)eyJ...`（R-105 后续移除单引号避免误匹配） |
| R-96: AgentResult 类型未定义 | ✓ 已在 GroupJoinOptions 上方添加定义 |
| R-97: handleSubagentEvent 未处理所有事件类型 | ✓ 已补充 agent_start/turn_end/tool 事件 |
| R-98: "minimal" 与 "inherit" 描述易混淆 | ✓ 已明确区分：minimal=仅 tools，inherit=过滤后的 extensions |
| R-99: SENSITIVE_PATTERNS 冗余 | ✓ 移除 sk-ant-* 和 sk-48-char（被 sk-{20,} 覆盖）；修正 PEM 私钥正则（无空格） |
| R-100: Context 隔离级别 table 无法配置 summary | ✓ 添加 includeSummaries 列；AgentOptions 新增 includeSummaries 字段 |
| R-101: DEFAULT_AGENTS 缺少 includeSummaries | ✓ 已添加到 general-purpose 和 research 配置 |
| R-102: background 模式 session.subscribe 无清理 | ✓ 保存 unsubscribe 到 agentRecord.unsubscribe，agent_end 时调用 |
| R-103: foreground 模式 waitForSessionComplete 异常穿透 | ✓ 添加 try/catch，返回 { error: String(err) } |
| R-104: handleSubagentEvent agent_end 分支无实际逻辑 | ✓ 更新 record.status、record.result、调用 unsubscribe |
| R-105: JWT regex 单引号误触发率高 | ✓ 移除 `'`，仅保留 `\s` 匹配空白字符 |
| R-107: agentRecord.session 先 undefined 后赋值 | ✓ 保留 pattern，但添加类型标注 `undefined as any` |
| R-108: session.id / session.abort() 未在"高优先级"中确认 | ✓ 添加注释说明来自 SDK；中优先级条目需最终验证 |
| R-109: createSubagentSession 缺少 cwd/resourceLoader 参数和 SDK 参数占位符 | ✓ 添加 cwd 参数；保留 resourceLoader 占位参数；补充 createAgentAgent authStorage/modelRegistry 说明 |
| R-110: CachedExtensions.data 使用 `typeof loader.reload` 但 loader 不在作用域 | ✓ 改为 `DefaultResourceLoader["reload"]` |
| R-111: createAgentSession 中 authStorage/modelRegistry 未定义 | ✓ 使用 `??` 提供默认值 `AuthStorage.create()` / `ModelRegistry.create()` |
| R-112: agentTool 中 globalResourceLoader 未定义，ctx.resourceLoader 不存在 | ✓ 改为 `undefined` 占位；createSubagentSession 内部创建 filteredLoader |
| R-114: createSubagentSession 中 extensionsOverride 引用未说明来源 | ✓ 添加注释说明来自模块层闭包 |
| R-118: filteredLoader.reload 后 getOrReload 再 reload（缓存 miss 时） | ✓ 移除冗余 await filteredLoader.reload()，getOrReload 内部处理 |
| R-119: 事件路由示例 handleSubagentEvent 签名与实现不一致 | ✓ 已统一为 handleSubagentEvent(event, session, record) |
| R-123: createSubagentSession 不管理队列，agent 创建后无追踪 | ✓ 添加注释说明 enqueue 位置，实际由 agent-manager.ts 调用时管理 |
| R-126: Context 隔离级别 table full 行 `maxMessages: 很大` 无效 | ✓ 改为 `Infinity` |
| R-127: buildCleanContext summary 级别 maxMessages=0 会 break，永远不处理 summary_anchor | ✓ 将 summary_anchor 处理提前到循环顶部，加 continue 使 summaries 不计入 messageCount |
| R-128: buildCleanContext break 在添加之后，导致 summary 级别错误包含最后一条消息；summary_anchor 在消息之后时丢失 | ✓ 将 break 判断提前到添加之前；确保 summaries 先处理不受 limit 影响 |

### 高优先级 - 必须确认

1. **Extension 过滤实现:**
   - 在 `agent-runner.ts` 中实现 `extensionsOverride`
   - Subagent 默认排除 Krebs 专用 extensions（见 migration-to-earendil-works.md Session 隔离设计节）

2. **Session 隔离（已有方案，见 migration-to-earendil-works.md Session 隔离设计节）：**
   - Session 隔离通过 `ctx.sessionManager.getSessionId()` 实现
   - **关键架构事实**：Subagent 的工具执行发生在 **parent 会话**的上下文中（见 Section 2.5 架构图）
     - `execute` 函数被调用时，`ctx` 是 **parent 的 extension context**，不是 subagent 的
     - 因此 `ctx.sessionManager.getSessionId()` 返回的是 **parent 的 sessionId**
   - 方案：使用 `sessionState` Map 按 parent sessionId 隔离 AgentManager/Scheduler
   - **结论**：不同 WebSocket session 的 agents 不会混入同一个 Manager — `getState()` 每次正确获取 parent sessionId

3. **事件路由（session.subscribe 区分 parent/subagent）：**
   - 每个 subagent 创建独立的 `AgentSession`，有独立的 `session.subscribe(listener)`
   - AgentManager 通过 `session.id` 追踪每个 subagent session
   - **事件类型**（来自 SDK 的 AgentSession）：
     ```typescript
     type SubagentEvent =
       | { type: "agent_start"; sessionId: string }
       | { type: "agent_end"; sessionId: string; messages: AgentMessage[] }
       | { type: "turn_end"; sessionId: string; message: AgentMessage }
       | { type: "tool_execution_start"; sessionId: string; toolName: string }
       | { type: "tool_execution_end"; sessionId: string; toolName: string }
       | { type: "error"; sessionId: string; error: Error };
     ```
   - 事件路由：```typescript
     const unsubscribe = session.subscribe((event: SubagentEvent) => {
       if (event.sessionId !== subagentId) return;
       handleSubagentEvent(event, session, record);
     });
     ```
   - parent 和 subagent 的事件**不会混淆**，因为每个 session 有独立的 event stream
   - **清理**：subagent 结束时调用 `unsubscribe()` 释放监听器

### 中优先级 - 建议确认

3. **敏感信息过滤限制:**
   - 无法处理所有边界情况（如 URL 编码、拼接等）
   - **方案**: 持续迭代正则模式

4. **YAML 多行字符串值限制:**
   - frontmatter regex 无法处理多行字符串值
   - **方案**: 使用 js-yaml 库或限制 systemPrompt 为单行

5. **session.id 存在性:**
   - 需确认 SDK 的 AgentSession 是否有 `id` 属性

6. **Extension factories 加载顺序:**
   - subagentExtension 应最后加载以确保工具正确注册

### 低优先级 - 优化建议

4. **缓存策略**: 可基于 mtime 验证而非固定 TTL
5. **并发安全**: Node.js 单线程，无需锁
6. **Custom Agent 缓存**: `loadCustomAgents` 可添加 mtime 检查，避免每次都读文件系统
