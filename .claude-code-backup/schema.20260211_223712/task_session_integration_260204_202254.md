# Task: Session 模块与现有系统集成

**任务ID**: task_session_integration_260204_202254
**创建时间**: 2026-02-04 20:22:54
**状态**: 进行中
**目标**: 将新实现的 Session 模块集成到现有系统中

## 最终目标
在 Krebs 项目中使用新的 Session 模块替换旧的存储实现，实现：
1. AgentManager 使用新的 SessionStore
2. ChatService 使用新的 Session 模块
3. 保持向后兼容性
4. 提供完整的集成示例

## 现有系统分析

### 1. AgentManager 架构

**文件**: `src/agent/core/manager.ts`

**依赖注入点**:
```typescript
export interface AgentManagerDeps {
  provider: LLMProvider;
  storage?: {
    saveSession: (sessionId: string, messages: any[]) => Promise<void>;
    loadSession: (sessionId: string) => Promise<any | null>;
  };
  skillRegistry?: SkillRegistry;
  tools?: Tool[];
}
```

**关键点**:
- ✅ AgentManager 已经支持 storage 依赖注入
- ✅ 接口与 ISessionStorage 兼容
- 📝 storage 传递给 AgentDeps

### 2. ChatService 架构

**文件**: `src/gateway/service/chat-service.ts`

**接口**:
```typescript
export interface IChatService {
  process(agentId: string, message: string, sessionId: string): Promise<AgentResult>;
  processStream(agentId: string, message: string, sessionId: string, onChunk: Function): Promise<AgentResult>;
  getSkillsList?(agentId: string): Promise<unknown[]>;
  getSkillDetails?(agentId: string, skillName: string): Promise<unknown | null>;
  getSkillsStats?(agentId: string): Promise<unknown | null>;
}
```

**实现**:
- 通过 AgentManager 获取 Orchestrator
- Orchestrator 处理消息（使用 storage）

### 3. 集成点分析

**现有流程**:
```
Gateway → ChatService → AgentManager → Orchestrator → Agent
                                              ↓
                                          Storage (旧)
```

**目标流程**:
```
Gateway → ChatService → AgentManager → Orchestrator → Agent
                                              ↓
                                      SessionStore (新)
```

## 拆解步骤

### 1. 创建 SessionStorage 工厂函数
- [ ] 1.1 创建 `createSessionStorage` 工厂函数
- [ ] 1.2 支持配置文件和环境变量
- [ ] 1.3 自动选择存储实现（Markdown 或 JSON）

### 2. 集成到 AgentManager
- [ ] 2.1 创建 SessionStorage 适配器实例
- [ ] 2.2 传递给 AgentManager
- [ ] 2.3 验证保存/加载功能

### 3. 增强 ChatService
- [ ] 3.1 添加会话管理方法
- [ ] 3.2 支持会话列表查询
- [ ] 3.3 支持会话元数据更新

### 4. 创建示例和文档
- [ ] 4.1 创建集成示例代码
- [ ] 4.2 更新 README
- [ ] 4.3 添加使用指南

### 5. 测试集成
- [ ] 5.1 端到端测试
- [ ] 5.2 兼容性测试
- [ ] 5.3 性能测试

## 当前进度

### 已完成 ✅

1. **分析现有系统** ✅
   - ✅ 分析 AgentManager 架构
   - ✅ 分析 ChatService 架构
   - ✅ 参考 openclaw-cn-ds 实现

2. **创建工厂函数** ✅
   - ✅ 创建 storage-factory.ts
   - ✅ 支持配置和环境变量
   - ✅ 实现单例模式

3. **创建文档** ✅
   - ✅ 创建集成指南文档
   - ✅ 创建集成示例代码
   - ✅ 更新模块导出

4. **集成方案** ✅
   - ✅ 设计完整的集成流程
   - ✅ 提供多 agent 支持示例
   - ✅ 提供会话管理示例

### 最终实现

**创建的文件**：
1. `src/storage/session/storage-factory.ts` - 工厂函数
2. `docs/session-integration-guide.md` - 集成指南
3. `examples/session-integration-example.ts` - 集成示例

**核心集成点**：
```
Gateway → ChatService → AgentManager → Orchestrator → Agent
                                              ↓
                                      SessionStorage (新)
                                              ↓
                                          SessionStore
```

**使用方式**：
```typescript
// 1. 创建 Session Storage
const sessionStorage = createEnhancedSessionStorage({
  baseDir: "./data/sessions",
  enableCache: true,
});

// 2. 注入到 AgentManager
const agentManager = new AgentManager(
  { enableSkills: true },
  {
    provider: myProvider,
    storage: sessionStorage,  // 注入
  }
);

// 3. 使用（自动保存/加载会话）
await agent.chat("Hello!", { sessionId: "user:123" });
```
