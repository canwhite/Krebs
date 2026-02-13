# Subagent 系统设计文档

> **创建时间**: 2026-02-13
> **状态**: 设计阶段
> **参考项目**: openclaw-cn-ds (Moltbot-CN)

## 概述

Subagent 系统允许主 Agent 在隔离会话中生成后台子代理运行，执行复杂或耗时的任务，并将结果通知回请求者。这种模式特别适合以下场景：

- **并行处理**: 同时执行多个独立任务
- **资源隔离**: 避免长任务阻塞主会话
- **专业化执行**: 使用特定配置的 Agent 执行特定任务
- **后台处理**: 异步执行不需要立即响应的任务

## 设计原则

### 1. 模块化设计
- 将 subagent 功能分离到独立模块
- 清晰的职责划分：注册、通知、存储、配置
- 可插拔架构，便于扩展和维护

### 2. 向后兼容
- 不破坏现有 API 和功能
- 可选启用，默认不开启
- 提供平滑的迁移路径

### 3. 配置驱动
- 支持全局默认配置
- 支持 Agent 级别配置覆盖
- 支持运行时参数覆盖

### 4. 工具化集成
- 作为标准工具集成到现有系统
- 统一的参数验证和错误处理
- 与现有会话系统无缝集成

### 5. 生命周期管理
- 完整的注册、执行、通知、清理流程
- 支持持久化和恢复机制
- 完善的错误处理和资源清理

## 架构设计

### 模块结构

```
src/agent/subagent/
├── types.ts                    # 类型定义
├── registry.ts                 # Subagent 注册表（内存 + 持久化）
├── announce.ts                 # 结果通知机制
├── queue.ts                    # 通知队列管理
├── store.ts                    # 持久化存储
├── config.ts                   # 配置管理
├── tools/
│   └── spawn-subagent.ts       # 生成 subagent 的工具
└── index.ts                    # 统一导出
```

### 核心类型定义

```typescript
// Subagent 运行记录
export interface SubagentRunRecord {
  runId: string;                    // 运行 ID（UUID）
  childSessionKey: string;          // 子会话键（格式：subagent:{runId}:{taskHash}）
  requesterSessionKey: string;      // 请求者会话键
  requesterDisplayKey: string;      // 请求者显示键
  task: string;                     // 任务描述
  cleanup: "delete" | "keep";       // 清理策略
  label?: string;                   // 可选标签
  agentId?: string;                 // 目标 agent ID
  model?: string;                   // 模型覆盖
  thinkingLevel?: string;           // 思考级别
  createdAt: number;                // 创建时间
  startedAt?: number;               // 开始时间
  endedAt?: number;                 // 结束时间
  outcome?: SubagentRunOutcome;     // 运行结果
  runTimeoutSeconds?: number;       // 运行超时
  archiveAtMs?: number;             // 归档时间
  cleanupCompletedAt?: number;      // 清理完成时间
  cleanupHandled?: boolean;         // 是否已处理
}

// Subagent 运行结果
export type SubagentRunOutcome = {
  status: "completed" | "failed" | "timeout" | "cancelled";
  result?: unknown;
  error?: string;
  completedAt: number;
};

// Subagent 配置
export interface SubagentConfig {
  enabled?: boolean;                // 是否启用
  maxConcurrent?: number;           // 最大并发数
  archiveAfterMinutes?: number;     // 归档时间（分钟）
  defaultCleanup?: "delete" | "keep"; // 默认清理策略
  allowedAgents?: string[];         // 允许的 agent ID（"*" 表示全部）
  defaultModel?: string;            // 默认模型
}

// 通知模式
export type AnnounceMode =
  | "steer"     // 立即通知，引导用户关注
  | "followup"  // 作为后续消息追加
  | "collect"   // 收集结果，稍后统一通知
  | "silent";   // 静默执行，不通知
```

### 工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                     Subagent 工作流程                         │
├─────────────────────────────────────────────────────────────┤
│ 1. 用户请求                                                  │
│    ↓                                                        │
│ 2. Agent 调用 spawn_subagent 工具                           │
│    ↓                                                        │
│ 3. 工具验证参数 → 注册 subagent 运行到 Registry              │
│    ↓                                                        │
│ 4. 创建独立会话 → 启动子 agent 执行任务                      │
│    ↓                                                        │
│ 5. 监听执行结果 → 通过 Announce 机制通知请求者               │
│    ↓                                                        │
│ 6. 根据 cleanup 策略清理会话                                 │
└─────────────────────────────────────────────────────────────┘
```

## Tools 和 Skills 调用设计

### Subagent 对 Tools 和 Skills 的访问

基于对 openclaw-cn-ds 项目的分析，subagent 可以调用 tools 和 skills，但有重要的安全限制和配置选项。

#### 1. 访问控制策略

**配置结构**:
```typescript
export interface SubagentToolsConfig {
  /** 明确允许的工具列表（覆盖默认拒绝列表） */
  allow?: string[];

