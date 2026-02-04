# Session 模块集成指南

本文档说明如何将新的 Session 模块集成到 Krebs 系统中。

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                       Gateway Layer                         │
│  ┌───────────────────────────────────────────────────────┐ │
│  │          ChatService (IChatService)                   │ │
│  │  - process()                                          │ │
│  │  - processStream()                                    │ │
│  │  - getSessionsList()  [新增]                          │ │
│  │  - getSessionMetadata()  [新增]                       │ │
│  └───────────────────┬───────────────────────────────────┘ │
└──────────────────────┼───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                    AgentManager                              │
│  ┌───────────────────────────────────────────────────────┐ │
│  │         Orchestrator                                   │ │
│  │  - process()                                          │ │
│  │  - processStream()                                    │ │
│  └───────────────────┬───────────────────────────────────┘ │
└──────────────────────┼───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                   Agent Layer                                │
│  ┌───────────────────────────────────────────────────────┐ │
│  │            Agent                                       │ │
│  │  - chat()                                             │ │
│  │  - 使用 storage.saveSession()                        │ │
│  │  - 使用 storage.loadSession()                        │ │
│  └───────────────────┬───────────────────────────────────┘ │
└──────────────────────┼───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                 Session Storage Layer                        │
│  ┌───────────────────────────────────────────────────────┐ │
│  │       ISessionStorage / IEnhancedSessionStorage       │ │
│  │  - saveSession()                                      │ │
│  │  - loadSession()                                      │ │
│  │  - updateSessionMetadata()  [增强]                    │ │
│  │  - loadSessionWithMetadata()  [增强]                  │ │
│  └───────────────────┬───────────────────────────────────┘ │
│                      │                                       │
│  ┌───────────────────▼───────────────────────────────────┐ │
│  │          SessionStore (新实现)                         │ │
│  │  - 文件锁机制                                         │ │
│  │  - TTL 缓存                                           │ │
│  │  - 多 agent 支持                                      │ │
│  │  - 丰富的元数据                                       │ │
│  └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## 集成步骤

### 1. 创建 SessionStorage 实例

在应用的启动代码中（如 `src/index.ts`）：

```typescript
import { createEnhancedSessionStorage } from "@/storage/session/index.js";

// 创建 Session Storage
const sessionStorage = createEnhancedSessionStorage({
  baseDir: "./data/sessions",
  enableCache: true,
  cacheTtl: 45000,
});
```

### 2. 注入到 AgentManager

```typescript
import { AgentManager } from "@/agent/core/index.js";

// 创建 AgentManager，注入 Session Storage
const agentManager = new AgentManager(
  {
    enableSkills: true,
    skillTimeout: 30000,
  },
  {
    provider: myProvider,
    storage: sessionStorage, // 注入 Session Storage
  }
);
```

### 3. 增强 ChatService

创建 `src/gateway/service/enhanced-chat-service.ts`：

```typescript
import type { IEnhancedSessionStorage } from "@/storage/interface.js";
import type { IChatService } from "./chat-service.js";
import type { SessionEntry } from "@/storage/session/index.js";

export class EnhancedChatService implements IChatService {

  constructor(
    private agentManager: AgentManager,
    private sessionStorage: IEnhancedSessionStorage
  ) {}

  async process(
    agentId: string,
    message: string,
    sessionId: string
  ): Promise<AgentResult> {
    const orchestrator = this.agentManager.getOrchestrator(agentId);
    if (!orchestrator) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return orchestrator.process(message, sessionId);
  }

  async processStream(
    agentId: string,
    message: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<AgentResult> {
    const orchestrator = this.agentManager.getOrchestrator(agentId);
    if (!orchestrator) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return orchestrator.processStream(message, sessionId, onChunk);
  }

  // 新增：列出所有会话
  async listSessions(filters?: {
    agentId?: string;
    limit?: number;
  }): Promise<Array<{ sessionId: string; entry: SessionEntry }>> {
    const store = this.sessionStorage.getStore();
    const sessions = await store.listSessions();

    let filtered = sessions;

    if (filters?.agentId) {
      filtered = sessions.filter(s => s.entry.agentId === filters.agentId);
    }

    if (filters?.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  // 新增：获取会话元数据
  async getSessionMetadata(
    sessionId: string
  ): Promise<SessionEntry | null> {
    return await this.sessionStorage.updateSessionMetadata(sessionId, {});
  }

  // 新增：更新会话元数据
  async updateSessionMetadata(
    sessionId: string,
    metadata: Partial<SessionEntry>
  ): Promise<SessionEntry | null> {
    return await this.sessionStorage.updateSessionMetadata(sessionId, metadata);
  }

  // 新增：删除会话
  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionStorage.deleteSession(sessionId);
  }

  // 新增：重置会话
  async resetSession(sessionId: string): Promise<void> {
    const session = await this.sessionStorage.loadSessionWithMetadata(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // 保留元数据，但重置 token 统计
    await this.sessionStorage.updateSessionMetadata(sessionId, {
      sessionId: crypto.randomUUID(),
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      systemSent: false,
      abortedLastRun: false,
    });
  }
}
```

