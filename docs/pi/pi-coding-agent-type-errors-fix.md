# pi-coding-agent 0.66 类型错误修复清单

## 问题汇总

升级到 0.66.1 后，server.ts 存在以下 4 个主要类型错误：

### 1. AuthStorage 构造函数私有

**错误:**
```typescript
error TS2673: Constructor of class 'AuthStorage' is private
```

**位置:** server.ts:320

**旧代码:**
```typescript
const authStorage = new AuthStorage();
```

**修复:**
```typescript
const authStorage = AuthStorage.create();
```

---

### 2. ModelRegistry 构造函数私有

**错误:**
```typescript
error TS2673: Constructor of class 'ModelRegistry' is private
```

**位置:** server.ts:321

**旧代码:**
```typescript
const modelRegistry = new ModelRegistry(authStorage);
```

**修复:**
```typescript
const modelRegistry = ModelRegistry.create(authStorage);
```

---

### 3. Skill 类型不匹配

**错误:**
```typescript
error TS2322: Type 'SkillConfig[]' is not assignable to type 'Skill[]'.
Property 'sourceInfo' is missing
```

**位置:** server.ts:354

**原因:** `Skill` 接口新增了 `sourceInfo: SourceInfo` 字段

**修复方案 A - 修改 skills/index.ts:**
```typescript
import { createSyntheticSourceInfo } from "@mariozechner/pi-coding-agent";

export interface SkillConfig {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: "inline";
  sourceInfo: SourceInfo;  // 新增
  disableModelInvocation: boolean;
}

export const SKILLS: SkillConfig[] = [
  {
    name: "web-search-tool",
    description: "提供网页搜索功能示例",
    filePath: `${SKILLS_BASE_DIR}/web-search-tool/SKILL.md`,
    baseDir: `${SKILLS_BASE_DIR}/web-search-tool`,
    source: "inline",
    sourceInfo: createSyntheticSourceInfo(),  // 新增
    disableModelInvocation: false,
  },
  // ... 其他 skills
];
```

**修复方案 B - 在 server.ts 中转换:**
```typescript
import { createSyntheticSourceInfo } from "@mariozechner/pi-coding-agent";

// 在 resourceLoader 中转换
getSkills: () => ({
  skills: SKILLS.map(s => ({
    ...s,
    sourceInfo: createSyntheticSourceInfo(),
  })),
  diagnostics: [],
}),
```

---

### 4. switchSession 方法已移除

**错误:**
```typescript
error TS2339: Property 'switchSession' does not exist on type 'AgentSession'
```

**位置:** server.ts:1223

**原因:** v0.65.0 将会话管理方法从 `AgentSession` 移至 `AgentSessionRuntime`

**旧代码:**
```typescript
const success = await session.switchSession(sessionMeta.file_path);
```

**修复方案 A - 使用 AgentSessionRuntime (✅ 已采用):**
完整架构升级到 `AgentSessionRuntime`：

```typescript
import {
  createAgentSessionRuntime,
  AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  getAgentDir,
  createAgentSessionServices,
} from "@mariozechner/pi-coding-agent";

// 1. 创建 runtime factory
const createRuntimeFactory: CreateAgentSessionRuntimeFactory = async (options) => {
  const cwd = options.cwd;
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  authStorage.setRuntimeApiKey(MODEL_CONFIG.provider, MODEL_CONFIG.apiKey);

  const model = MODEL_CONFIG.baseUrl
    ? createModel()
    : getModel("anthropic", "claude-sonnet-4-20250514");

  const result = await createAgentSession({
    ...options,
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    tools: [createReadTool(cwd), createBashTool(cwd), createEditTool(cwd)],
    customTools: TOOLS.map((t) => t.tool),
    resourceLoader: { /* ... */ },
  });

  // 创建 services 以返回完整的 RuntimeResult
  const services = await createAgentSessionServices({
    cwd,
    agentDir: getAgentDir(),
  });

  return { ...result, services, diagnostics: [] };
};

// 2. 创建 runtime 而非直接创建 session
const sessions = new Map<string, AgentSessionRuntime>();

async function createRuntime(sessionId: string, sessionPath?: string) {
  const cwd = process.cwd();
  const sessionManager = SessionManager.create(cwd, join(cwd, "sessions"));

  const runtime = await createAgentSessionRuntime(createRuntimeFactory, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager,
  });

  // 如果指定了 sessionPath，切换到该会话
  if (sessionPath) {
    const result = await runtime.switchSession(sessionPath);
    if (result.cancelled) {
      throw new Error("Session 切换被取消");
    }
  }

  sessions.set(sessionId, runtime);
  return { runtime };
}

// 3. 使用 runtime 的方法
const runtime = getSession(sessionId);
const session = runtime.session;  // 访问底层 session

// 会话切换
const result = await runtime.switchSession(sessionMeta.file_path);
if (!result.cancelled) {
  // 切换成功
}

// 会话分支
const forkResult = await runtime.fork(entryId);

// 新建会话
const newResult = await runtime.newSession();

// 清理
await runtime.dispose();
```

**方案 A 的优势:**
- ✅ 官方推荐的架构模式
- ✅ 支持真正的会话切换（保留状态）
- ✅ 支持会话分支 (`fork`)
- ✅ 支持会话导入 (`importFromJsonl`)
- ✅ 统一的生命周期管理

**方案 B - 保持现有架构 (不推荐):**
如果不想大改架构，可以通过创建新 session 替换：

```typescript
// 不使用 switchSession，直接创建新 session
const newSession = await createSession(data.sessionId);

// 替换当前 session
sessions.set(data.sessionId, newSession);
```

**缺点:** 无法真正切换会话文件，每次都创建新会话。

---

## 推荐修复顺序

1. **快速修复** (1-2): AuthStorage 和 ModelRegistry - 直接替换构造函数调用
2. **中等修复** (3): Skill 类型 - 添加 sourceInfo 字段
3. **架构调整** (4): switchSession - **强烈推荐采用新的 Runtime API**

## 实际变更记录

本项目采用**方案 A**，进行了完整的架构升级：

| 变更项 | 之前 | 现在 |
|--------|------|------|
| sessions 类型 | `Map<string, AgentSession>` | `Map<string, AgentSessionRuntime>` |
| 创建函数 | `createSession()` | `createRuntime()` |
| Factory | 无 | `createRuntimeFactory` |
| 会话切换 | 创建新 session | `runtime.switchSession()` |
| 访问 session | `session.xxx` | `runtime.session.xxx` |
| 清理 | `session.dispose()` | `runtime.dispose()` |

**新增导入:**
```typescript
import {
  createAgentSessionRuntime,
  AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  getAgentDir,
  createAgentSessionServices,
} from "@mariozechner/pi-coding-agent";
```

## 兼容性说明

- **破坏性变更**: v0.65.0 移除了 `session_switch` 和 `session_fork` 事件
- **新增 API**: `AgentSessionRuntime` 提供更清晰的会话生命周期管理
- **影响范围**: 会话切换、新建、分支等功能需要适配新 API

## 参考文档

- [AgentSessionRuntime API](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/agent-session-runtime.ts)
- [v0.65.0 Migration Guide](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/CHANGELOG.md)
- [pi-mono GitHub](https://github.com/badlogic/pi-mono)
- [Pi Coding Agent 文档](https://pi.dev)

## 更新日期

2026-04-13 - 采用方案 A，完整升级到 AgentSessionRuntime 架构