  /** 明确拒绝的工具列表（追加到默认拒绝列表） */
  deny?: string[];

  /** 是否继承父 agent 的工具配置 */
  inheritTools?: boolean;

  /** 是否继承父 agent 的技能配置 */
  inheritSkills?: boolean;

  /** 是否允许 subagent 再创建 subagent（防止无限递归） */
  allowNestedSubagents?: boolean;
}

// 更新 SubagentConfig 接口
export interface SubagentConfig {
  enabled?: boolean;
  maxConcurrent?: number;
  archiveAfterMinutes?: number;
  defaultCleanup?: "delete" | "keep";
  allowedAgents?: string[];
  defaultModel?: string;

  // 新增 tools 配置
  tools?: SubagentToolsConfig;
}
```

#### 2. 默认安全限制

**默认拒绝的工具列表**（参考 openclaw-cn-ds）:
```typescript
const DEFAULT_SUBAGENT_TOOL_DENY = [
  // 会话管理工具（防止会话混乱）
  "sessions_list", "sessions_history", "sessions_send", "sessions_spawn",

  // 系统管理工具（防止权限提升）
  "gateway", "agents_list", "session_status", "cron",

  // 认证相关工具（防止认证信息泄露）
  "whatsapp_login",

  // 记忆系统工具（防止记忆污染）
  "memory_search", "memory_get", "memory_save",

  // 其他敏感工具
  "system_info", "file_system", "process_control"
];
```

#### 3. 工具过滤机制

**过滤层级**（从宽松到严格）:
```
1. 全局工具配置
2. Provider 配置
3. Agent 配置
4. 工具组配置
5. 沙箱配置
6. Subagent 配置（最后应用，最严格）
```

**实现逻辑**:
```typescript
class SubagentToolFilter {
  // 检查是否为 subagent 会话
  static isSubagentSessionKey(sessionKey: string): boolean {
    return sessionKey.startsWith("subagent:") ||
           sessionKey.includes(":subagent:");
  }

  // 解析 subagent 工具策略
  static resolveSubagentToolPolicy(
    config: SubagentConfig,
    parentTools: string[]
  ): string[] {
    const subagentConfig = config.tools;
    if (!subagentConfig) return parentTools;

    let filteredTools = [...parentTools];

    // 应用拒绝列表
    const denyList = [
      ...DEFAULT_SUBAGENT_TOOL_DENY,
      ...(subagentConfig.deny || [])
    ];
    filteredTools = filteredTools.filter(tool => !denyList.includes(tool));

    // 应用允许列表（如果指定）
    if (subagentConfig.allow && subagentConfig.allow.length > 0) {
      filteredTools = filteredTools.filter(tool =>
        subagentConfig.allow!.includes(tool)
      );
    }

    return filteredTools;
  }
}
```

#### 4. Skills 继承机制

**技能配置继承**:
```typescript
interface SubagentSkillsConfig {
  // 是否继承父 agent 的技能
  inherit?: boolean;

  // 额外的技能目录（subagent 专用）
  extraSkillDirs?: string[];

  // 技能白名单（只允许这些技能）
  allowSkills?: string[];

  // 技能黑名单（禁止这些技能）
  denySkills?: string[];
}

// 技能管理器适配
class SubagentSkillsManager {
  constructor(
    private parentSkillsManager: SkillsManager,
    private config: SubagentSkillsConfig
  ) {}