### 4. 使用示例

#### 基础使用

```typescript
// 1. 创建 Session Storage
const sessionStorage = createEnhancedSessionStorage();

// 2. 创建 AgentManager
const agentManager = new AgentManager(
  { enableSkills: true },
  {
    provider: myProvider,
    storage: sessionStorage,
  }
);

// 3. 创建 Agent
const agent = agentManager.createAgent({
  id: "my-agent",
  name: "My Agent",
  systemPrompt: "You are a helpful assistant.",
});

// 4. 处理消息（会话自动保存）
const result = await agent.chat("Hello!", {
  sessionId: "user:123",
});

// 5. 加载会话历史
const messages = await sessionStorage.loadSession("user:123");
console.log("会话历史:", messages);
```

#### 多 Agent 支持

```typescript
// Agent 1: 主 agent
await agent.chat("Help me with task A", {
  sessionId: "agent:main:user:123",
});

// Agent 2: 专门的 agent
await agent.chat("Help me with task B", {
  sessionId: "agent:helper:user:123",
});

// 列出某个 agent 的所有会话
const store = sessionStorage.getStore();
const allSessions = await store.listSessions();
const mainAgentSessions = allSessions.filter(
  s => s.entry.agentId === "main"
);
```

#### 会话管理

```typescript
// 获取会话列表
const sessions = await chatService.listSessions({
  agentId: "my-agent",
  limit: 10,
});

// 更新会话元数据
await chatService.updateSessionMetadata("user:123", {
  model: "gpt-4",
  inputTokens: 1000,
  totalTokens: 1500,
});

// 重置会话
await chatService.resetSession("user:123");

// 删除会话
await chatService.deleteSession("user:123");
```

## API 参考

### SessionStore

#### saveSession

```typescript
await store.saveSession(
  "user:123",                    // session key
  messages,                      // 消息列表
  {                              // 元数据（可选）
    model: "gpt-4",
    modelProvider: "openai",
    inputTokens: 100,
    outputTokens: 200,
  }
);
```

#### loadSession

```typescript
const session = await store.loadSession("user:123");
// session.entry - 会话元数据
// session.messages - 消息列表
```

#### updateSessionMetadata

```typescript
const updated = await store.updateSessionMetadata("user:123", {
  totalTokens: 500,
  model: "gpt-4-turbo",
});
```

#### listSessions

```typescript
const sessions = await store.listSessions();
// 返回按更新时间降序排列的会话列表
```

### Session Key 格式

- **简单格式**: `user:123`、`channel:slack:general`
- **多 agent**: `agent:my-agent:user:123`
- **特殊 key**: `global`、`unknown`

## 环境变量配置

```bash
# 存储目录
SESSION_STORAGE_DIR=./data/sessions

# 存储类型（markdown/enhanced）
SESSION_STORAGE_TYPE=enhanced

# 缓存配置
SESSION_CACHE_ENABLED=true
SESSION_CACHE_TTL=45000
```

## 最佳实践

1. **使用工厂函数创建实例**
   ```typescript
   const storage = createEnhancedSessionStorage(config);
   ```

2. **复用同一个实例**
   ```typescript
   // 避免创建多个实例
   const storage = createEnhancedSessionStorage();
   const agentManager = new AgentManager(config, { storage });
   ```

3. **处理并发访问**
   - SessionStore 内置文件锁机制，自动处理并发
   - 不要手动管理锁

4. **合理使用缓存**
   - 默认启用缓存（TTL 45秒）
   - 高频访问场景可以增加 TTL
   - 低频访问或内存受限场景可以禁用缓存

5. **监控性能**
   ```typescript
   const store = storage.getStore();
   // 查看缓存命中率（需要添加监控代码）
   ```

## 迁移指南

### 从旧版 MarkdownStore 迁移

```typescript
// 旧代码
const store = new MarkdownStore("./data/sessions");

// 新代码
const store = new SessionStore({
  baseDir: "./data/sessions",
  enableCache: true,
});
```

### 从 ISessionStorage 迁移

```typescript
// 旧代码
const storage: ISessionStorage = {
  async saveSession(sessionId, messages) {
    // 实现
  },
  async loadSession(sessionId) {
    // 实现
  },
};

// 新代码（使用增强功能）
const storage: IEnhancedSessionStorage = createEnhancedSessionStorage();
```

## 故障排除

### 问题：文件锁超时

```
Error: Timeout acquiring lock for session: user:123
```

**解决方案**：
1. 检查是否有死锁
2. 增加 `withLock` 的超时时间
3. 检查并发访问模式

### 问题：缓存不一致

```
Expected new metadata, but got old data
```

**解决方案**：
1. 调用 `store.clearCache()` 清除缓存
2. 减少缓存 TTL
3. 禁用缓存进行调试

### 问题：Session Key 解析失败

```
Error: Invalid session key: ...
```

**解决方案**：
1. 检查 session key 格式
2. 使用 `parseSessionKey()` 调试
3. 确保没有特殊字符