  async getAvailableSkills(): Promise<Skill[]> {
    let skills: Skill[] = [];

    // 继承父 agent 技能
    if (this.config.inherit !== false) {
      const parentSkills = await this.parentSkillsManager.getAvailableSkills();
      skills.push(...parentSkills);
    }

    // 加载额外技能
    if (this.config.extraSkillDirs) {
      for (const dir of this.config.extraSkillDirs) {
        const extraSkills = await loadSkillsFromDirectory(dir);
        skills.push(...extraSkills);
      }
    }

    // 应用过滤
    if (this.config.allowSkills) {
      skills = skills.filter(skill =>
        this.config.allowSkills!.includes(skill.name)
      );
    }

    if (this.config.denySkills) {
      skills = skills.filter(skill =>
        !this.config.denySkills!.includes(skill.name)
      );
    }

    return skills;
  }
}
```

#### 5. 使用示例

**配置示例**:
```typescript
// 允许 subagent 访问特定工具
const config = {
  subagents: {
    enabled: true,
    tools: {
      allow: ["web_search", "file_read", "code_analysis"],
      deny: ["sessions_spawn", "memory_save"],
      inheritTools: true,
      allowNestedSubagents: false
    },
    skills: {
      inherit: true,
      extraSkillDirs: ["./subagent-skills"],
      denySkills: ["dangerous_skill"]
    }
  }
};

// 创建 subagent 时指定工具配置
const result = await agent.process(
  "请使用 spawn_subagent 分析这个项目",
  "user:123"
);

// spawn_subagent 工具参数可以包含工具配置
{
  task: "分析项目代码质量",
  tools: {
    allow: ["code_analysis", "file_read"],
    inherit: true
  }
}
```

#### 6. 安全考虑

**防止的威胁**:
1. **无限递归**: 禁止 subagent 再创建 subagent
2. **权限提升**: 限制系统管理工具访问
3. **数据泄露**: 限制敏感数据访问工具
4. **资源耗尽**: 限制资源密集型工具
5. **会话混乱**: 限制会话管理工具

**审计日志**:
```typescript
interface SubagentToolCallLog {
  runId: string;
  toolName: string;
  calledAt: number;
  parameters: Record<string, unknown>;
  result: ToolResult;
  requesterSessionKey: string;
}
```

## 核心模块设计

### 1. SubagentRegistry (注册表)

**职责**:
- 管理所有 subagent 运行记录
- 提供注册、查询、更新、删除接口
- 支持内存存储和持久化
- 实现并发控制和资源限制
- 管理工具调用审计日志

**关键功能**:
```typescript
class SubagentRegistry {
  // 注册新的 subagent 运行
  register(params: RegisterParams): SubagentRunRecord;

  // 查询运行记录
  get(runId: string): SubagentRunRecord | undefined;

  // 更新运行状态
  update(runId: string, updates: Partial<SubagentRunRecord>): void;

  // 列出所有运行记录
  list(filter?: ListFilter): SubagentRunRecord[];

  // 清理过期记录
  cleanup(): void;

  // 持久化到磁盘
  persist(): Promise<void>;

  // 从磁盘恢复
  restore(): Promise<void>;

  // 记录工具调用（安全审计）
  logToolCall(log: SubagentToolCallLog): void;

  // 获取工具调用日志
  getToolCallLogs(runId: string): SubagentToolCallLog[];
}
```

### 2. SubagentAnnounce (通知机制)

**职责**:
- 管理 subagent 结果通知
- 支持多种通知模式
- 格式化通知消息
- 处理通知队列

**通知模式**:
- **steer**: 立即通知，引导用户关注（适合重要结果）
- **followup**: 作为后续消息追加（适合常规结果）
- **collect**: 收集结果，稍后统一通知（适合批量任务）
- **silent**: 静默执行，不通知（适合后台任务）

### 3. SpawnSubagentTool (工具)

**工具定义**:
- 名称: `spawn_subagent`
- 描述: 在隔离会话中生成后台子代理运行，并将结果通知回请求者聊天

**参数 Schema**:
```typescript
{
  type: "object",
  properties: {
    task: {
      type: "string",
      description: "任务描述（必需）"
    },
    label: {
      type: "string",
      description: "可选标签，用于识别任务"
    },
    agentId: {
      type: "string",
      description: "目标 agent ID（默认使用当前 agent）"
    },
    model: {
      type: "string",
      description: "模型覆盖（默认使用配置的模型）"
    },
    thinking: {
      type: "string",
      description: "思考级别（default, high, low）"
    },
    runTimeoutSeconds: {
      type: "number",
      description: "运行超时时间（秒）"
    },
    cleanup: {
      type: "string",
      enum: ["delete", "keep"],
      description: "清理策略：delete（完成后删除会话）或 keep（保留会话）"
    },
    // 新增：工具配置参数
    tools: {
      type: "object",
      description: "子代理工具配置",
      properties: {
        allow: {
          type: "array",
          items: { type: "string" },
          description: "明确允许的工具列表"
        },
        deny: {
          type: "array",
          items: { type: "string" },
          description: "明确拒绝的工具列表"
        },
        inherit: {
          type: "boolean",
          description: "是否继承父 agent 的工具配置"
        }
      }
    },
    // 新增：技能配置参数
    skills: {
      type: "object",
      description: "子代理技能配置",
      properties: {
        inherit: {
          type: "boolean",
          description: "是否继承父 agent 的技能"
        },
        extraDirs: {
          type: "array",
          items: { type: "string" },
          description: "额外的技能目录"
        },
        allow: {
          type: "array",
          items: { type: "string" },
          description: "技能白名单"
        },
        deny: {
          type: "array",
          items: { type: "string" },
          description: "技能黑名单"
        }
      }
    }
  },
  required: ["task"]
}
```

## 配置系统

### 分层配置

```
全局默认配置 (config.ts)
    ↓
Agent 级别配置 (AgentConfig.subagents)
    ↓
运行时参数 (spawn_subagent 工具参数)
```

### 默认配置

```typescript
const DEFAULT_SUBAGENT_CONFIG: SubagentConfig = {
  enabled: false,                    // 默认不启用
  maxConcurrent: 5,                  // 最大并发数
  archiveAfterMinutes: 60 * 24 * 7,  // 7天后归档
  defaultCleanup: "delete",          // 默认删除会话
  allowedAgents: ["*"],              // 允许所有 agent
  defaultModel: undefined,           // 使用 agent 默认模型
};
```

## 集成方案

### 1. Agent 配置集成

```typescript
// 在 AgentConfig 中添加 subagents 字段
export interface AgentConfig {
  // ... 现有配置
  subagents?: SubagentConfig;
}
```

### 2. AgentManager 集成

```typescript
class AgentManager {
  private subagentRegistry?: SubagentRegistry;

  constructor(config: AgentManagerConfig) {
    // 如果配置启用 subagent，则初始化 registry
    if (config.subagents?.enabled) {
      this.subagentRegistry = new SubagentRegistry(config.subagents);
    }
  }

  // 提供 subagent 相关 API
  getSubagentRegistry(): SubagentRegistry | undefined {
    return this.subagentRegistry;
  }
}
```

### 3. 工具系统集成

```typescript
// 在 builtin.ts 中添加 spawn_subagent 工具
export const BUILTIN_TOOLS: Tool[] = [
  // ... 现有工具
  spawnSubagentTool,
];
```

## 使用示例

### 1. 基本使用

```typescript
// 通过工具调用 subagent
const result = await agent.process(
  "请帮我分析这个项目的代码质量，使用 spawn_subagent 工具",
  "user:123"
);

// LLM 会自动调用 spawn_subagent 工具
// 工具参数示例：
{
  task: "分析项目代码质量，检查代码规范、测试覆盖率、架构设计等方面",
  label: "代码质量分析",
  agentId: "code-reviewer",
  cleanup: "keep"
}
```

### 2. 配置示例

```typescript
// 全局配置
const globalConfig = {
  subagents: {
    enabled: true,
    maxConcurrent: 10,
    archiveAfterMinutes: 60 * 24 * 3, // 3天
    defaultCleanup: "delete",
  }
};

// Agent 级别配置
const agentConfig = {
  name: "main-agent",
  model: "gpt-4",
  subagents: {
    allowedAgents: ["code-reviewer", "data-analyzer"],
    defaultModel: "gpt-3.5-turbo",
  }
};
```

## 测试策略

### 单元测试
1. **注册表测试**: 注册、查询、更新、删除操作
2. **通知测试**: 各种通知模式的格式化
3. **工具测试**: 参数验证和执行流程
4. **配置测试**: 配置合并和验证
5. **工具过滤测试**: 测试 subagent 工具过滤逻辑
6. **技能继承测试**: 测试技能配置继承机制
7. **安全限制测试**: 测试默认拒绝列表和递归防止

### 集成测试
1. **完整工作流程**: 从工具调用到结果通知
2. **并发测试**: 多个 subagent 同时执行
3. **错误恢复**: 进程重启后的状态恢复
4. **资源限制**: 测试最大并发数限制
5. **工具调用测试**: 测试 subagent 调用各种工具
6. **技能调用测试**: 测试 subagent 调用技能
7. **配置继承测试**: 测试工具和技能配置继承
8. **安全边界测试**: 测试安全限制是否有效

### 安全测试
1. **递归防止测试**: 确保 subagent 不能创建 subagent
2. **权限提升测试**: 确保 subagent 不能访问系统管理工具
3. **数据隔离测试**: 确保 subagent 会话数据隔离
4. **资源限制测试**: 测试资源耗尽防护
5. **审计日志测试**: 测试工具调用审计功能

### 性能测试
1. **内存使用**: 监控注册表内存占用
2. **执行时间**: 测量 subagent 执行延迟
3. **并发性能**: 测试高并发场景
4. **工具过滤性能**: 测试工具过滤链的性能影响
5. **技能加载性能**: 测试技能继承和加载性能

## 风险控制

### 技术风险
1. **并发控制**: 使用现有的 Lane 调度系统防止资源耗尽
2. **内存泄漏**: 定期清理过期记录，实现 LRU 缓存
3. **数据一致性**: 使用文件锁和事务保证数据安全

### 兼容性风险
1. **向后兼容**: 保持现有 API 不变，subagent 功能可选
2. **配置迁移**: 提供默认配置，无需手动迁移
3. **错误处理**: 优雅降级，subagent 失败不影响主流程

### 安全风险
1. **权限控制**: 通过 allowedAgents 限制可用的 agent
2. **资源限制**: 限制最大并发数和运行时间
3. **输入验证**: 严格验证工具参数，防止注入攻击

## 实施路线图

### 第一阶段：基础架构（2-3天）
1. 创建模块目录结构
2. 实现核心类型定义（包含工具和技能配置类型）
3. 实现注册表模块
4. 实现持久化存储

### 第二阶段：工具和技能支持（2-3天）
5. 实现工具过滤机制
   - 创建 SubagentToolFilter 类
   - 实现默认拒绝列表
   - 实现工具策略解析
6. 实现技能继承机制
   - 创建 SubagentSkillsManager 适配器
   - 实现技能配置继承
   - 实现技能过滤逻辑
7. 实现安全审计日志
   - 创建工具调用审计系统
   - 实现安全边界检查

### 第三阶段：通知系统（1-2天）
8. 实现通知机制
9. 实现队列管理

### 第四阶段：工具集成（1-2天）
10. 实现 spawn_subagent 工具（包含工具和技能配置参数）
11. 更新工具注册表
12. 实现工具参数验证和合并逻辑

### 第五阶段：配置和集成（1-2天）
13. 实现配置管理（包含工具和技能配置）
14. 更新 Agent 配置类型
15. 集成到 AgentManager
16. 实现配置继承和覆盖逻辑

### 第六阶段：测试和文档（3-4天）
17. 编写单元测试（重点测试工具过滤和技能继承）
18. 编写集成测试（测试完整的工具和技能调用流程）
19. 编写安全测试（测试递归防止和权限限制）
20. 更新文档（添加工具和技能调用说明）

### 第七阶段：优化和扩展（1-2天）
21. 性能优化（工具过滤链优化）
22. 监控和调试（添加工具调用监控）
23. 扩展功能（支持更多配置选项）

**总计：11-18天**（因增加了工具和技能支持功能）

## 参考实现

本设计参考了 openclaw-cn-ds (Moltbot-CN) 项目的 subagent 实现，主要借鉴了以下设计：

1. **模块化分离**: 注册表、通知、队列、存储分离
2. **配置驱动**: 分层配置系统
3. **工具化集成**: 作为标准工具集成
4. **生命周期管理**: 完整的状态跟踪和清理机制
5. **持久化支持**: 支持重启后状态恢复

## 后续扩展

### 短期扩展（1-2个月）
1. **Webhook 支持**: 支持将结果发送到外部 webhook
2. **自定义清理策略**: 支持更复杂的清理规则
3. **进度通知**: 支持执行进度通知

### 中期扩展（3-6个月）
1. **分布式执行**: 支持在多节点上执行 subagent
2. **资源配额**: 支持按用户或组织分配资源配额
3. **审计日志**: 完整的操作审计日志

### 长期扩展（6-12个月）
1. **工作流引擎**: 支持复杂的 subagent 工作流
2. **智能调度**: 基于资源使用情况的智能调度
3. **联邦学习**: 支持跨组织的 subagent 协作

---

**文档维护**: 本文档应在架构变更或功能扩展时同步更新。