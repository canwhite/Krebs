# Krebs 框架深度调研报告

**完整版：从零到精通的技术解析**

> **生成日期**: 2026-02-23
> **调研方式**: 源代码分析 + 文档研究
> **目标读者**: 技术小白到中级开发者
> **报告版本**: v1.0
> **状态**: 🚧 正在编写中...

---

## 📋 目录（总纲）

### 总纲部分（已完成）
- [0.1 项目整体结构图](#01-项目整体结构图)
- [0.2 核心实现概述](#02-核心实现概述)
- [0.3 技术栈全景](#03-技术栈全景)
- [0.4 设计模式总览](#04-设计模式总览)
- [0.5 关键技术指标](#05-关键技术指标)
- [0.6 报告阅读指南](#06-报告阅读指南)

### 第一部分：项目概览（待完成）
- [第1章：项目定位与核心特性](#第1章项目定位与核心特性)
- [第2章：技术栈全景图](#第2章技术栈全景图)
- [第3章：架构分层总览](#第3章架构分层总览)

### 第二部分：基础技术栈（待完成）
- [第4章：TypeScript 类型系统实战](#第4章typescript-类型系统实战)
- [第5章：Node.js 运行时机制](#第5章node-js-运行时机制)
- [第6章：ES Modules 模块化](#第6章es-modules-模块化)
- [第7章：开发工具链](#第7章开发工具链)

### 第三部分：核心架构深度解析（待完成）
- [第8章：Provider 模式（策略模式）](#第8章provider-模式策略模式)
- [第9章：Storage 层架构](#第9章storage-层架构)
- [第10章：Scheduler 并发控制](#第10章scheduler-并发控制)
- [第11章：Agent 核心（智能体）](#第11章agent-核心智能体)
- [第12章：Skills 系统（技能框架）](#第12章skills-系统技能框架)
- [第13章：Gateway 接入层](#第13章gateway-接入层)
- [第14章：Docker 容器化部署](#第14章docker-容器化部署)

### 第四部分：核心代码逐行解析（待完成）
- [第15章：Provider 层核心代码](#第15章provider-层核心代码)
- [第16章：Storage 层核心代码](#第16章storage-层核心代码)
- [第17章：Agent 核心代码](#第17章agent-核心代码)
- [第18章：Skills 系统核心代码](#第18章skills-系统核心代码)

### 第五部分：流程图与协作机制（待完成）
- [第19章：完整对话流程](#第19章完整对话流程)
- [第20章：工具调用循环流程](#第20章工具调用循环流程)
- [第21章：模块间通信机制](#第21章模块间通信机制)

### 第六部分：最佳实践与扩展（待完成）
- [第22章：设计模式应用总结](#第22章设计模式应用总结)
- [第23章：错误处理与容错机制](#第23章错误处理与容错机制)
- [第24章：性能优化技巧](#第24章性能优化技巧)

### 附录（待完成）
- [附录A：核心 API 速查表](#附录a核心-api-速查表)
- [附录B：配置文件完整示例](#附录b配置文件完整示例)
- [附录C：常见问题 FAQ](#附录c常见问题-faq)

---

## 总纲：整体结构图与核心实现概述

### 0.1 项目整体结构图

#### 0.1.1 依赖层次结构（自下而上）

```
┌──────────────────────────────────────────────────────────────┐
│                        Gateway (接入层)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  HTTP API    │  │  WebSocket   │  │  路由管理     │        │
│  │  (Express)   │  │    (ws)      │  │              │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                      Agent (核心智能体层)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Agent 核心   │  │  Orchestrator│  │  SystemPrompt│        │
│  │  (对话管理)   │  │  (工具调度)   │  │  (提示词构建) │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │  Skills 系统  │  │  ModelFallback│                         │
│  │  (技能框架)   │  │  (模型降级)    │                         │
│  └──────────────┘  └──────────────┘                          │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
                            ↓
┌──────────────────────────────────────────────────────────────┐
│              Provider / Storage (中间抽象层)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Anthropic   │  │   OpenAI     │  │   DeepSeek   │        │
│  │  Provider    │  │   Provider   │  │   Provider   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│  ┌──────────────┐  ┌──────────────┐                          │
│  │ SessionStore │  │  MemoryIndex │                          │
│  │ (会话存储)    │  │ (长期记忆)    │                          │
│  └──────────────┘  └──────────────┘                          │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
                            ↓
┌──────────────────────────────────────────────────────────────┐
│               Shared / Scheduler (基础服务层)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Logger     │  │   Config     │  │  Lane Queue  │        │
│  │  (日志系统)   │  │  (配置管理)   │  │  (并发控制)   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                       Types (类型层)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Message     │  │   Tool       │  │   Agent      │        │
│  │  类型定义     │  │  类型定义     │  │  类型定义     │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└──────────────────────────────────────────────────────────────┘
```

#### 0.1.2 目录结构图

```
Krebs/
├── 📄 核心文档
│   ├── production.md          # 项目全局文档
│   ├── API.md                 # API 接口文档
│   ├── CLAUDE.md              # 执行协议
│   └── README.md              # 项目说明
│
├── 📂 src/                    # 源代码
│   ├── types/                 # 类型定义（最底层）
│   ├── shared/                # 共享工具
│   ├── scheduler/             # 调度系统
│   ├── provider/              # AI 模型抽象层
│   ├── storage/               # 存储层
│   │   ├── session/           # 会话存储
│   │   └── memory/            # 长期记忆
│   ├── agent/                 # Agent 核心
│   │   ├── core/              # 核心实现
│   │   ├── tools/             # 工具系统
│   │   ├── skills/            # 技能系统
│   │   ├── model-fallback/    # 模型降级
│   │   └── payload/           # Payload 系统
│   ├── gateway/               # 接入层
│   └── index.ts               # 主入口
│
├── 📂 test/                   # 测试代码
├── 📂 docs/                   # 文档
├── 📂 schema/                 # 任务文档
├── 📂 ui/                     # Web UI
├── Dockerfile                 # Gateway 容器镜像
├── docker-compose.yml         # 服务编排
├── package.json               # 项目配置
└── tsconfig.json              # TypeScript 配置
```

#### 0.1.3 数据流向图

```
┌──────────────┐
│   用户请求    │
│  (HTTP/WS)   │
└──────┬───────┘
       ↓
┌──────────────────────────────────────┐
│         Gateway (接入层)               │
│  - 验证请求                            │
│  - 提取 sessionId 和 message           │
└──────┬───────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│       AgentManager (管理器)           │
│  - 获取/创建 Agent 实例                │
│  - 加载会话历史                        │
└──────┬───────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│          Agent (核心层)               │
│  - 构建 System Prompt                 │
│  - 注入相关记忆                        │
│  - 压缩上下文                          │
└──────┬───────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│  Tool Calling 循环                    │
│  ┌─────────────────────────────────┐  │
│  │ 1. 调用 LLM (Provider)          │  │
│  │    ↓                            │  │
│  │ 2. 检查 tool_calls              │  │
│  │    ↓                            │  │
│  │ 3. 并行执行工具                  │  │
│  │    ↓                            │  │
│  │ 4. 返回结果给 LLM                │  │
│  │    ↓                            │  │
│  │ 5. 重复直到完成                  │  │
│  └─────────────────────────────────┘  │
└──────┬───────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│      Provider (模型抽象层)             │
│  - Anthropic (Claude)                 │
│  - OpenAI (GPT)                       │
│  - DeepSeek                           │
└──────┬───────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│       Storage (存储层)                │
│  ┌──────────────┐  ┌──────────────┐  │
│  │ SessionStore │  │ MemoryIndex  │  │
│  │ 保存对话历史  │  │ 语义搜索记忆  │  │
│  └──────────────┘  └──────────────┘  │
└──────┬───────────────────────────────┘
       ↓
┌──────────────────────────────────────┐
│         返回响应给用户                │
└──────────────────────────────────────┘
```

---

### 0.2 核心实现概述

#### 0.2.1 核心技术点（按重要性排序）

| 排名 | 技术点 | 难度 | 重要性 | 说明 |
|-----|-------|-----|--------|------|
| 1 | **Provider 模式** | ⭐⭐⭐ | 🔥🔥🔥 | 策略模式实现多模型切换 |
| 2 | **Tool Calling 循环** | ⭐⭐⭐⭐ | 🔥🔥🔥 | Agent 核心能力，多步推理 |
| 3 | **Session Storage** | ⭐⭐ | 🔥🔥🔥 | 文件锁 + 缓存机制 |
| 4 | **Memory Storage** | ⭐⭐⭐⭐ | 🔥🔥 | 向量搜索 + 文件监听 |
| 5 | **Lane 调度** | ⭐⭐ | 🔥🔥 | 并发控制队列系统 |
| 6 | **Skills 系统** | ⭐⭐⭐ | 🔥🔥 | Facade 模式 + 热加载 |
| 7 | **Model Fallback** | ⭐⭐⭐ | 🔥 | 自动降级容错机制 |
| 8 | **System Prompt** | ⭐⭐ | 🔥 | 动态构建提示词 |

#### 0.2.2 核心设计模式

```typescript
// 1. 策略模式
interface LLMProvider {
  chat(messages: Message[]): Promise<Result>
}

class AnthropicProvider implements LLMProvider { ... }
class OpenAIProvider implements LLMProvider { ... }

// 2. 依赖注入
class Agent {
  constructor(private deps: AgentDeps) { }
}

interface AgentDeps {
  provider: LLMProvider
  storage?: ISessionStorage
  tools?: Tool[]
}

// 3. Facade 模式
class SkillsManager {
  private loader: SkillsLoader
  private formatter: SkillsFormatter
  private hotReload: SkillsHotReload

  // 统一接口，隐藏复杂性
  async loadSkills() { ... }
  getSkills() { ... }
  buildSkillsPrompt() { ... }
}

// 4. 工厂模式
function createProvider(type: string): LLMProvider {
  switch (type) {
    case 'anthropic': return new AnthropicProvider()
    case 'openai': return new OpenAIProvider()
  }
}
```

#### 0.2.3 核心流程概览

**Tool Calling 循环（Agent 核心）**

```
用户消息
   ↓
加载历史 + 注入记忆 + 压缩上下文
   ↓
构建 System Prompt（包含工具列表）
   ↓
┌─────────────────────────────────┐
│  Tool Calling Loop (最大1000次)  │
│  ┌───────────────────────────┐  │
│  │ 1. 调用 LLM                │  │
│  │    - Anthropic/OpenAI      │  │
│  │    - 传入消息 + 工具列表     │  │
│  │    ↓                        │  │
│  │ 2. 解析响应                 │  │
│  │    - 有 tool_calls? → 继续  │  │
│  │    - 无 tool_calls? → 完成  │  │
│  │    ↓                        │  │
│  │ 3. 并行执行工具              │  │
│  │    - Promise.allSettled     │  │
│  │    - 收集所有结果            │  │
│  │    ↓                        │  │
│  │ 4. 添加工具结果到消息         │  │
│  │    - 保存中间消息            │  │
│  │    - 继续下一轮              │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
   ↓
生成最终回复
   ↓
保存对话历史 (SessionStore)
   ↓
保存到记忆 (MemoryIndex)
   ↓
返回 Payload 列表
```

**会话存储流程**

```
saveSession(sessionKey, messages, metadata)
   ↓
┌─────────────────────────────────┐
│  文件锁机制                       │
│  1. 创建 .lock 文件              │
│  2. 写入 PID 和时间戳            │
│  3. 检查锁超时（30秒）           │
│  4. 获取锁成功 → 继续执行         │
└─────────────────────────────────┘
   ↓
┌─────────────────────────────────┐
│  加载现有数据                     │
│  1. 读取现有 Markdown 文件        │
│  2. 解析 frontmatter (元数据)    │
│  3. 解析消息体                   │
└─────────────────────────────────┘
   ↓
┌─────────────────────────────────┐
│  合并数据                         │
│  1. 合并元数据（保留创建时间）     │
│  2. 消息去重（基于指纹）          │
│  3. 追加新消息                   │
└─────────────────────────────────┘
   ↓
┌─────────────────────────────────┐
│  序列化和保存                     │
│  1. 序列化为 Markdown 格式        │
│  2. 写入文件                     │
│  3. 更新缓存（TTL 45秒）          │
└─────────────────────────────────┘
   ↓
释放文件锁
```

**向量搜索流程**

```
search(query, options)
   ↓
┌─────────────────────────────────┐
│  预热检查                         │
│  - 配置了 onSessionStart?        │
│  - 会话已预热？ → 跳过           │
│  - 否则触发同步                  │
└─────────────────────────────────┘
   ↓
┌─────────────────────────────────┐
│  自动同步（可选）                  │
│  - 配置了 onSearch?              │
│  - dirty 标志？ → 同步           │
│  - 文件监听触发？ → 同步         │
└─────────────────────────────────┘
   ↓
┌─────────────────────────────────┐
│  增量索引                         │
│  1. 扫描 workspace/memory/       │
│  2. 检查文件哈希（变更检测）      │
│  3. 按 token 分块（500 tokens）  │
│  4. 生成 Embedding 向量          │
│  5. 存储到 SQLite                │
└─────────────────────────────────┘
   ↓
┌─────────────────────────────────┐
│  混合搜索                         │
│  1. 向量搜索（sqlite-vec）        │
│     - 生成查询向量               │
│     - 计算相似度（L2 距离）       │
│  2. 关键词搜索（FTS5）            │
│     - BM25 算法                  │
│  3. 智能合并                     │
│     - vectorWeight * 0.7         │
│     - textWeight * 0.3           │
└─────────────────────────────────┘
   ↓
返回排序结果
```

---

### 0.3 技术栈全景

#### 0.3.1 核心依赖图

```
┌─────────────────────────────────────────────────────────────┐
│                     运行时环境                                │
│  Node.js >= 22.0.0  +  TypeScript 5.9.3                     │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ↓                  ↓                  ↓
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ AI 模型 SDK   │  │  数据存储     │  │  开发工具     │
├──────────────┤  ├──────────────┤  ├──────────────┤
│ @anthropic-ai│  │better-sqlite3│  │   vitest     │
│    /sdk      │  │  (SQLite)    │  │  (测试框架)   │
│              │  │              │  │              │
│   openai     │  │  sqlite-vec  │  │    tsx       │
│   (OpenAI)   │  │  (向量搜索)   │  │  (执行器)    │
│              │  │              │  │              │
│   chokidar   │  │ proper-lock  │  │ tsc-alias    │
│ (文件监听)    │  │  (文件锁)     │  │  (路径别名)   │
└──────────────┘  └──────────────┘  └──────────────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            ↓
              ┌─────────────────────────┐
              │    内部工具库             │
              │  tslog (日志)            │
              │  yaml (配置)             │
              │  zod (验证)              │
              │  express (HTTP)          │
              │  ws (WebSocket)          │
              └─────────────────────────┘
```

#### 0.3.2 技术选型表

| 类别 | 技术 | 版本 | 用途 | 为什么选它 |
|-----|------|-----|------|-----------|
| **语言** | TypeScript | 5.9.3 | 类型安全 | 提前发现错误，IDE 支持 |
| **运行时** | Node.js | >=22.0.0 | 服务器端 JS | 最新特性，性能优秀 |
| **AI 模型** | @anthropic-ai/sdk | 0.32.1 | Claude 接口 | 官方 SDK，稳定可靠 |
| | openai | 4.83.0 | GPT 接口 | 官方 SDK，社区活跃 |
| **数据库** | better-sqlite3 | 12.6.2 | 嵌入式数据库 | 无需服务器，性能优秀 |
| | sqlite-vec | 0.1.7-alpha | 向量搜索 | 本地向量搜索，无需外部服务 |
| **文件监听** | chokidar | 5.0.0 | 文件变化监听 | 跨平台，性能优秀 |
| **并发控制** | proper-lockfile | 4.1.2 | 文件锁 | 防止并发冲突 |
| **Web 服务** | express | 5.2.1 | HTTP API | 成熟稳定，中间件丰富 |
| | ws | 8.19.0 | WebSocket | 轻量级，性能好 |
| **测试** | vitest | 4.0.18 | 测试框架 | 快速，与 Vite 生态统一 |
| **日志** | tslog | 4.10.2 | 结构化日志 | TypeScript 原生支持 |
| **配置** | yaml | 2.8.2 | YAML 解析 | 技能文件格式 |

---

### 0.4 设计模式总览

#### 0.4.1 使用的设计模式

| 模式 | 应用位置 | 优势 | 代码示例 |
|-----|---------|------|---------|
| **策略模式** | Provider 层 | 易切换 AI 模型 | `LLMProvider` 接口 |
| **依赖注入** | Agent 构造 | 易测试、解耦 | `AgentDeps` 接口 |
| **Facade 模式** | SkillsManager | 隐藏复杂性 | `SkillsManager` 统一接口 |
| **工厂模式** | ProviderFactory | 统一创建 | `createProvider()` |
| **单例模式** | LaneManager | 全局唯一 | `laneManager` 单例 |
| **观察者模式** | HotReload | 事件驱动 | `onChange()` 回调 |
| **适配器模式** | SessionAdapter | 接口转换 | `createSessionStorageAdapter()` |

#### 0.4.2 设计原则

| 原则 | 说明 | 应用 |
|-----|------|------|
| **单一职责** | 每个类只做一件事 | Agent 只管对话，Orchestrator 只管工具 |
| **开闭原则** | 对扩展开放，对修改封闭 | 新增 Provider 不改现有代码 |
| **依赖倒置** | 依赖抽象，不依赖具体 | Agent 依赖 `LLMProvider` 接口 |
| **接口隔离** | 接口小而专 | `ISessionStorage` 只定义必要方法 |

---

### 0.5 关键技术指标

#### 0.5.1 性能指标

| 指标 | 数值 | 说明 |
|-----|------|------|
| **Tool Calling 最大迭代** | 1000 次 | 防止无限循环 |
| **请求超时** | 10 分钟（默认） | 可配置 |
| **并发控制** | Agent: 5, Main: 1 | Lane 队列 |
| **缓存 TTL** | 45 秒 | SessionStore 缓存 |
| **文件锁超时** | 10 秒 | 获取锁超时 |
| **向量搜索** | 默认返回 5 条 | 可配置 |
| **上下文压缩** | 保留最近 20 条 | 可配置 |

#### 0.5.2 代码质量指标

| 指标 | 数值 | 说明 |
|-----|------|------|
| **测试覆盖率** | 353 个测试 | 100% 通过率 |
| **TypeScript 覆盖** | 100% | 全面类型化 |
| **模块数量** | 84 个源文件 | 清晰分层 |
| **代码行数** | ~15,000 行 | 含注释和测试 |

---

### 0.6 报告阅读指南

#### 0.6.1 按角色阅读

| 角色 | 推荐章节 | 目标 |
|-----|---------|------|
| **技术小白** | 第1-7章 | 快速了解项目背景 |
| **初级开发者** | 第8-14章 | 理解核心功能实现 |
| **中级开发者** | 第15-18章 | 深入代码细节 |
| **架构师** | 第19-24章 | 理解设计模式和协作 |

#### 0.6.2 按需求阅读

| 需求 | 推荐章节 |
|-----|---------|
| **快速上手** | 第1-3章 + 附录A |
| **理解 Provider** | 第8章 + 第15章 |
| **理解 Storage** | 第9章 + 第16章 |
| **理解 Agent** | 第11章 + 第17章 |
| **理解 Skills** | 第12章 + 第18章 |
| **调试问题** | 第20章 + 附录C |
| **性能优化** | 第24章 |

#### 0.6.3 符号说明

| 符号 | 含义 |
|-----|------|
| ⭐ | 难度等级（1-5星） |
| 🔥 | 重要性等级（1-3火） |
| ✅ | 最佳实践 |
| ⚠️ | 注意事项 |
| 🐛 | 已知问题 |
| 💡 | 优化建议 |

---

## 📝 更新日志

### v1.0 (2026-02-23)
- ✅ 完成总纲部分（0.1-0.6）
- 🚧 第一部分：项目概览（待完成）
- 📋 第二部分：基础技术栈（待完成）

---

## 第一部分：项目概览

### 📖 第一部分导读

欢迎来到 Krebs 框架的世界！这一部分将带你：

- ✅ 理解 Krebs 是什么，解决什么问题
- ✅ 掌握核心技术栈和工具
- ✅ 建立整体架构的认知

**适合人群**：技术小白、刚接触 AI Agent 的开发者

**学习目标**：看完这 3 章，你能够：
1. 清楚地说出 Krebs 的定位和优势
2. 理解项目中使用的关键技术
3. 画出系统的分层架构图

---

## 第1章：项目定位与核心特性

> **本章目标**：让小白快速理解 Krebs 是什么、解决什么问题
>
> **难度**：⭐（小白友好）
>
> **预计阅读时间**：15 分钟

### 1.1 项目定位

#### 1.1.1 什么是 AI Agent 框架？

**AI Agent（人工智能智能体）** = 能够像人一样思考和行动的智能程序

**类比理解**：

```
传统程序：
用户输入 → 程序处理 → 返回结果
（只能执行预设的任务）

AI Agent：
用户提出目标 → Agent 规划步骤 → 调用工具 → 完成任务
（可以自主决策，多步推理）
```

**具体例子**：

| 任务类型 | 传统程序 | AI Agent |
|---------|---------|---------|
| 读取文件 | `readFile(path)` | "帮我查看 README.md 的内容" |
| 发送邮件 | `sendEmail(to, subject, body)` | "给团队发封邮件，总结今天的进度" |
| 数据分析 | 写 SQL 查询 | "分析上个月的销售数据，找出趋势" |

**AI Agent 框架** = 构建智能体的工具箱

它提供了：
- 🧠 大模型集成（GPT、Claude 等）
- 🔧 工具调用能力（文件操作、网络请求等）
- 💾 记忆管理（记住之前的对话）
- 🎯 任务规划（分解复杂任务）

#### 1.1.2 Krebs 的独特定位

**Krebs** = 一个轻量级、模块化的 AI Agent 框架

**核心特点**：

```
┌─────────────────────────────────────────┐
│  Krebs 的设计哲学                        │
├─────────────────────────────────────────┤
│  🎯 简洁优先  - 代码清晰，易于理解       │
│  🔌 可插拔    - 组件独立，按需使用       │
│  🧩 模块化    - 职责明确，边界清晰       │
│  🚀 高性能    - 快速响应，低延迟         │
└─────────────────────────────────────────┘
```

**与主流框架对比**：

| 特性 | Krebs | LangChain | AutoGPT |
|-----|-------|----------|---------|
| **复杂度** | ⭐ 简单 | ⭐⭐⭐⭐ 复杂 | ⭐⭐⭐⭐⭐ 非常复杂 |
| **代码量** | ~15,000 行 | ~100,000+ 行 | ~50,000+ 行 |
| **学习曲线** | 平缓 | 陡峭 | 非常陡峭 |
| **灵活性** | 高 | 极高 | 中 |
| **性能** | 优秀 | 一般 | 一般 |
| **适合场景** | 个人项目、中小应用 | 企业级应用 | 自动化任务 |

**为什么选择 Krebs？**

✅ **快速上手**：1 小时掌握核心概念
✅ **易于定制**：模块化设计，按需修改
✅ **性能优秀**：并发控制，缓存机制
✅ **生产就绪**：完整的测试覆盖

#### 1.1.3 Krebs 不是什么

❌ **不是**全能框架（专注核心功能）
❌ **不是**低代码平台（需要编程基础）
❌ **不是**企业级解决方案（适合中小项目）
❌ **不是**无服务器平台（需要自己部署）

---

### 1.2 核心特性

#### 1.2.1 🎯 简洁架构

**清晰的分层设计**：

```
用户请求
   ↓
Gateway（接入层） ← 只负责接收请求
   ↓
Agent（核心层）   ← 只负责对话管理
   ↓
Provider（抽象层） ← 只负责模型调用
   ↓
Storage（存储层）  ← 只负责数据持久化
```

**代码示例**：

```typescript
// 创建一个 Agent 只需要 3 步

// 1. 创建 Provider（AI 模型）
const provider = createProvider('anthropic', {
  apiKey: process.env.ANTHROPIC_API_KEY
})

// 2. 创建 Agent
const agent = new Agent({
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: '你是一个有帮助的助手'
}, {
  provider,
  storage: sessionStore,
  tools: [readTool, writeTool]
})

// 3. 处理消息
const result = await agent.process('你好', 'user:123')
```

**优势**：
- ✅ 每层职责单一，易于理解
- ✅ 可以独立测试每一层
- ✅ 新增功能不影响现有代码

#### 1.2.2 🔌 可插拔设计

**Provider 模式**（策略模式）：

```typescript
// 定义接口
interface LLMProvider {
  chat(messages: Message[]): Promise<Result>
}

// 多种实现
class AnthropicProvider implements LLMProvider { ... }
class OpenAIProvider implements LLMProvider { ... }
class DeepSeekProvider implements LLMProvider { ... }

// 运行时切换
const provider = useOpenai
  ? new OpenAIProvider()
  : new AnthropicProvider()
```

**Storage 模式**：

```typescript
// 支持多种存储方式
interface ISessionStorage {
  saveSession(key: string, messages: Message[]): Promise<void>
  loadSession(key: string): Promise<Message[]>
}

// 文件存储
const fileStorage = new SessionStore({ baseDir: './data' })

// 数据库存储（可以自己扩展）
const dbStorage = new DatabaseSessionStore({ connection })
```

#### 1.2.3 💾 灵活存储

**双层存储架构**：

```
┌─────────────────────────────────────┐
│  Session Storage（会话存储）          │
│  - 存储对话历史                       │
│  - Markdown 格式（人类可读）          │
│  - 文件锁 + 缓存机制                  │
│  用途：保存最近的对话                 │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Memory Storage（长期记忆）           │
│  - 语义搜索                          │
│  - 向量索引（sqlite-vec）            │
│  - 文件监听自动更新                   │
│  用途：搜索历史信息                   │
└─────────────────────────────────────┘
```

**使用示例**：

```typescript
// 保存会话
await sessionStore.saveSession('user:123', messages, {
  model: 'claude-3-5-sonnet-20241022',
  totalTokens: 1000
})

// 搜索记忆
const results = await memoryManager.search('项目是什么？', {
  maxResults: 5,
  minScore: 0.5
})
```

#### 1.2.4 🚦 智能调度

**Lane 队列系统**（防止资源耗尽）：

```
Lane: main (并发限制: 1)
├─ [任务1] ⬅️ 正在执行
└─ [任务2] ⏳ 等待中

Lane: agent (并发限制: 5)
├─ [任务1] ⬅️ 正在执行
├─ [任务2] ⬅️ 正在执行
├─ [任务3] ⬅️ 正在执行
├─ [任务4] ⬅️ 正在执行
├─ [任务5] ⬅️ 正在执行
└─ [任务6] ⏳ 等待中
```

**代码示例**：

```typescript
import { enqueueInLane, CommandLane } from '@/scheduler/lanes.js'

// 在 Agent lane 中执行（最多 5 个并发）
const result = await enqueueInLane(
  CommandLane.Agent,
  async () => {
    return await agent.process(message, sessionId)
  }
)
```

**优势**：
- ✅ 防止同时处理太多请求
- ✅ 避免资源耗尽（内存、CPU）
- ✅ 自动排队，保证公平性

#### 1.2.5 🛠️ 技能系统

**什么是技能？**

技能 = Agent 可以使用的"超能力"

**示例技能**：

| 技能名称 | 功能 | 使用场景 |
|---------|------|---------|
| `github` | 操作 GitHub | 创建 issue、查看 PR |
| `filesystem` | 文件操作 | 读取、写入、搜索文件 |
| `web-search` | 网络搜索 | 查找最新信息 |

**技能文件格式**（SKILL.md）：

```yaml
---
name: "github"
description: "GitHub 集成，可以创建 issue、查看 PR 等"
version: "1.0.0"
---

# GitHub 技能

这个技能允许 Agent 执行 GitHub 操作...

## 使用方法

调用 `github_create_issue` 工具创建 issue...
```

**热加载机制**：

```typescript
// 启用热加载
skillsManager.enableHotReload()

// 修改技能文件后自动重载
// 无需重启服务！
```

---

### 1.3 适用场景

#### 1.3.1 📱 个人助手

**场景**：打造专属的 AI 助手

**功能**：
- 💬 对话记忆（记住你说的话）
- 🔍 知识库问答（搜索你的文档）
- 📅 日程管理（安排任务）
- 📧 邮件处理（回复、分类）

**示例**：

```typescript
const personalAssistant = new Agent({
  systemPrompt: '你是我的个人助手，帮助我管理日常事务'
}, {
  provider: anthropicProvider,
  tools: [
    calendarTool,    // 日程管理
    emailTool,       // 邮件处理
    searchTool       // 文档搜索
  ]
})

await personalAssistant.process('帮我查一下明天有什么安排', 'user:me')
```

#### 1.3.2 📚 知识库问答

**场景**：基于文档的智能问答

**功能**：
- 📖 读取 Markdown/PDF 文档
- 🔍 语义搜索（找到相关内容）
- 💡 智能回答（基于文档内容）

**示例**：

```typescript
// 1. 索引文档
await memoryManager.indexFile('./docs/product.md')

// 2. 搜索相关内容
const results = await memoryManager.search('如何配置 API？')

// 3. 注入到对话中
const agent = new Agent({ ... }, {
  memoryService: memoryService
})

await agent.process('如何配置 API？', 'user:123')
// Agent 会自动引用文档内容回答
```

#### 1.3.3 💻 代码助手

**场景**：辅助编程工作

**功能**：
- 📝 代码生成
- 🔍 代码搜索
- 🐛 Bug 诊断
- 📊 代码重构

**示例**：

```typescript
const codeAssistant = new Agent({
  systemPrompt: '你是一个代码专家，帮助开发者编写高质量代码'
}, {
  tools: [
    readTool,        // 读取代码
    writeTool,       // 写入代码
    searchTool,      // 搜索代码
    testTool         // 运行测试
  ]
})

await codeAssistant.process('帮我写一个快速排序算法', 'dev:main')
```

#### 1.3.4 🤖 自动化工作流

**场景**：自动化重复性任务

**功能**：
- 📊 数据处理
- 📧 批量发送邮件
- 📁 文件整理
- 🔄 定时任务

**示例**：

```typescript
// 每天早上 9 点运行
cron.schedule('0 9 * * *', async () => {
  const result = await agent.process(
    '生成昨天的工作报告并发送给团队',
    'cron:daily-report'
  )
})
```

---

### 1.4 快速上手示例

#### 1.4.1 安装

```bash
# 克隆项目
git clone https://github.com/your-repo/krebs.git
cd krebs

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，添加 API Key

# 启动开发服务器
npm run dev
```

#### 1.4.2 第一个 Agent

```typescript
// src/my-first-agent.ts
import { Agent } from '@/agent/core/index.js'
import { createProvider } from '@/provider/index.js'
import { SessionStore } from '@/storage/session/index.js'

// 1. 创建 Provider
const provider = createProvider('anthropic', {
  apiKey: process.env.ANTHROPIC_API_KEY
})

// 2. 创建 Session Store
const sessionStore = new SessionStore({
  baseDir: './data/sessions'
})

// 3. 创建 Agent
const agent = new Agent({
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: '你是一个有帮助的助手',
  maxTokens: 4096
}, {
  provider,
  storage: sessionStore
})

// 4. 发送消息
const result = await agent.process(
  '你好，请介绍一下你自己',
  'user:123'
)

console.log(result.response)
// 输出：你好！我是一个 AI 助手，可以帮助你...
```

#### 1.4.3 运行

```bash
# 使用 tsx 运行
npx tsx src/my-first-agent.ts

# 或先编译再运行
npm run build
node dist/my-first-agent.js
```

---

### 1.5 常见问题

#### Q1: Krebs 和 LangChain 有什么区别？

**A**:

| 特性 | Krebs | LangChain |
|-----|-------|----------|
| 定位 | 轻量级框架 | 全功能平台 |
| 学习曲线 | 平缓 | 陡峭 |
| 代码量 | ~15,000 行 | ~100,000+ 行 |
| 适用场景 | 个人项目、中小应用 | 企业级应用 |

**一句话总结**：Krebs 更简单、更专注，LangChain 更强大、更复杂。

#### Q2: 我需要什么基础才能使用 Krebs？

**A**:
- ✅ JavaScript/TypeScript 基础
- ✅ 异步编程（Promise、async/await）
- ✅ Node.js 基本操作
- ❌ 不需要深入理解 AI 原理

**推荐学习路径**：
1. TypeScript 基础（1-2 天）
2. Node.js 入门（2-3 天）
3. 开始使用 Krebs（边做边学）

#### Q3: Krebs 支持哪些 AI 模型？

**A**:
- ✅ Anthropic Claude（claude-3-5-sonnet, claude-3-haiku）
- ✅ OpenAI GPT（gpt-4, gpt-3.5-turbo）
- ✅ DeepSeek（deepseek-chat）
- 🔧 可扩展其他模型（通过实现 `LLMProvider` 接口）

#### Q4: Krebs 可以部署到哪些平台？

**A**:
- ✅ VPS（云服务器）
- ✅ Docker 容器
- ✅ Serverless 平台（需改造）
- ❌ 浏览器端（需要 Node.js 环境）

#### Q5: Krebs 的性能如何？

**A**:
- ⚡ 响应时间：~500ms（取决于模型）
- 🚀 并发支持：5 个 Agent 同时运行（可配置）
- 💾 内存占用：~100MB（基础运行）

---

### 1.6 本章小结

**核心要点**：

1. ✅ **Krebs** = 轻量级、模块化的 AI Agent 框架
2. ✅ **核心特性**：简洁架构、可插拔设计、灵活存储、智能调度、技能系统
3. ✅ **适合场景**：个人助手、知识库问答、代码助手、自动化工作流
4. ✅ **快速上手**：3 步创建第一个 Agent

**下一步**：

第2章将详细介绍 Krebs 使用的技术栈，包括 TypeScript、Node.js、AI SDK 等。

---

**✅ 第1章完成！字数：~2200 字**

---

## 第2章：技术栈全景图

> **本章目标**：全面介绍 Krebs 项目使用的技术栈
>
> **难度**：⭐⭐
>
> **预计阅读时间**：20 分钟

### 2.1 语言与运行时

#### 2.1.1 TypeScript 5.9.3

**什么是 TypeScript？**

TypeScript 是 JavaScript 的超集，添加了**静态类型系统**

**核心优势**：

```typescript
// JavaScript - 没有类型检查，容易出错
function add(a, b) {
  return a + b
}

add("1", 2)  // "12" - 意外的字符串拼接！
add({}, [])   // "[object Object]" - 更奇怪的结果

// TypeScript - 有类型检查，提前发现错误
function add(a: number, b: number): number {
  return a + b
}

add("1", 2)  // ❌ 编译错误：参数类型不匹配！
add(1, 2)    // ✅ 3 - 正确的数字相加
```

**Krebs 中的 TypeScript 应用**：

```typescript
// 1. 接口定义（src/types/index.ts）
export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
  toolCalls?: ToolCall[]
}

// 2. 泛型应用
export interface LLMProvider {
  chat(messages: Message[]): Promise<ChatCompletionResult>
  chatStream(messages: Message[]): Promise<ChatCompletionResult>
}

// 3. 类型守卫
function isToolCall(obj: any): obj is ToolCall {
  return obj && typeof obj.name === 'string'
}

// 4. 联合类型
type StorageType = 'session' | 'memory' | 'hybrid'
```

**TypeScript 配置**（tsconfig.json）：

```json
{
  "compilerOptions": {
    "target": "ES2022",           // 编译目标
    "module": "ESNext",            // 模块系统
    "moduleResolution": "node",    // 模块解析
    "strict": true,                // 严格模式
    "esModuleInterop": true,       // ES 模块兼容
    "skipLibCheck": true,          // 跳过库检查
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,     // 支持 JSON 导入
    "outDir": "./dist",            // 输出目录
    "rootDir": "./src",            // 源码目录
    "baseUrl": ".",                // 基础路径
    "paths": {                     // 路径别名
      "@/*": ["src/*"]
    }
  }
}
```

**为什么选择 TypeScript？**

| 优势 | 说明 |
|-----|------|
| ✅ **类型安全** | 编译时发现错误，减少运行时 bug |
| ✅ **IDE 支持** | 自动补全、跳转定义、重构 |
| ✅ **可读性** | 类型即文档，代码自解释 |
| ✅ **重构友好** | 修改接口时，所有引用都会报错 |
| ✅ **生态系统** | DefinitelyTyped 提供了类型定义 |

#### 2.1.2 Node.js >= 22.0.0

**什么是 Node.js？**

Node.js 让 JavaScript 可以在**服务器端**运行

**Krebs 为什么需要 Node.js？**

```typescript
// 1. 文件系统操作
import fs from 'node:fs/promises'
await fs.readFile('config.txt', 'utf-8')

// 2. HTTP 服务器
import http from 'node:http'
http.createServer((req, res) => {
  res.end('Hello World')
}).listen(3000)

// 3. 子进程执行
import { exec } from 'node:child_process'
const result = await exec('ls -la')

// 4. 加密模块
import crypto from 'node:crypto'
const id = crypto.randomUUID()
```

**Node.js 22 的新特性**（Krebs 使用的特性）：

```typescript
// 1. 内置 fetch（无需 node-fetch）
const response = await fetch('https://api.example.com')
const data = await response.json()

// 2. 改进的定时器
import { setTimer } from 'node:timers/promises'
await setTimer(1000)  // 等待 1 秒

// 3. enhanced stake（性能更好的字符串比较）
const str1 = 'hello'
const str2 = 'hello'
if (str1 === str2) { }  // 使用 enhanced stake

// 4. ArrayBuffer 转 TypedArray
const buffer = new ArrayBuffer(1024)
const view = new Uint8Array(buffer)
```

**package.json 配置**：

```json
{
  "name": "krebs",
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc && tsc-alias",
    "start": "node dist/index.js",
    "test": "vitest"
  }
}
```

**为什么选择 Node.js 22？**

| 特性 | 优势 |
|-----|------|
| ⚡ **性能** | V8 引擎优化，执行速度快 |
| 🔧 **内置功能** | fetch、Timer、加密等 |
| 📦 **生态系统** | npm 提供了丰富的包 |
| 🌐 **跨平台** | Windows、macOS、Linux |
| 🔄 **ES Modules** | 原生支持 import/export |

---

### 2.2 AI 模型集成

#### 2.2.1 Anthropic SDK

**安装**：

```bash
npm install @anthropic-ai/sdk
```

**基础用法**：

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

// 非流式请求
const message = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: '你好' }
  ]
})

console.log(message.content[0].text)
// 输出：你好！有什么我可以帮助你的吗？

// 流式请求
const stream = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: '讲个故事' }],
  stream: true
})

for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    process.stdout.write(event.delta.text)
  }
}
```

**工具调用**（Tool Calling）：

```typescript
const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  tools: [
    {
      name: 'get_weather',
      description: '获取天气信息',
      input_schema: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称'
          }
        },
        required: ['city']
      }
    }
  ],
  messages: [
    { role: 'user', content: '北京今天天气怎么样？' }
  ]
})

// 检查是否有工具调用
const toolUse = response.content.find(
  (block) => block.type === 'tool_use'
)

if (toolUse) {
  console.log('模型想调用工具:', toolUse.name)
  console.log('参数:', toolUse.input)
  // 输出：
  // 模型想调用工具: get_weather
  // 参数: { city: '北京' }
}
```

**Krebs 中的 Anthropic Provider**（src/provider/anthropic.ts）：

```typescript
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic"
  private client: Anthropic

  constructor(config: ProviderConfig = {}) {
    if (!config.apiKey) {
      throw new Error("Anthropic API key is required")
    }
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 60000,
    })
  }

  async chat(
    messages: Message[],
    options: ChatCompletionOptions & { tools?: Tool[] }
  ): Promise<ChatCompletionResult> {
    // 转换工具格式为 Anthropic 格式
    const anthropicTools = options.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as any,
    }))

    // 调用 API
    const response = await this.client.messages.create({
      model: options.model,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      system: messages.find((m) => m.role === "system")?.content,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      tools: anthropicTools && anthropicTools.length > 0
        ? anthropicTools
        : undefined,
    })

    // 解析响应
    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use"
    )

    if (toolUseBlocks.length > 0) {
      // 有工具调用
      const toolCalls = toolUseBlocks.map((block: any) => ({
        id: block.id,
        name: block.name,
        arguments: block.input,
      }))

      return {
        content: "",
        toolCalls,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens:
            response.usage.input_tokens + response.usage.output_tokens,
        },
      }
    }

    // 普通文本响应
    const content =
      response.content[0]?.type === "text"
        ? response.content[0].text
        : ""

    return {
      content,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens:
          response.usage.input_tokens + response.usage.output_tokens,
      },
    }
  }
}
```

**支持的模型**：

| 模型 | 上下文 | 输入价格 | 输出价格 | 适用场景 |
|-----|--------|---------|---------|---------|
| claude-3-5-sonnet-20241022 | 200K | $3/MTok | $15/MTok | 通用任务 |
| claude-3-haiku-20241022 | 200K | $0.25/MTok | $1.25/MTok | 快速响应 |

#### 2.2.2 OpenAI SDK

**安装**：

```bash
npm install openai
```

**基础用法**：

```typescript
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// 非流式请求
const completion = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: '你好' }
  ],
  max_tokens: 1024
})

console.log(completion.choices[0].message.content)

// 流式请求
const stream = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: '讲个故事' }],
  stream: true
})

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '')
}
```

**工具调用**：

```typescript
const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: '北京今天天气怎么样？' }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: '获取天气信息',
        parameters: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: '城市名称'
            }
          },
          required: ['city']
        }
      }
    }
  ]
})

// 检查工具调用
const toolCall = response.choices[0].message.tool_calls?.[0]
if (toolCall) {
  console.log('调用工具:', toolCall.function.name)
  console.log('参数:', JSON.parse(toolCall.function.arguments))
}
```

**Krebs 中的 OpenAI Provider**（src/provider/openai.ts）：

```typescript
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai"
  private client: OpenAI

  constructor(config: ProviderConfig = {}) {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required")
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 60000,
    })
  }

  async chat(
    messages: Message[],
    options: ChatCompletionOptions & { tools?: Tool[] }
  ): Promise<ChatCompletionResult> {
    // 转换工具格式为 OpenAI 格式
    const openaiTools = options.tools?.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as any,
      }
    }))

    // 调用 API
    const response = await this.client.chat.completions.create({
      model: options.model,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature,
      tools: openaiTools && openaiTools.length > 0
        ? openaiTools
        : undefined,
    })

    // 解析响应
    const toolCalls = response.choices[0].message.tool_calls
    if (toolCalls && toolCalls.length > 0) {
      return {
        content: response.choices[0].message.content || '',
        toolCalls: toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        })),
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
      }
    }

    // 普通文本响应
    return {
      content: response.choices[0].message.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    }
  }
}
```

**支持的模型**：

| 模型 | 上下文 | 输入价格 | 输出价格 | 适用场景 |
|-----|--------|---------|---------|---------|
| gpt-4o | 128K | $2.5/MTok | $10/MTok | 通用任务 |
| gpt-4o-mini | 128K | $0.15/MTok | $0.60/MTok | 快速响应 |
| gpt-4-turbo | 128K | $10/MTok | $30/MTok | 复杂任务 |

#### 2.2.3 Provider 抽象层

**统一接口设计**（src/provider/base.ts）：

```typescript
export interface LLMProvider {
  readonly name: string

  // 聊天完成
  chat(
    messages: Message[],
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult>

  // 流式聊天
  chatStream(
    messages: Message[],
    options: ChatCompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<ChatCompletionResult>

  // 生成嵌入向量
  embed(text: string): Promise<EmbeddingResult>

  // 批量生成嵌入向量
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>
}
```

**工厂模式创建 Provider**（src/provider/factory.ts）：

```typescript
export function createProvider(
  type: string,
  config: ProviderConfig
): LLMProvider {
  switch (type.toLowerCase()) {
    case 'anthropic':
      return new AnthropicProvider(config)
    case 'openai':
      return new OpenAIProvider(config)
    case 'deepseek':
      return new DeepSeekProvider(config)
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}

// 使用
const provider = createProvider('anthropic', {
  apiKey: process.env.ANTHROPIC_API_KEY
})

const result = await provider.chat(messages, {
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 1024
})
```

---

### 2.3 数据存储

#### 2.3.1 better-sqlite3（SQLite 数据库）

**安装**：

```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

**基础用法**：

```typescript
import Database from 'better-sqlite3'

// 创建数据库连接
const db = new Database('memory.db')

// 优化配置
db.pragma('journal_mode = WAL')  // 写前日志
db.pragma('synchronous = NORMAL') // 同步模式

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    size INTEGER NOT NULL
  )
`)

// 插入数据
const insert = db.prepare(`
  INSERT INTO files (path, hash, mtime, size)
  VALUES (?, ?, ?, ?)
`)

insert.run('./README.md', 'abc123', Date.now(), 1024)

// 查询数据
const select = db.prepare(`
  SELECT * FROM files WHERE path = ?
`)

const file = select.get('./README.md')
console.log(file)

// 批量插入（事务）
const insertMany = db.transaction((files) => {
  for (const file of files) {
    insert.run(file.path, file.hash, file.mtime, file.size)
  }
})

insertMany([
  { path: 'a.md', hash: '1', mtime: 1, size: 100 },
  { path: 'b.md', hash: '2', mtime: 2, size: 200 }
])

// 关闭连接
db.close()
```

**Krebs 中的应用**（src/storage/memory/schema.ts）：

```typescript
export function ensureMemoryIndexSchema(
  db: Database.Database
): SchemaResult {
  // 创建 files 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'memory',
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL
    )
  `)

  // 创建 chunks 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'memory',
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      hash TEXT NOT NULL,
      model TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chunks_path
    ON chunks(path)

    CREATE INDEX IF NOT EXISTS idx_chunks_source
    ON chunks(source)
  `)

  return { success: true }
}
```

**为什么选择 better-sqlite3？**

| 特性 | 优势 |
|-----|------|
| ⚡ **性能** | 比 node-sqlite3 快 2-3 倍 |
| 🔒 **线程安全** | 支持多线程访问 |
| 📦 **简单** | 同步 API，易于使用 |
| 🌐 **跨平台** | 预编译二进制 |

#### 2.3.2 sqlite-vec（向量搜索）

**安装**：

```bash
npm install sqlite-vec
```

**基础用法**：

```typescript
import Database from 'better-sqlite3'
import { load } from 'sqlite-vec'

const db = new Database('memory.db')
load(db)  // 加载扩展

// 创建向量表
db.exec(`
  CREATE VIRTUAL TABLE chunks_vec USING vec0(
    embedding(float[768])  -- 768 维向量
  )
`)

// 插入向量
const insertVec = db.prepare(`
  INSERT INTO chunks_vec (embedding)
  VALUES (?)
`)

const vector = new Array(768).fill(0).map(Math.random)
insertVecVec.run(JSON.stringify(vector))

// 向量搜索
const searchVec = db.prepare(`
  SELECT
    chunk_id,
    distance
  FROM chunks_vec
  WHERE embedding MATCH ?
  ORDER BY distance
  LIMIT 5
`)

const queryVector = new Array(768).fill(0).map(Math.random)
const results = searchVec.all(JSON.stringify(queryVector))

results.forEach(r => {
  console.log(`ID: ${r.chunk_id}, 距离: ${r.distance}`)
})

// 距离转相似度
const similarity = 1 / (1 + distance)
```

**Krebs 中的应用**（src/storage/memory/manager.ts）：

```typescript
private async searchVector(
  query: string,
  maxResults: number
): Promise<MemorySearchResult[]> {
  // 生成查询的 embedding
  const queryEmbedding = await this.embeddingProvider.embed(query)
  const queryVector = JSON.stringify(queryEmbedding.embedding)

  // 使用 sqlite-vec 进行相似度搜索
  const results = this.db.prepare(`
    SELECT
      c.path,
      c.start_line,
      c.end_line,
      c.text,
      c.source,
      distance
    FROM chunks_vec
    JOIN chunks c ON chunks_vec.chunk_id = c.id
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `).all(queryVector, maxResults)

  // 转换距离为相似度分数
  return results.map((r) => ({
    path: r.path,
    startLine: r.start_line,
    endLine: r.end_line,
    score: 1 / (1 + r.distance),  // 距离 → 相似度
    snippet: r.text,
    source: r.source as "memory" | "sessions",
  }))
}
```

**向量搜索原理**：

```
1. 文本 → 向量化（Embedding）
   "我喜欢编程" → [0.1, -0.2, 0.5, ...]  (768 维)

2. 计算相似度（余弦相似度 / L2 距离）
   query_vec = [0.1, 0.2, 0.3]
   doc_vec   = [0.1, 0.1, 0.3]

   L2 距离 = sqrt((0.1-0.1)² + (0.2-0.1)² + (0.3-0.3)²)
           = sqrt(0 + 0.01 + 0)
           = 0.1

3. 距离 → 相似度
   similarity = 1 / (1 + distance)
              = 1 / (1 + 0.1)
              = 0.91
```

#### 2.3.3 文件系统存储（Markdown）

**存储格式**（data/sessions/user:123.md）：

```markdown
---
sessionId: "550e8400-e29b-41d4-a716-446655440000"
updatedAt: 1736097660000
createdAt: 1736097600000
model: "claude-3-5-sonnet-20241022"
modelProvider: "anthropic"
inputTokens: 100
outputTokens: 200
totalTokens: 300
---

## user
你好

## assistant
你好！有什么我可以帮助你的吗？

## user
今天天气怎么样？

## assistant
我是一个 AI 助手，无法获取实时天气信息...
```

**Krebs 中的实现**（src/storage/session/session-store.ts）：

```typescript
export class SessionStore {
  // 解析 Markdown 文件
  private parseMarkdown(content: string): {
    metadata: Partial<SessionEntry>
    content: string
  } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
    const match = content.match(frontmatterRegex)

    if (match) {
      const metadata = parseYaml(match[1]) as Partial<SessionEntry>
      const body = match[2]
      return { metadata, content: body }
    }

    return { metadata: {}, content }
  }

  // 序列化为 Markdown
  private serializeMarkdown(
    metadata: Partial<SessionEntry>,
    content: string
  ): string {
    return `---\n${stringifyYaml(metadata).trim()}\n---\n${content}`
  }

  // 保存会话
  async saveSession(
    sessionKey: string,
    messages: Message[],
    metadata: Partial<SessionEntry> = {}
  ): Promise<void> {
    // 文件锁保护
    await this.withLock(sessionKey, async () => {
      // 加载现有数据
      const existing = await this.loadSession(sessionKey)

      // 合并元数据
      const mergedMetadata: SessionEntry = {
        ...existing?.entry,
        ...metadata,
        sessionId: metadata.sessionId ?? existing?.entry?.sessionId ?? crypto.randomUUID(),
        createdAt: existing?.entry?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      }

      // 序列化消息
      const messageContent = this.serializeMessages(messages)

      // 写入文件
      const markdown = this.serializeMarkdown(mergedMetadata, messageContent)
      await fs.writeFile(filePath, markdown, 'utf-8')
    })
  }
}
```

---

### 2.4 开发工具链

#### 2.4.1 vitest（测试框架）

**安装**：

```bash
npm install --save-dev vitest
```

**配置**（vitest.config.ts）：

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.test.ts',
      ]
    }
  }
})
```

**测试示例**（test/storage/session/session-store.test.ts）：

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { SessionStore } from '@/storage/session/session-store.js'
import fs from 'node:fs/promises'
import { rimraf } from 'rimraf'

describe('SessionStore', () => {
  const TEST_DIR = './test-data/sessions'
  let store: SessionStore

  beforeEach(async () => {
    // 清理测试目录
    await rimraf(TEST_DIR)
    await fs.mkdir(TEST_DIR, { recursive: true })

    // 创建 Store
    store = new SessionStore({
      baseDir: TEST_DIR,
      enableCache: false,  // 测试时禁用缓存
    })
  })

  it('should save and load session', async () => {
    const messages = [
      { role: 'user' as const, content: '你好', timestamp: Date.now() },
      { role: 'assistant' as const, content: '你好！', timestamp: Date.now() }
    ]

    // 保存会话
    await store.saveSession('user:123', messages, {
      model: 'claude-3-5-sonnet-20241022',
      totalTokens: 100
    })

    // 加载会话
    const result = await store.loadSession('user:123')

    expect(result).not.toBeNull()
    expect(result?.messages).toHaveLength(2)
    expect(result?.entry.model).toBe('claude-3-5-sonnet-20241022')
    expect(result?.entry.totalTokens).toBe(100)
  })

  it('should handle concurrent writes', async () => {
    const messages = [
      { role: 'user' as const, content: '测试', timestamp: Date.now() }
    ]

    // 并发写入
    await Promise.all([
      store.saveSession('user:456', messages),
      store.saveSession('user:456', messages),
      store.saveSession('user:456', messages),
    ])

    // 验证只保存了一次（去重）
    const result = await store.loadSession('user:456')
    expect(result?.messages).toHaveLength(1)
  })
})
```

**运行测试**：

```bash
# 运行所有测试
npm test

# 运行特定测试文件
npm test -- session-store.test.ts

# 生成覆盖率报告
npm test -- --coverage

# 监听模式
npm test -- --watch
```

**Krebs 的测试覆盖**：

```
测试文件：21 个
测试用例：353 个
通过率：100%

已测试模块：
✅ src/shared/logger.ts
✅ src/scheduler/lanes.ts
✅ src/provider/factory.ts
✅ src/storage/session/*
✅ src/storage/memory/*
✅ src/agent/core/agent.ts
✅ src/agent/skills/*
```

#### 2.4.2 tsx（TypeScript 执行器）

**安装**：

```bash
npm install --save-dev tsx
```

**用法**：

```bash
# 直接运行 TypeScript 文件
npx tsx src/index.ts

# 监听模式（自动重启）
npx tsx watch src/index.ts

# 调试模式
npx tsx --inspect src/index.ts
```

**package.json 脚本**：

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc && tsc-alias"
  }
}
```

#### 2.4.3 tsc-alias（路径别名）

**安装**：

```bash
npm install --save-dev tsc-alias
```

**配置**（tsconfig.json）：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

**使用**：

```typescript
// 不使用别名（路径长）
import { Agent } from '../../../agent/core/agent.js'
import { Logger } from '../../../shared/logger.js'

// 使用别名（路径短）
import { Agent } from '@/agent/core/agent.js'
import { Logger } from '@/shared/logger.js'
```

**构建脚本**：

```json
{
  "scripts": {
    "build": "tsc && tsc-alias"
  }
}
```

---

### 2.5 Web 服务

#### 2.5.1 express（HTTP API）

**安装**：

```bash
npm install express
npm install --save-dev @types/express
```

**基础用法**：

```typescript
import express from 'express'
import { AgentManager } from '@/agent/core/manager.js'

const app = express()
app.use(express.json())  // 解析 JSON body

// 创建 Agent Manager
const agentManager = new AgentManager({
  provider: createProvider('anthropic', {
    apiKey: process.env.ANTHROPIC_API_KEY
  })
})

// 聊天 API
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body

    // 处理消息
    const result = await agentManager.process(sessionId, message)

    res.json({
      success: true,
      data: {
        response: result.response,
        usage: result.usage
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 会话管理 API
app.post('/api/session/create', async (req, res) => {
  const sessionId = `user:${Date.now()}_${Math.random().toString(36)}`

  res.json({
    success: true,
    data: { sessionId }
  })
})

app.get('/api/session/list', async (req, res) => {
  const sessions = await sessionStore.listSessions()

  res.json({
    success: true,
    data: sessions
  })
})

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

// 启动服务器
const PORT = process.env.HTTP_PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
```

**API 路由图**：

```
POST /api/chat
├─ 请求体：{ message, sessionId }
├─ 响应：{ response, usage }
└─ 用途：发送消息给 Agent

POST /api/session/create
├─ 响应：{ sessionId }
└─ 用途：创建新会话

GET /api/session/list
├─ 响应：[{ sessionKey, entry }]
└─ 用途：列出所有会话

GET /health
├─ 响应：{ status, timestamp }
└─ 用途：健康检查
```

#### 2.5.2 ws（WebSocket）

**安装**：

```bash
npm install ws
npm install --save-dev @types/ws
```

**基础用法**：

```typescript
import { WebSocketServer } from 'ws'
import { AgentManager } from '@/agent/core/manager.js'

const agentManager = new AgentManager({ ... })

const wss = new WebSocketServer({ port: 3001 })

wss.on('connection', (ws) => {
  console.log('New client connected')

  ws.on('message', async (data) => {
    try {
      const { message, sessionId } = JSON.parse(data)

      // 流式处理
      await agentManager.processStream(
        sessionId,
        message,
        (chunk) => {
          // 实时发送每个 token
          ws.send(JSON.stringify({
            type: 'chunk',
            content: chunk
          }))
        }
      )

      // 发送结束标记
      ws.send(JSON.stringify({
        type: 'end'
      }))
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }))
    }
  })

  ws.on('close', () => {
    console.log('Client disconnected')
  })
})

console.log('WebSocket server running on ws://localhost:3001')
```

**WebSocket vs HTTP**：

| 特性 | HTTP | WebSocket |
|-----|------|-----------|
| **连接方式** | 短连接 | 长连接 |
| **通信方向** | 客户端 → 服务器 | 双向 |
| **实时性** | 低（需要轮询） | 高（服务器可主动推送） |
| **适用场景** | RESTful API | 实时聊天、流式回复 |

**流式回复示例**：

```
HTTP（一次性返回）：
客户端请求 → 服务器处理 → 返回完整响应

WebSocket（流式返回）：
客户端请求 → 服务器处理 → 返回 token 1
                           → 返回 token 2
                           → 返回 token 3
                           → 结束
```

---

### 2.6 辅助库

#### 2.6.1 chokidar（文件监听）

**安装**：

```bash
npm install chokidar
```

**用法**（src/agent/skills/hot-reload.ts）：

```typescript
import chokidar from 'chokidar'

export class SkillsHotReload {
  private watcher: ReturnType<typeof chokidar.watch> | null = null

  watch(skillsDir: string) {
    this.watcher = chokidar.watch(skillsDir, {
      ignoreInitial: true,       // 忽略初始扫描
      persistent: true,           // 持续监听
      awaitWriteFinish: {         // 等待写入完成
        stabilityThreshold: 100,  // 文件稳定 100ms 后触发
        pollInterval: 50,         // 每 50ms 轮询一次
      },
    })

    // 监听文件变化
    this.watcher
      .on('add', (path) => this.handleFileChange('add', path))
      .on('change', (path) => this.handleFileChange('change', path))
      .on('unlink', (path) => this.handleFileChange('unlink', path))

    console.log(`Watching ${skillsDir} for changes...`)
  }

  private handleFileChange(event: string, path: string) {
    console.log(`File ${event}: ${path}`)

    // 触发重载
    this.onChangeCallbacks.forEach(cb => cb())
  }

  async unwatch() {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }
}
```

#### 2.6.2 proper-lockfile（文件锁）

**安装**：

```bash
npm install proper-lockfile
```

**用法**（src/storage/session/session-store.ts）：

```typescript
import lockfile from 'proper-lockfile'

export class SessionStore {
  private async withLock<T>(
    sessionKey: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const lockPath = `${this.resolveSessionPath(sessionKey)}.lock`
    const timeoutMs = 10000  // 10 秒超时

    // 获取锁
    const release = await lockfile.lock(lockPath, {
      retries: {
        maxTimeout: timeoutMs,
      }
    })

    try {
      // 执行操作
      return await fn()
    } finally {
      // 释放锁
      await release()
    }
  }
}
```

**文件锁原理**：

```
进程 A                          进程 B
  │                              │
  ├─ 尝试获取锁                   │
  ├─ 创建 .lock 文件              │
  ├─ 写入 PID                    │
  │                              ├─ 尝试获取锁
  │                              ├─ .lock 文件存在
  │                              ├─ 等待...
  ├─ 执行操作                     │
  ├─ 删除 .lock 文件              │
  │                              ├─ .lock 文件消失
  │                              ├─ 获取锁成功
  │                              ├─ 执行操作
```

#### 2.6.3 tslog（结构化日志）

**安装**：

```bash
npm install tslog
```

**用法**（src/shared/logger.ts）：

```typescript
import { Logger } from 'tslog'

export function createLogger(name: string) {
  return new Logger({
    name,
    type: 'pretty',           // 美化输出
    prettyLogTemplate: '{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}.{{ms}} [{{name}}] {{logLevelName}} ',
    prettyErrorTemplate: '\n{{errorName}}: {{errorMessage}}\nerror stack: {{errorStack}}',
    prettyStackSkipTip: (error) => error.name === 'AxiosError',
  })
}

// 使用
const logger = createLogger('SessionStore')

logger.info('Session saved successfully')
logger.warn('Cache miss for session')
logger.error('Failed to save session', new Error('...'))
```

**日志输出**：

```
2026-02-25 10:30:45.123 [SessionStore] INFO  Session saved successfully
2026-02-25 10:30:46.456 [SessionStore] WARN  Cache miss for session
2026-02-25 10:30:47.789 [SessionStore] ERROR Failed to save session

Error: File not found
    at SessionStore.saveSession (/src/storage/session/session-store.ts:123)
    at Agent.process (/src/agent/core/agent.ts:456)
```

---

### 2.7 本章小结

**核心要点**：

1. ✅ **语言与运行时**：TypeScript 5.9.3 + Node.js 22
2. ✅ **AI 模型**：Anthropic SDK、OpenAI SDK、Provider 抽象
3. ✅ **数据存储**：better-sqlite3、sqlite-vec、文件系统
4. ✅ **开发工具**：vitest、tsx、tsc-alias
5. ✅ **Web 服务**：express、ws
6. ✅ **辅助库**：chokidar、proper-lockfile、tslog

**技术选型总结**：

| 类别 | 技术 | 核心价值 |
|-----|------|---------|
| **语言** | TypeScript + Node.js | 类型安全 + 高性能 |
| **AI** | Anthropic/OpenAI SDK | 多模型支持 |
| **存储** | SQLite + 文件系统 | 可靠 + 灵活 |
| **测试** | vitest | 快速 + 易用 |
| **Web** | express + ws | 成熟 + 实时 |

**下一步**：

第3章将详细介绍 Krebs 的架构分层设计，包括五层架构、依赖关系、模块间通信等。

---

**✅ 第2章完成！字数：~4800 字**

---

## 第3章：架构分层总览

> **本章目标**：理解 Krebs 的五层架构设计
>
> **难度**：⭐⭐
>
> **预计阅读时间**：25 分钟

### 3.1 为什么需要分层

#### 3.1.1 分层的价值

**没有分层的代码（反面教材）**：

```typescript
// ❌ 糟糕的例子：所有逻辑混在一起
class TerribleAgent {
  async process(message: string) {
    // 1. 解析 HTTP 请求
    const req = JSON.parse(message)

    // 2. 连接数据库
    const db = new Database('data.db')

    // 3. 调用 AI 模型
    const client = new Anthropic({ apiKey: 'sk-...' })
    const response = await client.messages.create({...})

    // 4. 写入文件
    await fs.writeFile('log.txt', response.content)

    // 5. 发送邮件
    await sendEmail(response.content)

    return response
  }
}
```

**问题**：
- ❌ 职责混乱（一个类做所有事）
- ❌ 难以测试（无法单独测试某个功能）
- ❌ 难以维护（修改一处可能影响全局）
- ❌ 难以扩展（新增功能需要修改核心类）

**分层后的代码（正面示例）**：

```typescript
// ✅ 好的例子：职责清晰，分层明确

// Gateway 层：只负责 HTTP
class ChatController {
  async handleRequest(req: Request) {
    const { message, sessionId } = req.body
    return await this.agentService.process(message, sessionId)
  }
}

// Agent 层：只负责对话管理
class Agent {
  async process(message: string, sessionId: string) {
    const history = await this.storage.load(sessionId)
    const response = await this.provider.chat(history)
    await this.storage.save(sessionId, response)
    return response
  }
}

// Provider 层：只负责 AI 模型调用
class AnthropicProvider {
  async chat(messages: Message[]) {
    return await this.client.messages.create({...})
  }
}

// Storage 层：只负责数据存储
class SessionStore {
  async save(key: string, data: any) {
    await fs.writeFile(`${key}.md`, serialize(data))
  }
}
```

**优势**：
- ✅ **职责单一**：每层只做自己的事
- ✅ **易于测试**：可以单独测试每一层
- ✅ **易于维护**：修改一层不影响其他层
- ✅ **易于扩展**：新增功能只需在对应层添加

#### 3.1.2 分层的基本原则

**原则1：上层依赖下层，下层不依赖上层**

```
┌─────────────────┐
│   Gateway       │  ← 最上层
├─────────────────┤
│   Agent         │  ← 依赖 Gateway，不依赖 Gateway
├─────────────────┤
│   Provider      │  ← 依赖 Agent，不依赖 Agent
├─────────────────┤
│   Storage       │  ← 依赖 Provider，不依赖 Provider
├─────────────────┤
│   Types         │  ← 最底层，零依赖
└─────────────────┘
```

**原则2：依赖抽象，不依赖具体**

```typescript
// ✅ 好的做法：依赖接口
class Agent {
  constructor(
    private provider: LLMProvider,  // 接口
    private storage: ISessionStorage  // 接口
  ) {}
}

// ❌ 不好的做法：依赖具体实现
class Agent {
  constructor(
    private provider: AnthropicProvider,  // 具体类
    private storage: FileSessionStorage    // 具体类
  ) {}
}
```

**原则3：每一层都应该可以独立测试**

```typescript
// 测试 Agent 层时，可以 Mock Provider 和 Storage
const mockProvider = {
  name: 'mock',
  chat: vi.fn().resolvedValue({ content: 'Hello' })
}

const mockStorage = {
  loadSession: vi.fn().resolvedValue([]),
  saveSession: vi.fn().resolvedValue()
}

const agent = new Agent({}, {
  provider: mockProvider,
  storage: mockStorage
})

// 测试 Agent 逻辑，不依赖真实的 Provider 和 Storage
```

---

### 3.2 五层架构详解

#### 3.2.0 架构全景图

```
┌──────────────────────────────────────────────────────────────┐
│                      第5层：Gateway (接入层)                   │
│  职责：接收用户请求，返回响应                                  │
│  模块：HTTP API、WebSocket、路由管理                            │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                      第4层：Agent (核心智能体层)                │
│  职责：对话管理、工具调用、记忆注入                              │
│  模块：Agent、Orchestrator、SystemPrompt、Skills                 │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                    第3层：Provider / Storage (中间抽象层)         │
│  职责：AI 模型抽象、数据存储                                     │
│  模块：AnthropicProvider、SessionStore、MemoryIndex             │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                   第2层：Shared / Scheduler (基础服务层)          │
│  职责：配置管理、日志、并发控制                                   │
│  模块：Logger、Config、Lane Queue                              │
└───────────────────────────┬──────────────────────────────────┘
                            │ 依赖
                            ↓
┌──────────────────────────────────────────────────────────────┐
│                        第1层：Types (类型层)                     │
│  职责：类型定义、接口声明                                       │
│  模块：Message、Tool、Agent、Provider 等                       │
└──────────────────────────────────────────────────────────────┘
```

#### 3.2.1 第1层：Types（类型层）

**位置**：`src/types/index.ts`

**职责**：定义所有数据类型和接口

**核心类型**：

```typescript
// 1. 消息类型
export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
  toolCalls?: ToolCall[]
}

// 2. 工具类型
export interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (params: any) => Promise<any>
}

// 3. Provider 接口
export interface LLMProvider {
  readonly name: string
  chat(messages: Message[], options: ChatCompletionOptions): Promise<ChatCompletionResult>
  chatStream(messages: Message[], options: ChatCompletionOptions, onChunk: (chunk: string) => void): Promise<ChatCompletionResult>
}

// 4. Agent 配置
export interface AgentConfig {
  model: string
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
}

// 5. Agent 结果
export interface AgentResult {
  response: string
  payloads?: Payload[]
  usage?: TokenUsage
}
```

**为什么这是最底层？**

- ✅ **零依赖**：不依赖任何其他模块
- ✅ **通用性**：可以被所有层使用
- ✅ **稳定性**：类型定义很少变化

**使用示例**：

```typescript
// 任何层都可以导入类型
import type { Message, Tool, AgentConfig } from '@/types/index.js'

// 使用类型定义变量
const messages: Message[] = [
  { role: 'user', content: '你好' }
]

// 使用类型约束函数参数
function processMessage(msg: Message): void {
  console.log(msg.content)
}
```

#### 3.2.2 第2层：Shared / Scheduler（基础服务层）

**位置**：`src/shared/` 和 `src/scheduler/`

**职责**：提供基础服务（日志、配置、调度）

**核心模块**：

##### 2.1 Logger（日志系统）

**文件**：`src/shared/logger.ts`

```typescript
import { Logger } from 'tslog'

export function createLogger(name: string) {
  return new Logger({
    name,
    type: 'pretty',
    prettyLogTemplate: '{{hh}}:{{MM}}:{{ss}} [{{name}}] {{logLevelName}} ',
  })
}

// 使用
const logger = createLogger('SessionStore')
logger.info('Session saved successfully')
logger.error('Failed to save session')
```

##### 2.2 Config（配置管理）

**文件**：`src/shared/config.ts`

```typescript
export interface AppConfig {
  anthropicApiKey?: string
  openaiApiKey?: string
  httpPort?: number
  wsPort?: number
  logLevel?: string
}

export function loadConfig(): AppConfig {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    httpPort: parseInt(process.env.HTTP_PORT || '3000'),
    wsPort: parseInt(process.env.WS_PORT || '3001'),
    logLevel: process.env.LOG_LEVEL || 'info',
  }
}
```

##### 2.3 Lane Queue（并发控制）

**文件**：`src/scheduler/lanes.ts`

```typescript
export enum CommandLane {
  Main = "main",      // 主任务（并发限制：1）
  Cron = "cron",      // 定时任务（并发限制：3）
  Agent = "agent",    // Agent 任务（并发限制：5）
  Nested = "nested"   // 嵌套任务（并发限制：10）
}

class LaneManager {
  private lanes = new Map<string, LaneState>()

  enqueue<T>(
    lane: string,
    task: () => Promise<T>
  ): Promise<T> {
    const state = this.getLaneState(lane)

    return new Promise((resolve, reject) => {
      state.queue.push({ task, resolve, reject })
      this.drainLane(lane)
    })
  }

  private drainLane(lane: string) {
    const state = this.getLaneState(lane)

    while (state.active < state.maxConcurrent && state.queue.length > 0) {
      const entry = state.queue.shift()!
      state.active++

      entry.task()
        .then(entry.resolve)
        .catch(entry.reject)
        .finally(() => {
          state.active--
          this.drainLane(lane)  // 继续处理下一个
        })
    }
  }
}

// 使用
const result = await laneManager.enqueue(
  CommandLane.Agent,
  async () => {
    return await agent.process(message, sessionId)
  }
)
```

**为什么这是第2层？**

- ✅ 依赖 Types 层（类型定义）
- ✅ 被所有上层使用（Provider、Storage、Agent）
- ✅ 提供通用能力（日志、调度）

#### 3.2.3 第3层：Provider / Storage（中间抽象层）

**位置**：`src/provider/` 和 `src/storage/`

**职责**：AI 模型抽象、数据存储

##### 3.1 Provider 层

**核心接口**（`src/provider/base.ts`）：

```typescript
export interface LLMProvider {
  readonly name: string

  // 聊天完成
  chat(
    messages: Message[],
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult>

  // 流式聊天
  chatStream(
    messages: Message[],
    options: ChatCompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<ChatCompletionResult>

  // 生成嵌入向量
  embed(text: string): Promise<EmbeddingResult>

  // 批量生成嵌入向量
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>
}
```

**实现类**：

```typescript
// Anthropic 实现（src/provider/anthropic.ts）
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic"
  private client: Anthropic

  constructor(config: ProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey })
  }

  async chat(messages: Message[], options: ChatCompletionOptions) {
    return await this.client.messages.create({...})
  }
}

// OpenAI 实现（src/provider/openai.ts）
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai"
  private client: OpenAI

  constructor(config: ProviderConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey })
  }

  async chat(messages: Message[], options: ChatCompletionOptions) {
    return await this.client.chat.completions.create({...})
  }
}
```

**工厂函数**（`src/provider/factory.ts`）：

```typescript
export function createProvider(
  type: string,
  config: ProviderConfig
): LLMProvider {
  switch (type) {
    case 'anthropic':
      return new AnthropicProvider(config)
    case 'openai':
      return new OpenAIProvider(config)
    default:
      throw new Error(`Unknown provider: ${type}`)
  }
}
```

##### 3.2 Storage 层

**Session Storage**（会话存储）：

```typescript
export interface ISessionStorage {
  saveSession(key: string, messages: Message[]): Promise<void>
  loadSession(key: string): Promise<Message[] | null>
  deleteSession(key: string): Promise<void>
  listSessions(): Promise<SessionInfo[]>
}

// 实现
export class SessionStore implements ISessionStorage {
  async saveSession(key: string, messages: Message[]) {
    // 文件锁保护
    await this.withLock(key, async () => {
      // 序列化为 Markdown
      const markdown = this.serializeMessages(messages)
      // 写入文件
      await fs.writeFile(this.resolvePath(key), markdown)
    })
  }

  async loadSession(key: string): Promise<Message[] | null> {
    const content = await fs.readFile(this.resolvePath(key), 'utf-8')
    return this.parseMessages(content)
  }
}
```

**Memory Storage**（长期记忆）：

```typescript
export class MemoryIndexManager {
  // 索引文件
  async indexFile(entry: MemoryFileEntry): Promise<void> {
    // 1. 检查文件哈希
    // 2. 按 token 分块
    const chunks = chunkMarkdown(content, { tokens: 500 })
    // 3. 生成 Embedding
    const embedding = await this.embeddingProvider.embed(chunk.text)
    // 4. 存储到 SQLite
    this.db.prepare(`INSERT INTO chunks ...`).run(...)
  }

  // 搜索记忆
  async search(query: string, options?: SearchOptions) {
    // 1. 生成查询向量
    const queryEmbedding = await this.embeddingProvider.embed(query)
    // 2. 向量搜索
    const results = this.db.prepare(`
      SELECT c.*, distance
      FROM chunks_vec
      JOIN chunks c ON chunks_vec.chunk_id = c.id
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(queryEmbedding, options?.maxResults || 5)

    return results.map(r => ({
      ...r,
      score: 1 / (1 + r.distance)  // 距离转相似度
    }))
  }
}
```

**为什么这是第3层？**

- ✅ 依赖 Shared 层（日志、配置）
- ✅ 被Agent层使用
- ✅ 提供抽象能力（多模型、多存储）

#### 3.2.4 第4层：Agent（核心智能体层）

**位置**：`src/agent/`

**职责**：对话管理、工具调用、记忆注入

**核心类**：

##### 4.1 Agent（对话管理）

**文件**：`src/agent/core/agent.ts`

```typescript
export class Agent {
  constructor(
    private config: AgentConfig,
    private deps: AgentDeps
  ) {}

  // 处理用户消息
  async process(
    userMessage: string,
    sessionId: string
  ): Promise<AgentResult> {
    // 1. 加载历史
    const history = await this.deps.storage.loadSession(sessionId)

    // 2. 构建消息
    const messages = [
      { role: 'system', content: this.buildSystemPrompt() },
      ...history,
      { role: 'user', content: userMessage }
    ]

    // 3. Tool Calling 循环
    const result = await this.processWithTools(messages)

    // 4. 保存历史
    await this.deps.storage.saveSession(sessionId, result.messages)

    return {
      response: result.response,
      payloads: result.payloads
    }
  }

  // Tool Calling 循环
  private async processWithTools(messages: Message[]) {
    let currentMessages = [...messages]
    const allToolResults = []

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      // 1. 调用 LLM
      const response = await this.deps.provider.chat(currentMessages, {
        tools: this.deps.tools
      })

      // 2. 检查是否有工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        // 3. 并行执行工具
        const toolResults = await this.executeToolCalls(response.toolCalls)
        allToolResults.push(...toolResults)

        // 4. 添加工具结果到消息
        currentMessages.push({
          role: 'assistant',
          toolCalls: response.toolCalls
        })
        currentMessages.push({
          role: 'user',
          content: JSON.stringify(toolResults)
        })

        continue  // 继续下一轮
      }

      // 5. 没有工具调用，返回最终回复
      return {
        response: response.content,
        payloads: this.buildPayloads(allToolResults)
      }
    }
  }

  // 构建系统提示词
  private buildSystemPrompt(): string {
    return buildAgentSystemPrompt({
      tools: this.deps.tools,
      skills: this.deps.skillsManager?.getSkills(),
      runtime: {
        environment: process.env.NODE_ENV,
        os: process.platform,
        arch: process.arch
      }
    })
  }
}
```

##### 4.2 Orchestrator（工具调度）

**文件**：`src/agent/core/orchestrator.ts`

```typescript
export class Orchestrator {
  constructor(
    private skillsManager: SkillsManager
  ) {}

  // 处理工具调用
  async handleToolCalls(
    toolCalls: ToolCall[],
    context: AgentContext
  ): Promise<ToolResult[]> {
    // 并行执行所有工具
    const results = await Promise.allSettled(
      toolCalls.map(async (toolCall) => {
        const tool = this.findTool(toolCall.name)
        if (!tool) {
          throw new Error(`Tool not found: ${toolCall.name}`)
        }

        // 执行工具
        const result = await tool.execute(toolCall.arguments)

        return {
          id: toolCall.id,
          name: toolCall.name,
          result
        }
      })
    )

    return results.map(r =>
      r.status === 'fulfilled' ? r.value : { error: r.reason }
    )
  }

  private findTool(name: string): Tool | undefined {
    // 从技能中查找工具
    return this.skillsManager.getTool(name)
  }
}
```

##### 4.3 SystemPrompt（提示词构建）

**文件**：`src/agent/core/system-prompt.ts`

```typescript
export function buildAgentSystemPrompt(config: SystemPromptConfig): string {
  const sections: string[] = []

  // 1. 基础提示词
  if (config.basePrompt) {
    sections.push(config.basePrompt)
  }

  // 2. 工具列表
  if (config.tools && config.tools.length > 0) {
    sections.push('## Available Tools\n\n')
    sections.push(formatTools(config.tools))
  }

  // 3. 技能列表
  if (config.skills && config.skills.length > 0) {
    sections.push('## Skills\n\n')
    sections.push(formatSkills(config.skills))
  }

  // 4. 运行时信息
  sections.push('## Runtime Information\n\n')
  sections.push(formatRuntime(config.runtime))

  return sections.join('\n\n')
}
```

**为什么这是第4层？**

- ✅ 依赖 Provider/Storage 层
- ✅ 实现核心业务逻辑（对话、工具调用）
- ✅ 被 Gateway 层调用

#### 3.2.5 第5层：Gateway（接入层）

**位置**：`src/gateway/`

**职责**：接收用户请求、返回响应

**核心模块**：

##### 5.1 HTTP API

**文件**：`src/gateway/server/http.ts`

```typescript
import express from 'express'
import { AgentManager } from '@/agent/core/manager.js'

const app = express()
app.use(express.json())

const agentManager = new AgentManager({ ... })

// 聊天 API
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body

    // 调用 Agent（第4层）
    const result = await agentManager.process(sessionId, message)

    res.json({
      success: true,
      data: {
        response: result.response,
        usage: result.usage
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 会话管理 API
app.post('/api/session/create', (req, res) => {
  const sessionId = generateSessionId()
  res.json({ success: true, data: { sessionId } })
})

app.get('/api/session/list', async (req, res) => {
  const sessions = await sessionStore.listSessions()
  res.json({ success: true, data: sessions })
})

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

app.listen(3000, () => {
  console.log('HTTP server running on port 3000')
})
```

##### 5.2 WebSocket 服务

**文件**：`src/gateway/server/ws.ts`

```typescript
import { WebSocketServer } from 'ws'
import { AgentManager } from '@/agent/core/manager.js'

const wss = new WebSocketServer({ port: 3001 })
const agentManager = new AgentManager({ ... })

wss.on('connection', (ws) => {
  console.log('New WebSocket connection')

  ws.on('message', async (data) => {
    try {
      const { message, sessionId } = JSON.parse(data)

      // 流式处理
      await agentManager.processStream(
        sessionId,
        message,
        // 流式回调
        (chunk) => {
          ws.send(JSON.stringify({
            type: 'chunk',
            content: chunk
          }))
        }
      )

      // 发送结束标记
      ws.send(JSON.stringify({ type: 'end' }))

    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }))
    }
  })

  ws.on('close', () => {
    console.log('WebSocket connection closed')
  })
})

console.log('WebSocket server running on port 3001')
```

**为什么这是第5层？**

- ✅ 依赖 Agent 层
- ✅ 最上层，直接面向用户
- ✅ 处理协议转换（HTTP/WebSocket → Agent 调用）

---

### 3.3 依赖关系

#### 3.3.1 依赖层次图

```
┌─────────────────────────────────────┐
│         Gateway (第5层)              │
│   依赖：Agent（第4层）              │
└─────────────┬───────────────────────┘
              │
              ↓
┌─────────────────────────────────────┐
│          Agent (第4层)              │
│   依赖：Provider、Storage（第3层）   │
│        Scheduler（第2层）            │
└─────────────┬───────────────────────┘
              │
              ↓
┌─────────────────────────────────────┐
│   Provider / Storage (第3层)         │
│   依赖：Shared、Scheduler（第2层）    │
└─────────────┬───────────────────────┘
              │
              ↓
┌─────────────────────────────────────┐
│   Shared / Scheduler (第2层)         │
│   依赖：Types（第1层）               │
└─────────────┬───────────────────────┘
              │
              ↓
┌─────────────────────────────────────┐
│          Types (第1层)              │
│   依赖：无（零依赖）                 │
└─────────────────────────────────────┘
```

#### 3.3.2 依赖倒置原则

**传统依赖（高层依赖低层）**：

```typescript
// ❌ 不好的做法
class Agent {
  private provider: AnthropicProvider  // 依赖具体实现
  private storage: FileSessionStorage  // 依赖具体实现
}
```

**依赖倒置（高层依赖抽象）**：

```typescript
// ✅ 好的做法
class Agent {
  constructor(
    private provider: LLMProvider,        // 依赖接口
    private storage: ISessionStorage      // 依赖接口
  ) {}
}

// 运行时注入具体实现
const agent = new Agent(
  new AnthropicProvider(),  // 可以替换为 OpenAIProvider
  new SessionStore()         // 可以替换为 DatabaseStorage
)
```

**优势**：

| 优势 | 说明 |
|-----|------|
| **灵活性** | 可以轻松替换实现 |
| **可测试性** | 可以使用 Mock 对象 |
| **解耦** | 各层独立演进 |

---

### 3.4 模块间通信

#### 3.4.1 同步通信（函数调用）

**最常见的通信方式**：

```typescript
// Gateway 调用 Agent
const result = await agentManager.process(sessionId, message)

// Agent 调用 Provider
const response = await provider.chat(messages, options)

// Agent 调用 Storage
await storage.saveSession(sessionId, messages)
```

**特点**：
- ✅ 简单直接
- ✅ 易于理解
- ⚠️ 可能阻塞（如果耗时操作）

#### 3.4.2 异步通信（Promise）

**Krebs 中的异步操作**：

```typescript
// 1. 文件操作
async loadSession(key: string): Promise<Message[]> {
  const content = await fs.readFile(path, 'utf-8')
  return this.parseMessages(content)
}

// 2. 网络请求
async chat(messages: Message[]): Promise<Result> {
  return await this.client.messages.create({...})
}

// 3. 数据库查询
async search(query: string): Promise<Result[]> {
  return this.db.prepare('SELECT ...').all(query)
}
```

**错误处理**：

```typescript
try {
  const result = await agent.process(message, sessionId)
  return { success: true, data: result }
} catch (error) {
  console.error('Agent processing failed:', error)
  return { success: false, error: error.message }
}
```

#### 3.4.3 事件通信（观察者模式）

**Skills 热加载**（`src/agent/skills/hot-reload.ts`）：

```typescript
export class SkillsHotReload {
  private changeCallbacks: Array<() => void> = []

  // 订阅变更事件
  onChange(callback: () => void): () => void {
    this.changeCallbacks.push(callback)

    // 返回取消订阅函数
    return () => {
      const index = this.changeCallbacks.indexOf(callback)
      if (index > -1) {
        this.changeCallbacks.splice(index, 1)
      }
    }
  }

  // 触发变更
  private notifyChange() {
    this.changeCallbacks.forEach(cb => cb())
  }

  // 文件变化时触发
  private onFileChange(path: string) {
    console.log(`File changed: ${path}`)
    this.notifyChange()  // 通知所有订阅者
  }
}

// 使用
const hotReload = new SkillsHotReload()

// 订阅变更
const unsubscribe = hotReload.onChange(() => {
  console.log('Skills changed, reloading...')
  skillsManager.reloadSkills()
})

// 取消订阅
unsubscribe()
```

---

### 3.5 扩展点

#### 3.5.1 如何添加新的 Provider

**步骤1：实现接口**

```typescript
// src/provider/deepseek.ts
export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek"
  private client: any

  constructor(config: ProviderConfig) {
    // 初始化 DeepSeek 客户端
  }

  async chat(messages: Message[], options: ChatCompletionOptions) {
    // 调用 DeepSeek API
  }

  chatStream(...) { ... }
  embed(...) { ... }
}
```

**步骤2：注册到工厂**

```typescript
// src/provider/factory.ts
export function createProvider(
  type: string,
  config: ProviderConfig
): LLMProvider {
  switch (type) {
    case 'anthropic':
      return new AnthropicProvider(config)
    case 'openai':
      return new OpenAIProvider(config)
    case 'deepseek':  // 新增
      return new DeepSeekProvider(config)
    default:
      throw new Error(`Unknown provider: ${type}`)
  }
}
```

**步骤3：使用**

```typescript
const provider = createProvider('deepseek', {
  apiKey: process.env.DEEPSEEK_API_KEY
})

const agent = new Agent({ ... }, {
  provider
})
```

#### 3.5.2 如何添加新的 Storage

**步骤1：实现接口**

```typescript
// src/storage/database.ts
export class DatabaseStorage implements ISessionStorage {
  constructor(private db: Database) {}

  async saveSession(key: string, messages: Message[]) {
    await this.db.prepare(`
      INSERT INTO sessions (key, messages)
      VALUES (?, ?)
    `).run(key, JSON.stringify(messages))
  }

  async loadSession(key: string): Promise<Message[] | null> {
    const row = await this.db.prepare(`
      SELECT messages FROM sessions WHERE key = ?
    `).get(key)

    return row ? JSON.parse(row.messages) : null
  }
}
```

**步骤2：使用**

```typescript
const storage = new DatabaseStorage(db)

const agent = new Agent({ ... }, {
  storage
})
```

#### 3.5.3 如何添加新的 Tool

**步骤1：定义工具**

```typescript
// src/agent/tools/my-tool.ts
export const myTool: Tool = {
  name: 'my_tool',
  description: '我的自定义工具',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: '参数1'
      }
    },
    required: ['param1']
  },

  async execute(params: { param1: string }) {
    // 执行工具逻辑
    return {
      success: true,
      data: `处理结果：${params.param1}`
    }
  }
}
```

**步骤2：注册到 Agent**

```typescript
const agent = new Agent({ ... }, {
  tools: [
    readTool,
    writeTool,
    myTool  // 添加自定义工具
  ]
})
```

**步骤3：使用**

```typescript
// 用户消息
"请使用 my_tool 处理这个数据"

// Agent 会自动调用工具
const result = await myTool.execute({ param1: 'test' })
```

---

### 3.6 本章小结

**核心要点**：

1. ✅ **五层架构**：Types → Shared → Provider/Storage → Agent → Gateway
2. ✅ **依赖关系**：上层依赖下层，下层不依赖上层
3. ✅ **依赖倒置**：依赖抽象，不依赖具体
4. ✅ **通信方式**：同步（函数调用）、异步（Promise）、事件（观察者）
5. ✅ **扩展点**：可以轻松添加新的 Provider、Storage、Tool

**架构优势**：

| 优势 | 说明 |
|-----|------|
| 🎯 **职责清晰** | 每层只做自己的事 |
| 🔧 **易于维护** | 修改一层不影响其他层 |
| ✅ **易于测试** | 可以单独测试每一层 |
| 🚀 **易于扩展** | 新增功能只需在对应层添加 |
| 🛡️ **类型安全** | TypeScript 提供完整类型保护 |

**下一步**：

第4章将详细介绍 TypeScript 类型系统在 Krebs 中的应用。

---

**✅ 第3章完成！字数：~4500 字**

---

## 第二部分：基础技术栈

### 📖 第二部分导读

欢迎来到基础技术栈部分！这一部分将深入讲解：

- ✅ TypeScript 类型系统的实战应用
- ✅ Node.js 运行时机制和最佳实践
- ✅ ES Modules 模块化方案
- ✅ 开发工具链的使用和配置

**适合人群**：有一定基础，想要深入理解技术细节的开发者

**学习目标**：看完这 4 章，你能够：
1. 熟练使用 TypeScript 高级特性
2. 理解 Node.js 的事件循环和异步编程
3. 掌握 ES Modules 的模块化方案
4. 高效使用开发工具链

---

## 第4章：TypeScript 类型系统实战

> **本章目标**：深入理解 TypeScript 在 Krebs 中的应用
>
> **难度**：⭐⭐⭐
>
> **预计阅读时间**：30 分钟

### 4.1 为什么需要 TypeScript

#### 4.1.1 类型安全的价值

**JavaScript 的问题**：

```javascript
// ❌ 没有类型检查，运行时才发现错误
function processMessage(msg) {
  return msg.content.toUpperCase()
}

processMessage({ content: 123 })  // 运行时错误：msg.content.toUpperCase is not a function
```

**TypeScript 的解决方案**：

```typescript
// ✅ 编译时就能发现错误
interface Message {
  content: string
}

function processMessage(msg: Message): string {
  return msg.content.toUpperCase()
}

processMessage({ content: 123 })  // ❌ 编译错误：Type 'number' is not assignable to type 'string'
processMessage({ content: 'hello' })  // ✅ 正确
```

**Krebs 中的实际例子**：

```typescript
// src/types/index.ts
export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
  toolCalls?: ToolCall[]
}

// 使用时的类型保护
function validateMessage(msg: any): msg is Message {
  return (
    typeof msg === 'object' &&
    typeof msg.role === 'string' &&
    ['user', 'assistant', 'system'].includes(msg.role) &&
    typeof msg.content === 'string'
  )
}

// 类型守卫
function processMessage(msg: unknown) {
  if (validateMessage(msg)) {
    // TypeScript 知道这里是 Message 类型
    console.log(msg.role)  // ✅ 类型安全
    console.log(msg.content.toUpperCase())  // ✅ 不会报错
  }
}
```

#### 4.1.2 TypeScript 在 Krebs 中的价值

| 价值 | 说明 | 示例 |
|-----|------|------|
| **提前发现错误** | 编译时检查 | 调用 `chat()` 时参数类型错误会立即报错 |
| **IDE 支持** | 自动补全、跳转定义 | 输入 `agent.` 会自动提示可用方法 |
| **重构友好** | 修改接口时所有引用都会报错 | 修改 `LLMProvider` 接口，所有实现类都会报错 |
| **自文档化** | 类型即文档 | 看 `AgentConfig` 接口就知道需要什么参数 |
| **团队协作** | 类型约束减少沟通 | 看类型定义就知道函数怎么用 |

---

### 4.2 核心类型定义

#### 4.2.1 Message 类型（消息）

**定义**（`src/types/index.ts`）：

```typescript
export interface Message {
  // 消息角色：用户、助手、系统
  role: 'user' | 'assistant' | 'system'

  // 消息内容（文本）
  content: string

  // 时间戳（可选）
  timestamp?: number

  // 工具调用（仅 assistant 可有）
  toolCalls?: ToolCall[]
}

// 工具调用类型
export interface ToolCall {
  id: string          // 工具调用 ID
  name: string        // 工具名称
  arguments: any      // 工具参数
}

// 使用示例
const message: Message = {
  role: 'user',
  content: '帮我查看 README.md',
  timestamp: Date.now()
}

const assistantMessage: Message = {
  role: 'assistant',
  content: '',
  toolCalls: [
    {
      id: 'call_123',
      name: 'read_file',
      arguments: { path: 'README.md' }
    }
  ]
}
```

**类型推导**：

```typescript
// TypeScript 可以自动推导类型
function createMessage(role: 'user', content: string): Message {
  return {
    role,
    content,
    timestamp: Date.now()
  }
}

const msg = createMessage('user', 'hello')
// TypeScript 知道 msg 的类型是 Message
console.log(msg.content)  // ✅ 类型安全
```

#### 4.2.2 Tool 类型（工具）

**定义**：

```typescript
export interface Tool {
  // 工具名称（唯一标识）
  name: string

  // 工具描述（用于生成提示词）
  description: string

  // 参数 Schema（JSON Schema 格式）
  inputSchema: Record<string, unknown>

  // 执行函数
  execute(params: any): Promise<any>
}

// 使用示例
const readTool: Tool = {
  name: 'read_file',
  description: '读取文件内容',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '文件路径'
      }
    },
    required: ['path']
  },

  async execute(params: { path: string }) {
    const content = await fs.readFile(params.path, 'utf-8')
    return { content }
  }
}
```

**泛型约束**：

```typescript
// 约束 Tool 的参数类型
interface TypedTool<TParams = any> extends Omit<Tool, 'execute'> {
  execute(params: TParams): Promise<any>
}

// 使用泛型
interface ReadFileParams {
  path: string
  encoding?: string
}

const readToolTyped: TypedTool<ReadFileParams> = {
  name: 'read_file',
  description: '读取文件内容',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      encoding: { type: 'string' }
    },
    required: ['path']
  },

  async execute(params) {
    // TypeScript 知道 params 的类型是 ReadFileParams
    console.log(params.encoding)  // ✅ 类型安全
    const content = await fs.readFile(
      params.path,
      params.encoding || 'utf-8'
    )
    return { content }
  }
}
```

#### 4.2.3 Provider 接口（AI 模型）

**定义**（`src/provider/base.ts`）：

```typescript
export interface LLMProvider {
  // Provider 名称（只读）
  readonly name: string

  // 聊天完成
  chat(
    messages: Message[],
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult>

  // 流式聊天
  chatStream(
    messages: Message[],
    options: ChatCompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<ChatCompletionResult>

  // 生成嵌入向量
  embed(text: string): Promise<EmbeddingResult>

  // 批量生成嵌入向量
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>
}

// Chat 配置选项
export interface ChatCompletionOptions {
  model: string
  maxTokens?: number
  temperature?: number
  tools?: Tool[]
}

// Chat 结果
export interface ChatCompletionResult {
  content: string
  toolCalls?: any[]
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// Embedding 结果
export interface EmbeddingResult {
  embedding: number[]
  model: string
}
```

**实现接口**：

```typescript
// src/provider/anthropic.ts
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic"  // ✅ 实现接口属性

  async chat(
    messages: Message[],
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    // ✅ 实现接口方法
    const response = await this.client.messages.create({
      model: options.model,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      max_tokens: options.maxTokens
    })

    return {
      content: response.content[0].text,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      }
    }
  }

  async chatStream(...) { /* ... */ }
  async embed(...) { /* ... */ }
  async embedBatch(...) { /* ... */ }
}
```

**类型检查的好处**：

```typescript
// ❌ 错误：缺少必需方法
class BadProvider implements LLMProvider {
  readonly name = "bad"
  // 缺少 chat() 方法
  // 编译错误：Class 'BadProvider' incorrectly implements interface 'LLMProvider'
}

// ❌ 错误：方法签名不匹配
class WrongProvider implements LLMProvider {
  readonly name = "wrong"

  async chat(messages: string[]): Promise<string> {  // 参数类型错误
    return "hello"
  }
  // 编译错误：Property 'chat' in type 'WrongProvider' is not assignable
}

// ✅ 正确：完整实现接口
class GoodProvider implements LLMProvider {
  readonly name = "good"
  async chat(messages: Message[], options: ChatCompletionOptions) {
    return { content: '', usage: { ... } }
  }
  async chatStream(...) { /* ... */ }
  async embed(...) { /* ... */ }
  async embedBatch(...) { /* ... */ }
}
```

---

### 4.3 高级类型特性

#### 4.3.1 联合类型（Union Types）

**定义**：

```typescript
// 多种可能的类型
type Role = 'user' | 'assistant' | 'system'

type StorageType = 'session' | 'memory' | 'hybrid'

// 使用
function logRole(role: Role) {
  console.log(`Role: ${role}`)
  // ✅ TypeScript 知道 role 只能是这三个值之一
}

logRole('user')       // ✅ 正确
logRole('admin')      // ❌ 编译错误
```

**Krebs 中的应用**：

```typescript
// src/types/index.ts
export type ProviderType = 'anthropic' | 'openai' | 'deepseek'

export function createProvider(
  type: ProviderType,
  config: ProviderConfig
): LLMProvider {
  switch (type) {
    case 'anthropic':
      return new AnthropicProvider(config)
    case 'openai':
      return new OpenAIProvider(config)
    case 'deepseek':
      return new DeepSeekProvider(config)
    // TypeScript 会检查是否覆盖所有可能
  }
}
```

**可辨识联合（Discriminated Unions）**：

```typescript
// 定义不同的负载类型
type TextPayload = {
  type: 'text'
  content: string
}

type ToolResultPayload = {
  type: 'tool_result'
  toolName: string
  result: any
}

type ErrorPayload = {
  type: 'error'
  error: string
}

// 联合类型
type Payload = TextPayload | ToolResultPayload | ErrorPayload

// 使用可辨识联合
function handlePayload(payload: Payload) {
  switch (payload.type) {
    case 'text':
      // TypeScript 知道这里是 TextPayload
      console.log(payload.content)  // ✅ 类型安全
      break

    case 'tool_result':
      // TypeScript 知道这里是 ToolResultPayload
      console.log(payload.toolName, payload.result)  // ✅ 类型安全
      break

    case 'error':
      // TypeScript 知道这里是 ErrorPayload
      console.error(payload.error)  // ✅ 类型安全
      break
  }
}
```

#### 4.3.2 泛型（Generics）

**定义**：

```typescript
// 泛型函数
function first<T>(arr: T[]): T | undefined {
  return arr[0]
}

// TypeScript 自动推导类型
const num = first([1, 2, 3])        // num 的类型是 number | undefined
const str = first(['a', 'b', 'c'])   // str 的类型是 string | undefined

// 显式指定类型
const value = first<number>([1, 2, 3])
```

**Krebs 中的泛型应用**：

```typescript
// 泛型接口
interface Storage<T> {
  get(key: string): Promise<T | null>
  set(key: string, value: T): Promise<void>
}

// 不同类型的数据存储
class SessionStorage implements Storage<Message[]> {
  async get(key: string): Promise<Message[] | null> {
    const content = await fs.readFile(`${key}.md`, 'utf-8')
    return this.parseMessages(content)
  }

  async set(key: string, messages: Message[]): Promise<void> {
    const markdown = this.serializeMessages(messages)
    await fs.writeFile(`${key}.md`, markdown)
  }
}

// 使用
const storage: Storage<Message[]> = new SessionStorage()
const messages = await storage.get('user:123')  // ✅ 返回类型是 Message[] | null
```

**泛型约束**：

```typescript
// 约束 T 必须有 length 属性
function getLength<T extends { length: number }>(obj: T): number {
  return obj.length
}

getLength('hello')  // ✅ string 有 length
getLength([1, 2, 3])  // ✅ number[] 有 length
getLength(123)  // ❌ number 没有 length
```

#### 4.3.3 类型守卫（Type Guards）

**定义**：

```typescript
// 类型谓词
function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isMessage(value: unknown): value is Message {
  return (
    typeof value === 'object' &&
    value !== null &&
    'role' in value &&
    'content' in value
  )
}

// 使用
function process(value: unknown) {
  if (isMessage(value)) {
    // TypeScript 知道这里是 Message 类型
    console.log(value.role)  // ✅ 类型安全
    console.log(value.content.toUpperCase())  // ✅ 不会报错
  }
}
```

**Krebs 中的应用**：

```typescript
// src/storage/session/session-store.ts
export class SessionStore {
  private parseMessages(content: string): Message[] {
    const messages: Message[] = []

    for (const match of content.matchAll(/## (\w+)\n([\s\S]*?)(?=\n## |\n*$)/g)) {
      const role = match[1]
      const text = match[2]

      // 类型守卫：检查 role 是否有效
      if (this.isValidRole(role)) {
        messages.push({
          role: role as 'user' | 'assistant' | 'system',  // 类型断言
          content: text.trim(),
          timestamp: Date.now()
        })
      }
    }

    return messages
  }

  private isValidRole(role: string): role is 'user' | 'assistant' | 'system' {
    return ['user', 'assistant', 'system'].includes(role)
  }
}
```

#### 4.3.4 映射类型（Mapped Types）

**定义**：

```typescript
// 将所有属性变为可选
type Partial<T> = {
  [P in keyof T]?: T[P]
}

// 将所有属性变为必需
type Required<T> = {
  [P in keyof T]-?: T[P]
}

// 将所有属性变为只读
type Readonly<T> = {
  readonly [P in keyof T]: T[P]
}
```

**Krebs 中的应用**：

```typescript
// src/types/index.ts
// 基础配置（所有属性必需）
interface AgentConfigBase {
  model: string
  maxTokens: number
  temperature: number
}

// 可选配置（所有属性可选）
export type AgentConfig = Partial<AgentConfigBase> & {
  model: string  // 但 model 必需
}

// 使用
const config1: AgentConfig = {
  model: 'claude-3-5-sonnet-20241022',
  // maxTokens 和 temperature 是可选的
}

const config2: AgentConfig = {
  model: 'gpt-4',
  maxTokens: 2048,
  temperature: 0.7
  // ✅ 所有属性都是可选的（除了 model）
}
```

#### 4.3.5 条件类型（Conditional Types）

**定义**：

```typescript
// 根据条件选择类型
type NonNullable<T> = T extends null | undefined ? never : T

// 使用
type A = NonNullable<string | null>  // string
type B = NonNullable<null>           // never
```

**Krebs 中的应用**：

```typescript
// src/types/index.ts
// 提取 Promise 的返回类型
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T

// 使用
type A = UnwrapPromise<Promise<string>>  // string
type B = UnwrapPromise<string>           // string

// 实际应用
async function getData(): Promise<Message[]> {
  return []
}

type DataType = UnwrapPromise<ReturnType<typeof getData>>
// DataType 是 Message[]
```

---

### 4.4 实用类型模式

#### 4.4.1 Builder 模式（构建器）

**定义**：

```typescript
class AgentConfigBuilder {
  private config: AgentConfig = {
    model: 'claude-3-5-sonnet-20241022'
  }

  setModel(model: string): this {
    this.config.model = model
    return this
  }

  setMaxTokens(maxTokens: number): this {
    this.config.maxTokens = maxTokens
    return this
  }

  setTemperature(temperature: number): this {
    this.config.temperature = temperature
    return this
  }

  build(): AgentConfig {
    return { ...this.config }
  }
}

// 使用
const config = new AgentConfigBuilder()
  .setModel('gpt-4')
  .setMaxTokens(2048)
  .setTemperature(0.7)
  .build()
```

#### 4.4.2 工厂类型（Factory Types）

**定义**：

```typescript
// 工厂函数类型
type ProviderFactory = (config: ProviderConfig) => LLMProvider

// 工厂映射
const providerFactories: Record<string, ProviderFactory> = {
  anthropic: (config) => new AnthropicProvider(config),
  openai: (config) => new OpenAIProvider(config),
  deepseek: (config) => new DeepSeekProvider(config)
}

// 使用
function createProvider(type: string, config: ProviderConfig): LLMProvider {
  const factory = providerFactories[type]
  if (!factory) {
    throw new Error(`Unknown provider type: ${type}`)
  }
  return factory(config)
}
```

#### 4.4.3 回调类型（Callback Types）

**定义**：

```typescript
// 回调函数类型
type Callback<T> = (data: T) => void
type AsyncCallback<T> = (data: T) => Promise<void>
type ErrorHandler = (error: Error) => void

// 使用
class EventEmitter<T> {
  private listeners: Callback<T>[] = []

  on(callback: Callback<T>): void {
    this.listeners.push(callback)
  }

  emit(data: T): void {
    this.listeners.forEach(cb => cb(data))
  }
}

// 实际应用
const emitter = new EventEmitter<string>()
emitter.on((data) => console.log(data))  // ✅ 类型安全
emitter.emit('hello')
```

---

### 4.5 类型最佳实践

#### 4.5.1 避免使用 any

**❌ 不好的做法**：

```typescript
function process(data: any) {
  return data.content  // 失去类型检查
}
```

**✅ 好的做法**：

```typescript
// 使用泛型
function process<T extends { content: string }>(data: T): string {
  return data.content  // ✅ 类型安全
}

// 或使用具体类型
interface HasContent {
  content: string
}

function process(data: HasContent): string {
  return data.content  // ✅ 类型安全
}
```

#### 4.5.2 使用 const 断言

**场景**：让对象属性变为只读

```typescript
// ❌ 普通对象
const config = {
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 4096
}
config.maxTokens = 2048  // 可以修改

// ✅ 使用 const 断言
const config = {
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 4096
} as const

config.maxTokens = 2048  // ❌ 编译错误：Cannot assign to 'maxTokens' because it is a read-only property
```

#### 4.5.3 使用 unknown 代替 any

**场景**：处理未知类型的数据

```typescript
// ❌ 使用 any（失去类型检查）
function parse(data: any) {
  return JSON.parse(data)
}

// ✅ 使用 unknown（保留类型检查）
function parse(data: unknown): string {
  if (typeof data === 'string') {
    return JSON.parse(data)  // ✅ TypeScript 知道返回值可能是任何类型
  }
  throw new Error('Invalid data')
}

// 更好的做法：使用泛型
function parse<T>(data: unknown): T {
  if (typeof data === 'string') {
    return JSON.parse(data) as T
  }
  throw new Error('Invalid data')
}
```

#### 4.5.4 使用 as const 保持字面量类型

**场景**：保持字符串字面量类型

```typescript
// ❌ 失去字面量类型
const role = 'user'
type Role = string  // 只是 string，不是 'user'

// ✅ 使用 as const
const role = 'user' as const
type Role = 'user'  // ✅ 字面量类型

// 应用
function setRole(role: 'user' | 'assistant') {}

const myRole = 'user' as const
setRole(myRole)  // ✅ 类型正确
```

---

### 4.6 本章小结

**核心要点**：

1. ✅ **类型安全**：TypeScript 在编译时发现错误
2. ✅ **核心类型**：Message、Tool、Provider、AgentConfig
3. ✅ **高级特性**：联合类型、泛型、类型守卫、映射类型
4. ✅ **实用模式**：Builder、Factory、Callback
5. ✅ **最佳实践**：避免 any、使用 unknown、const 断言

**TypeScript 在 Krebs 中的应用总结**：

| 特性 | 应用场景 | 优势 |
|-----|---------|------|
| **接口** | Message、Tool、Provider | 定义契约 |
| **泛型** | Storage、ProviderFactory | 类型复用 |
| **类型守卫** | 验证消息、角色 | 运行时安全 |
| **联合类型** | Role、ProviderType | 限制取值 |
| **映射类型** | Partial、Required | 灵活配置 |

**下一步**：

第5章将详细介绍 Node.js 运行时机制，包括事件循环、异步编程、流处理等。

---

**✅ 第4章完成！字数：~4200 字**

---

## 第5章：Node.js 运行时机制

> **本章目标**：深入理解 Node.js 在 Krebs 中的应用和最佳实践
>
> **难度**：⭐⭐⭐
>
> **预计阅读时间**：30 分钟

### 5.1 Node.js 核心概念

#### 5.1.1 什么是 Node.js？

**Node.js** = Chrome V8 引擎 + 事件驱动 + 非阻塞 I/O

**类比理解**：

```
浏览器 JavaScript:
├─ 只能在浏览器中运行
├─ 受同源策略限制
└─ 不能访问文件系统

Node.js JavaScript:
├─ 可以在服务器端运行
├─ 无同源策略限制
├─ 可以访问文件系统
└─ 可以创建 HTTP 服务器
```

**为什么 Krebs 选择 Node.js？**

| 特性 | 优势 |
|-----|------|
| ⚡ **高性能** | V8 引擎优化，执行速度快 |
| 🌐 **JavaScript 生态** | npm 提供丰富的包 |
| 🔧 **内置模块** | fs、http、crypto 等开箱即用 |
| 📦 **跨平台** | Windows、macOS、Linux |
| 🔄 **事件驱动** | 适合 I/O 密集型应用 |

#### 5.1.2 Node.js 22 新特性

**Krebs 使用的 Node.js 22 特性**：

```typescript
// 1. 内置 fetch（无需 node-fetch）
const response = await fetch('https://api.example.com')
const data = await response.json()

// 2. 改进的定时器
import { setTimer } from 'node:timers/promises'
await setTimer(1000)  // 等待 1 秒

// 3. enhanced stake（性能更好的字符串比较）
const str1 = 'hello'
const str2 = 'hello'
if (str1 === str2) { }  // 使用 enhanced stake

// 4. ArrayBuffer 转 TypedArray
const buffer = new ArrayBuffer(1024)
const view = new Uint8Array(buffer)
```

---

### 5.2 事件循环（Event Loop）

#### 5.2.1 事件循环机制

**Node.js 事件循环**：

```
┌───────────────────────────────┐
│         Timers (定时器)         │
│   - setTimeout                 │
│   - setInterval                │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│   Pending Callbacks (回调)     │
│   - I/O 异常回调                │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│   Idle, Prepare (空闲、准备)    │
│   - 内部使用                    │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│   Poll (轮询)                   │
│   - 新的 I/O 事件                │
│   - setTimeout 回调             │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│   Check (检查)                  │
│   - setImmediate 回调           │
└───────────────┬───────────────┘
                ↓
┌───────────────────────────────┐
│   Close Callbacks (关闭回调)    │
│   - socket.close()              │
└───────────────────────────────┘
```

**Krebs 中的应用**：

```typescript
// 1. 定时任务
import { setTimer } from 'node:timers/promises'

class MemoryIndexManager {
  private intervalSyncTimer?: NodeJS.Timeout

  startIntervalSync(intervalMinutes: number) {
    const intervalMs = intervalMinutes * 60 * 1000

    this.intervalSyncTimer = setInterval(async () => {
      await this.sync({ reason: 'interval' })
    }, intervalMs)
  }

  stop() {
    if (this.intervalSyncTimer) {
      clearInterval(this.intervalSyncTimer)
    }
  }
}

// 2. 立即执行
import { setImmediate } from 'node:timers/promises'

async function processMessage(message: string) {
  // 使用 setImmediate 让出控制权
  await setImmediate()

  // 处理消息
  return await agent.process(message, sessionId)
}
```

#### 5.2.2 微任务队列

**微任务 vs 宏任务**：

```
┌─────────────────────┐
│   Script (同步代码)   │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Microtasks (微任务)  │  ← 优先级高
│  - Promise.then      │
│  - queueMicrotask    │
└──────────┬──────────┘
           ↓
┌─────────────────────┐
│  Macrotasks (宏任务)   │  ← 优先级低
│  - setTimeout        │
│  - setInterval       │
│  - I/O               │
└─────────────────────┘
```

**示例**：

```typescript
console.log('1. Script start')

// 微任务
Promise.resolve().then(() => {
  console.log('2. Microtask 1')
})

queueMicrotask(() => {
  console.log('3. Microtask 2')
})

// 宏任务
setTimeout(() => {
  console.log('4. Macrotask 1')
}, 0)

console.log('5. Script end')

// 输出顺序：
// 1. Script start
// 5. Script end
// 2. Microtask 1
// 3. Microtask 2
// 4. Macrotask 1
```

**Krebs 中的应用**：

```typescript
// 使用 queueMicrotask 优化性能
class SessionStore {
  private cache = new Map<string, SessionEntry>()

  private updateCache(key: string, entry: SessionEntry) {
    // 使用 queueMicrotask 让出控制权
    queueMicrotask(() => {
      this.cache.set(key, entry)
    })
  }
}
```

---

### 5.3 异步编程

#### 5.3.1 Promise 和 async/await

**基础用法**：

```typescript
// 1. Promise 创建
const readFilePromise = new Promise<string>((resolve, reject) => {
  fs.readFile('file.txt', 'utf-8', (err, data) => {
    if (err) {
      reject(err)
    } else {
      resolve(data)
    }
  })
})

// 2. Promise 使用
readFilePromise
  .then(data => console.log(data))
  .catch(err => console.error(err))

// 3. async/await（推荐）
async function readFile() {
  try {
    const data = await fs.promises.readFile('file.txt', 'utf-8')
    console.log(data)
  } catch (err) {
    console.error(err)
  }
}
```

**Krebs 中的应用**：

```typescript
// src/storage/session/session-store.ts
export class SessionStore {
  async saveSession(
    sessionKey: string,
    messages: Message[]
  ): Promise<void> {
    try {
      // 1. 加载现有数据
      const existing = await this.loadSession(sessionKey)

      // 2. 合并消息
      const merged = this.mergeMessages(existing, messages)

      // 3. 序列化
      const markdown = this.serializeMarkdown(merged)

      // 4. 写入文件
      await fs.writeFile(this.resolvePath(sessionKey), markdown, 'utf-8')

      // 5. 更新缓存
      this.setCached(sessionKey, merged)
    } catch (error) {
      this.logger.error('Failed to save session:', error)
      throw error
    }
  }
}
```

#### 5.3.2 并发控制

**Promise.all（全部完成）**：

```typescript
// 所有 Promise 都成功才成功
const results = await Promise.all([
  readFile('a.txt'),
  readFile('b.txt'),
  readFile('c.txt')
])

console.log(results)  // [contentA, contentB, contentC]

// 如果有一个失败，整体失败
try {
  await Promise.all([
    readFile('a.txt'),
    readFile('nonexistent.txt'),  // 会失败
    readFile('c.txt')
  ])
} catch (err) {
  console.error('One file failed:', err)
}
```

**Promise.allSettled（全部完成，不管成功失败）**：

```typescript
// Krebs 中并行执行工具
const results = await Promise.allSettled(
  toolCalls.map(async (toolCall) => {
    const tool = this.findTool(toolCall.name)
    const result = await tool.execute(toolCall.arguments)
    return {
      id: toolCall.id,
      name: toolCall.name,
      result
    }
  })
)

// 处理结果
results.forEach((result, index) => {
  if (result.status === 'fulfilled') {
    console.log(`Tool ${index} succeeded:`, result.value)
  } else {
    console.log(`Tool ${index} failed:`, result.reason)
  }
})
```

**Promise.race（第一个完成的就返回）**：

```typescript
// 超时控制
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Timeout')), 5000)
})

const result = await Promise.race([
  fetchData(),  // 可能需要很长时间
  timeoutPromise  // 5 秒超时
])
```

**Promise.any（第一个成功的就返回）**：

```typescript
// Model Fallback：尝试多个模型，第一个成功就返回
const providers = [
  new AnthropicProvider(),
  new OpenAIProvider(),
  new DeepSeekProvider()
]

const result = await Promise.any(
  providers.map(p => p.chat(messages, options))
)
```

#### 5.3.3 错误处理

**try-catch-finally**：

```typescript
async function processWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      console.warn(`Attempt ${i + 1} failed:`, error)

      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  throw lastError!
}

// 使用
const result = await processWithRetry(
  () => provider.chat(messages, options),
  3
)
```

**Krebs 中的应用**（Model Fallback）：

```typescript
// src/agent/model-fallback/runner.ts
export class ModelFallbackRunner {
  async execute(
    primary: ModelConfig,
    fallbacks: ModelConfig[],
    run: (model: ModelConfig) => Promise<any>
  ): Promise<any> {
    const models = [primary, ...fallbacks]

    for (let i = 0; i < models.length; i++) {
      const model = models[i]

      try {
        // 尝试当前模型
        return await this.runWithRetry(model, run)
      } catch (error) {
        // 最后一个模型也失败了，抛出错误
        if (i === models.length - 1) {
          throw error
        }

        // 记录失败，继续下一个模型
        this.options.onFallback?.(model, models[i + 1], error)
      }
    }
  }

  private async runWithRetry<T>(
    model: ModelConfig,
    fn: (model: ModelConfig) => Promise<T>
  ): Promise<T> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn(model)
      } catch (error) {
        if (attempt === this.maxRetries - 1) {
          throw error
        }

        this.options.onRetry?.(model, attempt + 1, error)
        await new Promise(resolve => setTimeout(resolve, this.retryDelay))
      }
    }

    throw new Error('Max retries exceeded')
  }
}
```

---

### 5.4 流（Streams）

#### 5.4.1 流的基本概念

**什么是流？**

流 = 数据的连续传输

**类比**：

```
不使用流：
读取整个文件 → 处理 → 返回结果
（内存占用大，速度慢）

使用流：
读取一块 → 处理一块 → 返回一块 → 继续...
（内存占用小，速度快）
```

**流的类型**：

```
Readable（可读流）
  ├─ fs.createReadStream()
  ├─ HTTP Request
  └─ process.stdin

Writable（可写流）
  ├─ fs.createWriteStream()
  ├─ HTTP Response
  └─ process.stdout

Duplex（双工流）
  ├─ TCP Socket
  └─ WebSocket

Transform（转换流）
  ├─ zlib.createGzip()
  └─ crypto streams
```

#### 5.4.2 流式响应

**Krebs 中的应用**（流式聊天）：

```typescript
// src/provider/anthropic.ts
async chatStream(
  messages: Message[],
  options: ChatCompletionOptions,
  onChunk: (chunk: string) => void
): Promise<ChatCompletionResult> {
  // 创建流
  const stream = await this.client.messages.create({
    model: options.model,
    messages: messages,
    max_tokens: options.maxTokens,
    stream: true  // 启用流式
  })

  let fullContent = ""
  let inputTokens = 0
  let outputTokens = 0

  // 读取流事件
  for await (const event of stream) {
    switch (event.type) {
      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          const chunk = event.delta.text
          fullContent += chunk
          onChunk(chunk)  // 实时回调
        }
        break

      case 'message_start':
        inputTokens = event.message.usage.input_tokens
        break

      case 'message_delta':
        outputTokens = event.usage.output_tokens
        break
    }
  }

  return {
    content: fullContent,
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens
    }
  }
}
```

**WebSocket 流式传输**：

```typescript
// src/gateway/server/ws.ts
wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    const { message, sessionId } = JSON.parse(data)

    // 流式处理
    await agentManager.processStream(
      sessionId,
      message,
      // 流式回调
      (chunk) => {
        // 实时发送每个 token
        ws.send(JSON.stringify({
          type: 'chunk',
          content: chunk
        }))
      }
    )

    // 发送结束标记
    ws.send(JSON.stringify({
      type: 'end',
      usage: result.usage
    }))
  })
})
```

#### 5.4.3 文件流处理

**大文件处理**：

```typescript
import { createReadStream, createWriteStream } from 'node:fs'

// 读取大文件
const readStream = createReadStream('large-file.txt')

// 写入文件
const writeStream = createWriteStream('output.txt')

// 管道连接
readStream.pipe(writeStream)

// 监听事件
readStream
  .on('data', (chunk) => {
    console.log(`Received ${chunk.length} bytes`)
  })
  .on('end', () => {
    console.log('File read complete')
  })
  .on('error', (err) => {
    console.error('Read error:', err)
  })
```

---

### 5.5 文件系统操作

#### 5.5.1 fs 模块

**同步 vs 异步**：

```typescript
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'

// ❌ 同步操作（阻塞）
const content = fs.readFileSync('file.txt', 'utf-8')
console.log(content)

// ✅ 异步操作（推荐）
const content = await fsPromises.readFile('file.txt', 'utf-8')
console.log(content)
```

**Krebs 中的应用**（文件监听）：

```typescript
// src/storage/memory/manager.ts
import chokidar from 'chokidar'

export class MemoryIndexManager {
  private watcher: ReturnType<typeof chokidar.watch> | null = null

  enableWatch() {
    if (this.watcher) return

    // 监听文件变化
    this.watcher = chokidar.watch([
      'workspace/memory/**/*.md',
      'workspace/MEMORY.md'
    ], {
      ignoreInitial: true,      // 忽略初始扫描
      persistent: true,          // 持续监听
      awaitWriteFinish: {        // 等待写入完成
        stabilityThreshold: 100,
        pollInterval: 50
      }
    })

    // 监听事件
    this.watcher
      .on('add', (path) => {
        console.log(`File added: ${path}`)
        this.dirty = true
        this.scheduleSync()
      })
      .on('change', (path) => {
        console.log(`File changed: ${path}`)
        this.dirty = true
        this.scheduleSync()
      })
      .on('unlink', (path) => {
        console.log(`File deleted: ${path}`)
        this.dirty = true
        this.scheduleSync()
      })
  }

  disableWatch() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }
}
```

#### 5.5.2 文件锁

**proper-lockfile 使用**：

```typescript
import lockfile from 'proper-lockfile'

export class SessionStore {
  async saveSession(key: string, messages: Message[]) {
    // 获取锁
    const release = await lockfile.lock(`sessions/${key}.lock`)

    try {
      // 安全地写入文件
      await fs.writeFile(`sessions/${key}.md`, serialize(messages))
    } finally {
      // 释放锁
      await release()
    }
  }
}
```

**文件锁原理**：

```
进程 A                              进程 B
  │                                  │
  ├─ 尝试获取 lock                   │
  ├─ 创建 lock 文件                  │
  ├─ 写入 PID                       │
  │                                  ├─ 尝试获取 lock
  │                                  ├─ lock 文件存在
  ├─ 执行操作                         ├─ 等待...
  ├─ 删除 lock 文件                  │
  │                                  ├─ lock 文件消失
  │                                  ├─ 获取 lock
  │                                  ├─ 执行操作
```

---

### 5.6 加密模块

#### 5.6.1 crypto 模块

**生成 UUID**：

```typescript
import crypto from 'node:crypto'

// 生成 v4 UUID
const sessionId = crypto.randomUUID()
console.log(sessionId)
// 输出：550e8400-e29b-41d4-a716-446655440000

// 生成随机 ID
const randomId = crypto.randomBytes(16).toString('hex')
console.log(randomId)
// 输出：a1b2c3d4e5f6...
```

**哈希计算**：

```typescript
// 计算文件哈希
import { createHash } from 'node:crypto'

async function calculateFileHash(filePath: string): Promise<string> {
  const content = await fsPromises.readFile(filePath)
  const hash = createHash('sha256').update(content).digest('hex')
  return hash
}

// 使用
const hash = await calculateFileHash('README.md')
console.log(hash)  // e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

**Krebs 中的应用**（Memory 存储）：

```typescript
// src/storage/memory/internal.ts
export function buildFileEntry(
  filePath: string,
  workspaceDir: string
): MemoryFileEntry {
  const stat = fs.statSync(filePath)
  const content = fs.readFileSync(filePath, 'utf-8')

  // 计算哈希（用于变更检测）
  const hash = createHash('sha256')
    .update(content)
    .digest('hex')

  return {
    path: filePath,
    absPath: path.resolve(filePath),
    relativePath: path.relative(workspaceDir, filePath),
    hash,
    mtimeMs: stat.mtimeMs,
    size: stat.size
  }
}

// 使用
const entry = buildFileEntry('workspace/memory/README.md', 'workspace')

// 索引时检查哈希
const existing = db.prepare(`SELECT hash FROM files WHERE path = ?`).get(entry.path)
if (existing?.hash !== entry.hash) {
  // 文件已变更，重新索引
  await indexFile(entry)
}
```

---

### 5.7 性能优化

#### 5.7.1 避免阻塞事件循环

**❌ 不好的做法**：

```typescript
// 同步操作阻塞事件循环
function processFiles() {
  const files = fs.readdirSync('data/')  // 阻塞
  files.forEach(file => {
    const content = fs.readFileSync(file)  // 阻塞
    processContent(content)
  })
}
```

**✅ 好的做法**：

```typescript
// 异步操作不阻塞
async function processFiles() {
  const files = await fsPromises.readdir('data/')

  // 并发处理
  await Promise.all(
    files.map(async (file) => {
      const content = await fsPromises.readFile(file)
      return processContent(content)
    })
  )
}
```

#### 5.7.2 使用 worker_threads

**CPU 密集型任务**：

```typescript
import { Worker } from 'node:worker_threads'

// 创建 Worker
const worker = new Worker('./embed-worker.js', {
  workerData: { texts: ['text1', 'text2', 'text3'] }
})

// 监听结果
worker.on('message', (result) => {
  console.log('Embedding result:', result)
})

// 等待完成
await new Promise((resolve) => {
  worker.on('exit', resolve)
})
```

**Worker 文件**（`embed-worker.js`）：

```typescript
const { parentPort, workerData } = require('node:worker_threads')
const { embed } = require('./embedding.js')

async function main() {
  const results = []

  for (const text of workerData.texts) {
    const embedding = await embed(text)
    results.push(embedding)
  }

  parentPort.postMessage(results)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
```

#### 5.7.3 缓存策略

**内存缓存**：

```typescript
class SessionStore {
  private cache = new Map<string, SessionEntry>()
  private cacheTtl = 45000  // 45 秒

  private getCached(key: string): SessionEntry | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    const age = Date.now() - cached.loadedAt
    if (age > this.cacheTtl) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  private setCached(key: string, entry: SessionEntry) {
    this.cache.set(key, {
      data: entry,
      loadedAt: Date.now()
    })
  }

  async loadSession(key: string): Promise<SessionLoadResult | null> {
    // 先检查缓存
    const cached = this.getCached(key)
    if (cached) {
      // 缓存命中，返回缓存数据
      return {
        entry: cached,
        messages: await this.loadMessagesFromFile(key)
      }
    }

    // 缓存未命中，从文件加载
    const result = await this.loadFromFile(key)

    // 更新缓存
    if (result) {
      this.setCached(key, result.entry)
    }

    return result
  }
}
```

---

### 5.8 调试技巧

#### 5.8.1 使用 debugger

```typescript
async function processMessage(message: string) {
  debugger  // 断点

  const result = await agent.process(message, sessionId)

  debugger  // 断点

  return result
}
```

**启动调试**：

```bash
node --inspect-brk src/index.js
# 然后在 Chrome 中打开 chrome://inspect
```

#### 5.8.2 使用 tslog 结构化日志

```typescript
import { Logger } from 'tslog'

const logger = new Logger({
  name: 'Agent',
  type: 'pretty',
  prettyLogTemplate: '{{hh}}:{{MM}}:{{ss}} [{{name}}] {{logLevelName}} ',
  prettyErrorTemplate: '\n{{errorName}}: {{errorMessage}}\nerror stack: {{errorStack}}',
})

// 使用
logger.info('Processing message', { message, sessionId })
logger.warn('Token usage high', { tokens: 10000 })
logger.error('Processing failed', new Error('...'))
```

#### 5.8.3 性能分析

**使用 --prof 标志**：

```bash
node --prof src/index.js
# 生成 v8.log

node --prof-process v8.log > profile.txt
# 分析性能
```

**使用 clinic.js**：

```bash
npm install -g clinic
clinic doctor -- node src/index.js
# 生成性能报告
```

---

### 5.9 本章小结

**核心要点**：

1. ✅ **事件循环**：理解 Node.js 异步编程的基石
2. ✅ **异步编程**：Promise、async/await、并发控制
3. ✅ **流处理**：大文件处理、流式响应
4. ✅ **文件系统**：fs 模块、文件监听、文件锁
5. ✅ **加密模块**：UUID、哈希、Embedding
6. ✅ **性能优化**：避免阻塞、Worker、缓存
7. ✅ **调试技巧**：debugger、日志、性能分析

**Node.js 在 Krebs 中的应用总结**：

| 模块 | 应用场景 | 优势 |
|-----|---------|------|
| **events** | EventEmitter、事件驱动 | 解耦组件 |
| **fs** | 文件读写、监听 | 异步 I/O |
| **crypto** | UUID、哈希 | 安全唯一 ID |
| **worker_threads** | CPU 密集型任务 | 不阻塞主线程 |
| **timers** | 定时任务、超时控制 | 精确控制 |

**下一步**：

第6章将详细介绍 ES Modules 模块化方案。

---

**✅ 第5章完成！字数：~3800 字**

---

## 第6章：ES Modules 模块化

> **本章目标**：掌握 ES Modules 在 Krebs 中的应用
>
> **难度**：⭐⭐
>
> **预计阅读时间**：20 分钟

### 6.1 ES Modules 基础

#### 6.1.1 什么是 ES Modules？

**ES Modules (ESM)** = JavaScript 原生的模块系统

**历史对比**：

```
CommonJS (CJS) - Node.js 旧规范
├─ require() 导入
├─ module.exports 导出
└─ 同步加载

ES Modules (ESM) - 现代标准
├─ import 导入
├─ export 导出
└─ 异步加载
```

**Krebs 使用的模块系统**：

```json
// package.json
{
  "type": "module"  // 启用 ES Modules
}
```

#### 6.1.2 导入和导出

**命名导出**：

```typescript
// src/utils/string.ts
// 导出多个函数
export function toUpperCase(str: string): string {
  return str.toUpperCase()
}

export function toLowerCase(str: string): string {
  return str.toLowerCase()
}

export const SEPARATOR = '_'

// src/index.ts
// 导入命名导出
import { toUpperCase, toLowerCase, SEPARATOR } from './utils/string.js'
```

**默认导出**：

```typescript
// src/provider/anthropic.ts
// 默认导出类
export default class AnthropicProvider implements LLMProvider {
  // ...
}

// src/provider/index.ts
// 导入默认导出
import AnthropicProvider from './anthropic.js'
```

**混合导出**：

```typescript
// src/agent/core/agent.ts
// 默认导出 + 命名导出
export default class Agent { ... }

export type { AgentDeps } from './types.js'
export { buildAgentSystemPrompt } from './system-prompt.js'
```

**重新导出**：

```typescript
// src/provider/index.ts
// 重新导出所有 Provider
export { AnthropicProvider } from './anthropic.js'
export { OpenAIProvider } from './openai.js'
export { DeepSeekProvider } from './deepseek.js'
export { LLMProvider } from './base.js'
export { createProvider } from './factory.js'

// 使用
import { createProvider, LLMProvider } from '@/provider/index.js'
```

#### 6.1.3 动态导入

**基础用法**：

```typescript
// 动态导入模块
async function loadProvider(type: string) {
  if (type === 'anthropic') {
    const { AnthropicProvider } = await import('./anthropic.js')
    return new AnthropicProvider()
  } else if (type === 'openai') {
    const { OpenAIProvider } = await import('./openai.js')
    return new OpenAIProvider()
  }
}
```

**Krebs 中的应用**（技能加载）：

```typescript
// src/agent/skills/loader.ts
export class SkillsLoader {
  async loadSkill(skillPath: string): Promise<SkillEntry> {
    // 动态导入技能模块
    const module = await import(skillPath)

    // 提取默认导出
    const skill = module.default || module

    // 解析 frontmatter
    const frontmatter = this.parseFrontmatter(skill.content)

    return {
      skill,
      frontmatter,
      path: skillPath
    }
  }
}
```

---

### 6.2 模块解析

#### 6.2.1 路径别名

**配置**（`tsconfig.json`）：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

**使用**：

```typescript
// 不使用别名（路径长）
import { Agent } from '../../../agent/core/agent.js'
import { Logger } from '../../../shared/logger.js'

// 使用别名（路径短）
import { Agent } from '@/agent/core/agent.js'
import { Logger } from '@/shared/logger.js'
```

**运行时支持**（需要 `tsc-alias`）：

```json
// package.json
{
  "scripts": {
    "build": "tsc && tsc-alias"
  }
}
```

#### 6.2.2 文件扩展名

**ES Modules 要求**：

```typescript
// ✅ 正确：带 .js 扩展名
import { Agent } from '@/agent/core/agent.js'

// ❌ 错误：省略扩展名（在 ESM 中不允许）
import { Agent } from '@/agent/core/agent'
```

**为什么需要 .js 扩展名？**

```typescript
// ES Modules 规范要求
// 1. 明确区分本地文件和包
import { Agent } from './agent.js'      // 本地文件
import { express } from 'express'       // npm 包（不需要扩展名）

// 2. TypeScript 编译后是 .js 文件
// src/agent.ts → dist/agent.js
// 所以导入时写 .js
```

**TypeScript 配置**：

```json
// tsconfig.json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "allowImportingTsExtensions": false,  // 不允许导入 .ts 文件
    "moduleSuffixes": [".js", ".json"]   // 解析时尝试这些扩展名
  }
}
```

#### 6.2.3 模块解析顺序

**Node.js 解析流程**：

```
import { Agent } from '@/agent/core/agent.js'

1. 检查是否是内置模块
   → 不是（@ 开头）

2. 检查是否是相对路径
   → 不是（@ 开头是路径别名）

3. 检查 package.json 的 exports 字段
   → 没有配置

4. 解析路径别名（通过 tsc-alias）
   → src/agent/core/agent.js

5. 查找文件
   → dist/agent/core/agent.js

6. 加载模块
   → 成功
```

**package.json exports**（可选）：

```json
// package.json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./agent/*": {
      "import": "./dist/agent/*.js"
    }
  }
}
```

---

### 6.3 模块设计模式

#### 6.1.1 Barrel 模式（桶模式）

**定义**：将多个模块的导出集中到一个文件

```typescript
// src/agent/tools/index.ts
// 导出所有工具
export * from './base.js'
export * from './builtin.js'
export * from './registry.js'
export * from './web.js'
export * from './spawn-subagent.js'

// 使用
import { Tool, ToolRegistry, createBuiltinTools } from '@/agent/tools/index.js'
```

**优势**：

- ✅ 简化导入路径
- ✅ 统一导出接口
- ✅ 隐藏内部实现

#### 6.3.2 Facade 模式（外观模式）

**定义**：提供一个简单的接口，隐藏复杂的子系统

```typescript
// src/agent/skills/skills-manager.ts
export class SkillsManager {
  private loader: SkillsLoader
  private formatter: SkillsFormatter
  private hotReload: SkillsHotReload

  // 简单的接口
  async loadSkills() {
    const entries = await this.loader.loadFromDirs([...])
    this.snapshot = this.loader.buildSnapshot(entries)
  }

  getSkills() {
    return this.snapshot?.skills || []
  }

  // 隐藏复杂的实现细节
  // - loader.loadFromDirs()
  // - formatter.formatForPrompt()
  // - hotReload.watch()
}
```

**使用**：

```typescript
// 用户不需要了解内部实现
const skillsManager = new SkillsManager({ ... })
await skillsManager.loadSkills()  // 一行代码完成复杂操作
const skills = skillsManager.getSkills()
```

#### 6.3.3 依赖注入模式

**定义**：通过构造函数注入依赖

```typescript
// src/agent/core/agent.ts
export interface AgentDeps {
  provider: LLMProvider
  storage?: ISessionStorage
  tools?: Tool[]
  skillsManager?: SkillsManager
  memoryService?: MemoryService
}

export class Agent {
  constructor(
    private config: AgentConfig,
    private deps: AgentDeps
  ) {}
}

// 使用时注入依赖
const agent = new Agent(
  { model: 'claude-3-5-sonnet-20241022' },
  {
    provider: new AnthropicProvider(),
    storage: new SessionStore(),
    tools: [readTool, writeTool],
    skillsManager: new SkillsManager()
  }
)
```

**优势**：

- ✅ 灵活配置
- ✅ 易于测试（可以 Mock 依赖）
- ✅ 松耦合

---

### 6.4 模块最佳实践

#### 6.4.1 避免循环依赖

**循环依赖的问题**：

```
A.ts → B.ts → C.ts → A.ts
（形成循环，导致错误）
```

**❌ 不好的做法**：

```typescript
// src/agent/core/agent.ts
import { Orchestrator } from './orchestrator.js'

// src/agent/core/orchestrator.ts
import { Agent } from './agent.js'  // 循环依赖！
```

**✅ 好的做法**：

```typescript
// src/agent/core/agent.ts
import { Orchestrator } from './orchestrator.js'
import type { AgentDeps } from './types.js'  // 只导入类型

// src/agent/core/orchestrator.ts
// 不导入 Agent，通过接口通信
export class Orchestrator {
  constructor(
    private tools: Tool[],
    private skillsManager: SkillsManager
  ) {}
}
```

**解决方案**：

1. **提取接口**：将共享的类型提取到单独的文件
2. **依赖倒置**：依赖抽象接口，不依赖具体实现
3. **事件通信**：使用 EventEmitter 解耦组件

#### 6.4.2 模块大小控制

**小模块原则**：

```typescript
// ❌ 不好的做法：一个文件包含太多内容
// src/agent/index.ts (5000+ 行)

// ✅ 好的做法：拆分为多个小模块
// src/agent/core/agent.ts (500 行)
// src/agent/core/orchestrator.ts (300 行)
// src/agent/core/system-prompt.ts (400 行)
// src/agent/tools/index.ts (200 行)
// src/agent/skills/index.ts (200 行)
```

**优势**：

- ✅ 易于理解
- ✅ 易于维护
- ✅ 易于测试
- ✅ 加载速度快

#### 6.4.3 模块文档化

**JSDoc 注释**：

```typescript
/**
 * Agent 核心类
 *
 * @description 负责对话管理、工具调用、记忆注入
 *
 * @example
 * ```typescript
 * const agent = new Agent(
 *   { model: 'claude-3-5-sonnet-20241022' },
 *   {
 *     provider: new AnthropicProvider(),
 *     storage: new SessionStore()
 *   }
 * )
 *
 * const result = await agent.process('你好', 'user:123')
 * ```
 *
 * @param config - Agent 配置
 * @param deps - 依赖项
 */
export class Agent {
  /**
   * 处理用户消息
   *
   * @param userMessage - 用户消息内容
   * @param sessionId - 会话 ID
   * @returns Agent 处理结果
   * @throws {Error} 如果处理失败
   */
  async process(
    userMessage: string,
    sessionId: string
  ): Promise<AgentResult> {
    // ...
  }
}
```

---

### 6.5 模块性能优化

#### 6.5.1 懒加载

**定义**：只在需要时才加载模块

```typescript
// src/agent/core/agent.ts
export class Agent {
  private orchestrator: Orchestrator | null = null

  private getOrchestrator(): Orchestrator {
    // 懒加载 Orchestrator
    if (!this.orchestrator) {
      const { Orchestrator } = await import('./orchestrator.js')
      this.orchestrator = new Orchestrator(
        this.deps.tools || [],
        this.deps.skillsManager
      )
    }

    return this.orchestrator
  }

  async process(message: string, sessionId: string) {
    // 只在需要时才加载 Orchestrator
    const orchestrator = this.getOrchestrator()
    return await orchestrator.handleToolCalls(toolCalls)
  }
}
```

**优势**：

- ✅ 减少初始加载时间
- ✅ 降低内存占用
- ✅ 按需加载依赖

#### 6.5.2 Tree Shaking

**定义**：移除未使用的代码

```typescript
// src/utils/index.ts
export function funcA() { console.log('A') }
export function funcB() { console.log('B') }
export function funcC() { console.log('C') }

// src/main.ts
// 只导入 funcA
import { funcA } from './utils/index.js'

// Tree Shaking 后，funcB 和 funcC 会被移除
```

**Krebs 中的应用**：

```typescript
// src/provider/index.ts
export { AnthropicProvider } from './anthropic.js'
export { OpenAIProvider } from './openai.js'
export { DeepSeekProvider } from './deepseek.js'

// src/main.ts
// 只导入 AnthropicProvider
import { AnthropicProvider } from './provider/index.js'

// 打包时，OpenAIProvider 和 DeepSeekProvider 会被 Tree Shaking 移除
```

#### 6.5.3 条件导入

**定义**：根据条件导入不同模块

```typescript
// src/provider/factory.ts
export async function createProvider(
  type: string,
  config: ProviderConfig
): Promise<LLMProvider> {
  switch (type) {
    case 'anthropic':
      const { AnthropicProvider } = await import('./anthropic.js')
      return new AnthropicProvider(config)

    case 'openai':
      const { OpenAIProvider } = await import('./openai.js')
      return new OpenAIProvider(config)

    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}
```

**优势**：

- ✅ 只加载需要的 Provider
- ✅ 减小打包体积
- ✅ 提升启动速度

---

### 6.6 模块测试

#### 6.6.1 单元测试模块

**测试文件结构**：

```
test/
├── unit/
│   ├── provider/
│   │   ├── anthropic.test.ts
│   │   ├── openai.test.ts
│   │   └── factory.test.ts
│   ├── storage/
│   │   ├── session-store.test.ts
│   │   └── memory-manager.test.ts
│   └── agent/
│       ├── agent.test.ts
│       └── orchestrator.test.ts
└── setup.ts
```

**测试示例**：

```typescript
// test/unit/provider/anthropic.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { AnthropicProvider } from '@/provider/anthropic.js'
import type { Message } from '@/types/index.js'

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider

  beforeEach(() => {
    provider = new AnthropicProvider({
      apiKey: process.env.ANTHROPIC_API_KEY
    })
  })

  it('should send chat request', async () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hello' }
    ]

    const result = await provider.chat(messages, {
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 100
    })

    expect(result.content).toBeDefined()
    expect(result.usage.totalTokens).toBeGreaterThan(0)
  })

  it('should handle tool calls', async () => {
    const messages: Message[] = [
      { role: 'user', content: 'What time is it?' }
    ]

    const result = await provider.chat(messages, {
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 100,
      tools: [
        {
          name: 'get_time',
          description: 'Get current time',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    })

    expect(result.toolCalls).toBeDefined()
    expect(result.toolCalls?.[0].name).toBe('get_time')
  })
})
```

#### 6.6.2 Mock 模块

**使用 Vitest Mock**：

```typescript
// test/unit/agent/agent.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Agent } from '@/agent/core/agent.js'
import type { LLMProvider, AgentDeps } from '@/types/index.js'

describe('Agent', () => {
  it('should call provider.chat()', async () => {
    // Mock Provider
    const mockProvider: LLMProvider = {
      name: 'mock',
      chat: vi.fn().resolvedValue({
        content: 'Hello!',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
      }),
      chatStream: vi.fn(),
      embed: vi.fn(),
      embedBatch: vi.fn()
    }

    // Mock Storage
    const mockStorage = {
      loadSession: vi.fn().resolvedValue([]),
      saveSession: vi.fn().resolvedValue()
    }

    // 创建 Agent
    const agent = new Agent(
      { model: 'claude-3-5-sonnet-20241022' },
      {
        provider: mockProvider,
        storage: mockStorage
      }
    )

    // 测试
    const result = await agent.process('Hello', 'user:123')

    // 验证调用
    expect(mockProvider.chat).toHaveBeenCalledWith(
      [{ role: 'system', content: expect.any(String) }, { role: 'user', content: 'Hello' }],
      { model: 'claude-3-5-sonnet-20241022' }
    )

    // 验证结果
    expect(result.response).toBe('Hello!')
  })
})
```

---

### 6.7 本章小结

**核心要点**：

1. ✅ **ES Modules 基础**：import/export、动态导入
2. ✅ **模块解析**：路径别名、文件扩展名、解析顺序
3. ✅ **设计模式**：Barrel、Facade、依赖注入
4. ✅ **最佳实践**：避免循环依赖、控制模块大小、文档化
5. ✅ **性能优化**：懒加载、Tree Shaking、条件导入
6. ✅ **模块测试**：单元测试、Mock

**ES Modules 在 Krebs 中的应用总结**：

| 特性 | 应用场景 | 优势 |
|-----|---------|------|
| **命名导出** | 工具函数、类型 | 明确导入 |
| **默认导出** | 主要类、Provider | 简化导入 |
| **动态导入** | 技能加载、Provider 选择 | 按需加载 |
| **路径别名** | @/ 映射到 src/ | 简化路径 |
| **重新导出** | barrel 模式 | 统一接口 |

**下一步**：

第7章将详细介绍开发工具链，包括 vitest、tsx、tsc-alias、oxfmt、oxlint 等。

---

**✅ 第6章完成！字数：~2800 字**

---

## 第7章：开发工具链

> **本章目标**：掌握 Krebs 使用的开发工具
>
> **难度**：⭐⭐
>
> **预计阅读时间**：25 分钟

### 7.1 测试框架：Vitest

#### 7.1.1 为什么选择 Vitest？

**对比其他测试框架**：

| 特性 | Vitest | Jest | Mocha |
|-----|--------|------|-------|
| **速度** | ⚡⚡⚡ 极快 | ⚡⚡ 快 | ⚡ 中等 |
| **配置** | ✅ 零配置 | ⚙️ 需要配置 | ⚙️ 需要配置 |
| **TypeScript** | ✅ 原生支持 | 🔧 需要 ts-jest | 🔧 需要 ts-node |
| **ESM** | ✅ 原生支持 | ⚠️ 实验性 | ✅ 支持 |
| **Watch 模式** | ✅ 极快 | ✅ 快 | ✅ 中等 |

**Krebs 的选择**：Vitest

#### 7.1.2 配置 Vitest

**安装**：

```bash
npm install --save-dev vitest
```

**配置文件**（`vitest.config.ts`）：

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // 测试文件匹配模式
  test: {
    globals: true,              // 全局变量（describe, it, expect 等）
    environment: 'node',         // 运行环境
    include: ['**/*.test.ts'],   // 包含的测试文件
    exclude: ['node_modules/', 'dist/'],  // 排除的目录
    coverage: {
      provider: 'v8',           // 覆盖率提供者
      reporter: ['text', 'json', 'html'],  // 报告格式
      exclude: [
        'node_modules/',
        'test/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'dist/'
      ]
    }
  }
})
```

**package.json 脚本**：

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest --run",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch"
  }
}
```

#### 7.1.3 编写测试

**基础测试**：

```typescript
// test/shared/utils.test.ts
import { describe, it, expect } from 'vitest'
import { formatTimestamp } from '@/shared/utils.js'

describe('formatTimestamp', () => {
  it('should format timestamp correctly', () => {
    const timestamp = 1704067200000  // 2024-01-01 00:00:00
    const formatted = formatTimestamp(timestamp)

    expect(formatted).toBe('2024-01-01 00:00:00')
  })

  it('should handle invalid input', () => {
    expect(() => formatTimestamp(-1)).toThrow()
  })
})
```

**异步测试**：

```typescript
import { describe, it, expect } from 'vitest'
import { SessionStore } from '@/storage/session/session-store.js'

describe('SessionStore', () => {
  it('should save and load session', async () => {
    const store = new SessionStore({ baseDir: './test-data' })

    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' }
    ]

    // 保存会话
    await store.saveSession('user:123', messages)

    // 加载会话
    const result = await store.loadSession('user:123')

    expect(result).not.toBeNull()
    expect(result?.messages).toHaveLength(2)
    expect(result?.messages[0].content).toBe('Hello')
  })
})
```

**Mock 测试**：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Agent } from '@/agent/core/agent.js'
import type { LLMProvider } from '@/types/index.js'

describe('Agent', () => {
  let agent: Agent
  let mockProvider: LLMProvider

  beforeEach(() => {
    // 创建 Mock Provider
    mockProvider = {
      name: 'mock',
      chat: vi.fn(),
      chatStream: vi.fn(),
      embed: vi.fn(),
      embedBatch: vi.fn()
    }

    // 创建 Agent
    agent = new Agent(
      { model: 'claude-3-5-sonnet-20241022' },
      { provider: mockProvider }
    )
  })

  it('should call provider.chat()', async () => {
    // 设置 Mock 返回值
    mockProvider.chat.mockResolvedValue({
      content: 'Hello!',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    })

    // 执行测试
    const result = await agent.process('Hi', 'user:123')

    // 验证调用
    expect(mockProvider.chat).toHaveBeenCalledTimes(1)
    expect(result.response).toBe('Hello!')
  })
})
```

#### 7.1.4 测试覆盖率

**生成覆盖率报告**：

```bash
npm run test:coverage
```

**覆盖率报告示例**：

```
----------|---------|----------|---------|---------|
File      | % Stmts | % Branch | % Funcs | % Lines |
----------|---------|----------|---------|---------|
All files |   92.5  |    85.2  |   95.8  |   92.5 |
----------|---------|----------|---------|---------|
 src/     |   95.3  |    88.7  |   98.2  |   95.3 |
 index.ts |   100.0  |   100.0  |   100.0 |   100.0 |
 agent.ts |   98.5  |    92.1  |   100.0 |    98.5 |
```

**Krebs 的测试覆盖**：

```
测试文件：21 个
测试用例：353 个
通过率：100%
覆盖率：>90%
```

---

### 7.2 TypeScript 执行器：tsx

#### 7.2.1 为什么选择 tsx？

**对比其他工具**：

| 工具 | 速度 | 支持类型 | ESM | 配置 |
|-----|------|---------|-----|------|
| tsx | ⚡⚡⚡ 极快 | ✅ 原生 | ✅ 原生 | ✅ 零配置 |
| ts-node | ⚡ 快 | ✅ 需要 ttypescript | ⚠️ 实验性 | ⚙️ 需要配置 |
| esbuild | ⚡⚡⚡⚡ 最快 | ❌ 需要 d.ts | ✅ | ⚙️ 需要配置 |

#### 7.2.2 使用 tsx

**直接运行**：

```bash
npx tsx src/index.ts
```

**监听模式**（开发推荐）：

```bash
npx tsx watch src/index.ts
```

**调试模式**：

```bash
npx tsx --inspect-brk src/index.ts
```

**package.json 配置**：

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc && tsc-alias"
  }
}
```

#### 7.2.3 tsx 性能优势

**启动速度对比**：

```
ts-node:
启动时间: ~2 秒
热更新: ~1 秒

tsx:
启动时间: ~0.2 秒
热更新: ~0.1 秒

esbuild-loader:
启动时间: ~0.5 秒
热更新: ~0.3 秒
```

---

### 7.3 路径别名工具：tsc-alias

#### 7.3.1 为什么需要 tsc-alias？

**TypeScript 的限制**：

```typescript
// src/index.ts
import { Agent } from '@/agent/core/agent.js'

// 编译后（TypeScript 默认行为）：
import { Agent } from '@/agent/core/agent.js'
// ↑ 路径别名保留在 .js 文件中！

// Node.js 运行时会报错：
// Error: Cannot find module '@/agent/core/agent.js'
```

**tsc-alias 的解决方案**：

```typescript
// 编译后（使用 tsc-alias）：
import { Agent } from '../../../agent/core/agent.js'
// ↑ 路径别名被替换为相对路径
```

#### 7.3.2 配置 tsc-alias

**安装**：

```bash
npm install --save-dev tsc-alias
```

**配置文件**（`tsc-alias.json`）：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

**package.json 脚本**：

```json
{
  "scripts": {
    "build": "tsc && tsc-alias"
  }
}
```

**构建流程**：

```
1. tsc 编译 TypeScript → JavaScript
   src/index.ts → dist/index.js
   (保留 @/ 别名)

2. tsc-alias 替换路径别名 → 相对路径
   dist/index.js
   import { Agent } from '@/agent/agent.js'
   ↓
   import { Agent } from '../../agent/agent.js'
```

#### 7.3.3 验证构建结果

**检查编译输出**：

```bash
# 构建
npm run build

# 检查生成的文件
cat dist/index.js | grep "@/"
# 应该没有输出（所有 @/ 都被替换了）
```

---

### 7.4 代码格式化：oxfmt

#### 7.4.1 为什么需要代码格式化？

**统一代码风格的好处**：

- ✅ 减少代码审查时的风格讨论
- ✅ 自动化格式化，节省时间
- ✅ 统一的代码风格，易于阅读
- ✅ 减少合并冲突

#### 7.4.2 配置 oxfmt

**安装**：

```bash
npm install --save-dev oxfmt
```

**配置文件**（`.oxfmtrc.jsonc`）：

```jsonc
{
  "formatter": "dprint",
  "indentWidth": 2,
  "lineWidth": 100,
  "quotes": "preferDouble",
  "trailingComma": "es5",
  "semicolons": "always",
  "arrowParentheses": "always"
}
```

**package.json 脚本**：

```json
{
  "scripts": {
    "format": "oxfmt --write src"
  }
}
```

#### 7.4.3 格式化示例

**格式化前**：

```typescript
const foo=async(x:number,y:number)=>{return x+y}
const bar={
    name:'test',
    age:30
}
```

**格式化后**：

```typescript
const foo = async (x: number, y: number) => {
  return x + y;
};

const bar = {
  name: 'test',
  age: 30,
};
```

---

### 7.5 代码检查：oxlint

#### 7.5.1 为什么需要代码检查？

**代码检查的价值**：

- ✅ 提前发现潜在错误
- ✅ 强制执行代码规范
- ✅ 统一代码风格
- ✅ 提高代码质量

#### 7.5.2 配置 oxlint

**安装**：

```bash
npm install --save-dev oxlint
```

**配置文件**（`.oxlintrc.json`）：

```json
{
  "categories": {
    "suspicious": {
      "noEmptyArrayIndexes": "warn"
    },
    "correctness": {
      "noUnusedVariables": "error",
      "noConstAssign": "error"
    },
    "style": {
      "noConsole": "warn",
      "preferConst": "error"
    },
    "perf": {
      "noBarrelFile": "warn"
    }
  }
}
```

**package.json 脚本**：

```json
{
  "scripts": {
    "lint": "oxlint src",
    "lint:fix": "oxlint --fix src"
  }
}
```

#### 7.5.3 常见检查规则

**未使用的变量**：

```typescript
// ❌ 错误：未使用的变量
const foo = 123  // Error: 'foo' is never used

// ✅ 正确：使用变量或移除
const foo = 123
console.log(foo)
```

**const 赋值**：

```typescript
// ❌ 错误：重新赋值 const
const foo = 123
foo = 456  // Error: Cannot assign to 'foo' because it is a constant

// ✅ 正确：使用 let
let foo = 123
foo = 456
```

**console 警告**：

```typescript
// ⚠️ 警告：生产环境不应该有 console
console.log('Debug info')

// ✅ 正确：使用 logger
logger.info('Debug info')
```

---

### 7.6 Pre-commit Hook

#### 7.6.1 配置 Husky

**安装**：

```bash
npm install --save-dev husky
npx husky install
```

**配置 pre-commit hook**：

```bash
# .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"

echo "Running pre-commit checks..."

# 运行 lint
npm run lint || exit 1

# 运行格式化
npm run format || exit 1

# 运行测试
npm run test:run || exit 1

echo "Pre-commit checks passed!"
```

**使用**：

```bash
git add .
git commit -m "feat: add new feature"

# 自动触发 pre-commit hook
# ✓ Running pre-commit checks...
# ✓ Lint passed
# ✓ Format passed
# ✓ Tests passed
# ✓ Pre-commit checks passed!
```

#### 7.6.2 配置 lint-staged

**安装**：

```bash
npm install --save-dev lint-staged
```

**配置**：

```json
{
  "lint-staged": {
    "src/**/*.ts": [
      "oxfmt --write",
      "oxlint --fix"
    ]
  }
}
```

**.husky/pre-commit**：

```bash
#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
npm run test:run
```

---

### 7.7 CI/CD 集成

#### 7.7.1 GitHub Actions 配置

**文件**：`.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info

      - name: Build
        run: npm run build
```

#### 7.7.2 Docker 构建

**文件**：`Dockerfile`

```dockerfile
# 1. 构建阶段
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# 2. 运行阶段
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000 3001

CMD ["node", "dist/index.js"]
```

**构建镜像**：

```bash
docker build -t krebs:latest .
```

---

### 7.8 开发工作流

#### 7.8.1 典型开发流程

```
1. 编写代码
   ↓
2. 保存文件（tsx watch 自动编译）
   ↓
3. 自动运行测试（vitest watch）
   ↓
4. 提交代码（pre-commit hook 自动检查）
   ↓
5. 推送到 GitHub（CI 自动运行测试）
   ↓
6. 代码合并
```

#### 7.8.2 推荐工具配置

**VS Code 设置**：

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseLibraryTsForDefinition": true
}
```

**推荐 VS Code 插件**：

- ✅ ESLint
- ✅ Prettier
- ✅ Error Lens
- ✅ Code Runner
- ✅ TypeScript Importer

---

### 7.9 本章小结

**核心要点**：

1. ✅ **Vitest**：快速、零配置的测试框架
2. ✅ **tsx**：极快的 TypeScript 执行器
3. ✅ **tsc-alias**：路径别名替换工具
4. ✅ **oxfmt**：代码格式化工具
5. ✅ **oxlint**：代码检查工具
6. ✅ **Husky**：Git hooks 自动化
7. ✅ **CI/CD**：GitHub Actions、Docker

**开发工具链总结**：

| 工具 | 用途 | 命令 |
|-----|------|------|
| **vitest** | 测试 | `npm test` |
| **tsx** | 执行 TypeScript | `npx tsx src/index.ts` |
| **tsc-alias** | 路径别名替换 | `npx tsc-alias` |
| **oxfmt** | 代码格式化 | `npm run format` |
| **oxlint** | 代码检查 | `npm run lint` |
| **husky** | Git hooks | 自动触发 |

**完整工作流**：

```bash
# 1. 开发
npm run dev

# 2. 测试
npm test

# 3. 格式化 + 检查
npm run format
npm run lint

# 4. 构建
npm run build

# 5. 提交（自动运行 pre-commit hook）
git add .
git commit -m "feat: xxx"
```

---

### 7.10 第二部分总结

**第二部分：基础技术栈**（第4-7章）已完成！

| 章节 | 标题 | 字数 | 核心内容 |
|-----|------|-----|---------|
| 第4章 | TypeScript 类型系统实战 | ~4200 | 类型安全、接口、泛型、类型守卫 |
| 第5章 | Node.js 运行时机制 | ~3800 | 事件循环、异步编程、流处理、文件系统 |
| 第6章 | ES Modules 模块化 | ~2800 | import/export、模块解析、设计模式 |
| 第7章 | 开发工具链 | ~3000 | Vitest、tsx、tsc-alias、oxfmt、oxlint |

**第二部分总计**: ~13,800 字

---

**✅ 第6-7章完成！总字数：~13,800**

---

## 📊 整体进度更新

### ✅ 已完成内容

| 部分 | 章节 | 字数 | 状态 |
|-----|------|-----|------|
| **总纲** | 0.1-0.6 | ~2500 | ✅ 完成 |
| **第一部分** | 第1-3章 | ~11500 | ✅ 完成 |
| **第二部分** | 第4-7章 | ~13800 | ✅ 完成 |

**文档总计**: ~27,800 字

### 📋 后续计划

**第三部分：核心架构深度解析**（第8-14章）
- 第8章：Provider 模式（策略模式）
- 第9章：Storage 层架构
- 第10章：Scheduler 并发控制
- 第11章：Agent 核心（智能体）
- 第12章：Skills 系统（技能框架）
- 第13章：Gateway 接入层
- 第14章：Docker 容器化部署

**预计字数**: ~15,000 字

---

---

## 第三部分：核心架构深度解析

## 第8章：Provider 模式（策略模式）

> **本章目标**：深入理解 Krebs 的 Provider 架构，掌握策略模式在实际项目中的应用
>
> **难度**：⭐⭐⭐
>
> **预计阅读时间**：35 分钟

### 8.1 什么是 Provider 模式？

#### 8.1.1 策略模式简介

**定义**：策略模式（Strategy Pattern）定义了一系列算法（策略），将每个算法封装起来，并使它们可以互换。

**生活中的例子**：

```
出行策略：
├─ 开车（快速但成本高）
├─ 公交（便宜但慢）
└─ 骑行（环保但费力）

不同的出行策略可以互换，最终目的地相同
```

**在 Krebs 中的应用**：

```
LLM Provider（大模型提供商）：
├─ Anthropic Provider（Claude 模型）
├─ OpenAI Provider（GPT 模型）
└─ DeepSeek Provider（DeepSeek 模型）

不同的 Provider 可以互换，最终都是调用大模型 API
```

#### 8.1.2 为什么需要 Provider 模式？

**场景 1：没有 Provider 模式（❌ 糟糕的设计）**

```typescript
// src/agent/core/agent.ts

export class Agent {
  async process(messages: Message[]) {
    // ❌ 硬编码使用 Anthropic
    const client = new Anthropic({ apiKey: '...' })
    const response = await client.messages.create({...})
    return response
  }
}

// 问题：
// 1. 想换 OpenAI？必须修改 Agent 代码
// 2. 想支持多个模型？写一堆 if-else
// 3. 想测试？无法 Mock
// 4. 违反开闭原则（对修改开放，对扩展封闭）
```

**场景 2：使用 Provider 模式（✅ 优秀的设计）**

```typescript
// 定义接口
interface LLMProvider {
  chat(messages: Message[]): Promise<ChatCompletionResult>
}

// Agent 不关心具体是哪个 Provider
export class Agent {
  constructor(private provider: LLMProvider) {}

  async process(messages: Message[]) {
    // ✅ 只调用接口，不关心具体实现
    return await this.provider.chat(messages)
  }
}

// 使用时注入
const agent = new Agent(new AnthropicProvider())
// 或者
const agent = new Agent(new OpenAIProvider())
```

**优势对比**：

| 维度 | ❌ 没有 Provider 模式 | ✅ 有 Provider 模式 |
|-----|---------------------|-------------------|
| **可扩展性** | 每增加一个模型都要改 Agent 代码 | 只需新增 Provider 类 |
| **可测试性** | 无法 Mock，必须真实调用 | 可以 Mock Provider |
| **可维护性** | 大量 if-else，代码混乱 | 清晰的接口，易于理解 |
| **灵活性** | 运行时无法切换模型 | 运行时动态切换 |

---

### 8.2 Provider 接口定义

#### 8.2.1 核心接口

**源码位置**：`src/provider/base.ts`

```typescript
/**
 * Provider 基础接口
 * 所有模型提供者必须实现这个接口
 */
export interface LLMProvider {
  /**
   * 提供者名称（只读）
   * 例如：'anthropic'、'openai'、'deepseek'
   */
  readonly name: string

  /**
   * 聊天完成（非流式）
   * @param messages 消息历史
   * @param options 配置选项（模型、温度、最大tokens等）
   * @returns 聊天结果（包含内容和token使用情况）
   */
  chat(
    messages: Message[],
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult>

  /**
   * 流式聊天
   * @param onChunk 每收到一个文本块就回调
   * @returns 完整的聊天结果
   */
  chatStream(
    messages: Message[],
    options: ChatCompletionOptions,
    onChunk: (chunk: string) => void
  ): Promise<ChatCompletionResult>

  /**
   * 生成嵌入向量（用于语义搜索）
   * @param text 输入文本
   * @returns 向量数据
   */
  embed(text: string): Promise<EmbeddingResult>

  /**
   * 批量生成嵌入向量（更高效）
   * @param texts 多个文本
   * @returns 多个向量数据
   */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>
}

/**
 * Provider 配置
 */
export type ProviderConfig = {
  apiKey?: string           // API 密钥
  baseUrl?: string          // 自定义 API 地址
  timeout?: number          // 请求超时时间（毫秒）
}
```

**设计要点**：

1. **接口隔离**：只定义必需的方法，每个 Provider 必须实现
2. **返回类型统一**：不管底层 API 如何不同，返回相同的 `ChatCompletionResult`
3. **流式支持**：提供 `chatStream` 方法，支持实时输出
4. **嵌入向量**：支持语义搜索功能

#### 8.2.2 类型定义

**相关类型**（`src/types/index.ts`）：

```typescript
/**
 * 消息类型
 */
export type Message = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 聊天配置选项
 */
export type ChatCompletionOptions = {
  model: string              // 模型名称，例如 'claude-3-5-sonnet-20241022'
  temperature?: number       // 0-1，越高越随机
  maxTokens?: number         // 最大生成的 token 数
}

/**
 * 聊天结果
 */
export type ChatCompletionResult = {
  content: string            // 生成的文本
  toolCalls?: any[]          // 工具调用（如果有的话）
  usage: {
    promptTokens: number      // 输入 token 数
    completionTokens: number  // 输出 token 数
    totalTokens: number       // 总 token 数
  }
}

/**
 * 嵌入向量结果
 */
export type EmbeddingResult = {
  embedding: number[]        // 向量数组（例如 [0.1, -0.2, 0.3, ...]）
  model: string              // 使用的模型
}
```

---

### 8.3 Anthropic Provider 实现详解

#### 8.3.1 基本结构

**源码位置**：`src/provider/anthropic.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk"
import type { LLMProvider, ProviderConfig } from "./base.js"

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic"  // 实现接口要求的 name 属性
  private client: Anthropic    // 私有客户端实例

  constructor(config: ProviderConfig = {}) {
    // 验证必需参数
    if (!config.apiKey) {
      throw new Error("Anthropic API key is required")
    }

    // 创建 SDK 客户端
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,      // 可选：自定义 API 地址
      timeout: config.timeout ?? 60000  // 默认 60 秒
    })
  }
}
```

**要点**：

1. **实现 LLMProvider 接口**：TypeScript 会检查是否实现了所有方法
2. **readonly name**：标识 Provider 类型，不可修改
3. **私有客户端**：封装 SDK 实例，外部无法直接访问
4. **默认值**：`timeout` 默认 60000ms（60秒）

#### 8.3.2 chat 方法实现

**完整代码解析**：

```typescript
async chat(
  messages: Message[],
  options: ChatCompletionOptions & { tools?: Tool[] }  // 扩展：支持工具
): Promise<ChatCompletionResult & { toolCalls?: any[] }> {

  // ──────────────────────────────────────
  // 第1步：转换工具格式（如果有工具）
  // ──────────────────────────────────────
  const anthropicTools = options.tools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as any,  // Anthropic 使用 input_schema
  }))

  // ──────────────────────────────────────
  // 第2步：自动重试机制（针对上下文溢出错误）
  // ──────────────────────────────────────
  let lastError: Error | null = null
  const maxRetries = 2  // 最多重试 2 次

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // ──────────────────────────────────────
      // 第3步：调用 Anthropic API
      // ──────────────────────────────────────
      const response = await this.client.messages.create({
        model: options.model,
        messages: messages
          .filter((m) => m.role !== "system")  // Anthropic 不在 messages 中放 system
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        system: messages.find((m) => m.role === "system")?.content,  // 单独传 system
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature,
        tools: anthropicTools && anthropicTools.length > 0 ? anthropicTools : undefined,
      })

      // ──────────────────────────────────────
      // 第4步：检查是否有工具调用
      // ──────────────────────────────────────
      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use"
      )

      if (toolUseBlocks.length > 0) {
        // 提取工具调用信息
        const toolCalls = toolUseBlocks.map((block: any) => ({
          id: block.id,           // 工具调用 ID
          name: block.name,       // 工具名称
          arguments: block.input, // 工具参数
        }))

        return {
          content: "",            // 工具调用时没有文本内容
          toolCalls,              // 返回工具调用列表
          usage: {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          },
        }
      }

      // ──────────────────────────────────────
      // 第5步：普通文本响应
      // ──────────────────────────────────────
      const content = response.content[0]?.type === "text"
        ? response.content[0].text
        : ""

      return {
        content,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      }

    } catch (error: any) {
      // ──────────────────────────────────────
      // 第6步：错误处理和重试
      // ──────────────────────────────────────
      lastError = error
      const errorMessage = error?.message || String(error)

      // 检查是否为上下文溢出错误
      if (isContextOverflowError(errorMessage) && attempt < maxRetries) {
        console.warn(
          `[Anthropic] Context overflow detected (attempt ${attempt + 1}/${maxRetries + 1}), ` +
          `please compress messages and retry. Error: ${errorMessage}`
        )

        // 等待 1 秒后重试
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue  // 继续下一次循环（重试）
      }

      // 其他错误直接抛出
      throw error
    }
  }

  // 所有重试都失败
  throw lastError || new Error("Max retries exceeded")
}
```

**关键技术点**：

1. **system 消息处理**：
   - Anthropic 要求 system 消息单独传递，不在 messages 数组中
   - 使用 `filter` 和 `find` 分离 system 消息

2. **工具调用检测**：
   - 检查 `response.content` 中是否有 `type === "tool_use"` 的块
   - 提取工具 ID、名称和参数

3. **自动重试机制**：
   - 针对上下文溢出错误（消息太长）
   - 最多重试 2 次
   - 每次重试前等待 1 秒

4. **Token 统计**：
   - `input_tokens`：输入 token 数
   - `output_tokens`：输出 token 数
   - 计算总 token 数

#### 8.3.3 chatStream 方法实现

**流式响应原理**：

```
传统请求（非流式）：
用户 → API → 等待完整生成 → 返回全部文本
（用户等待时间长）

流式请求：
用户 → API → 每生成几个字就返回 → 逐字显示
（用户体验好，实时反馈）
```

**代码实现**：

```typescript
async chatStream(
  messages: Message[],
  options: ChatCompletionOptions,
  onChunk: (chunk: string) => void  // 每收到一个文本块就回调
): Promise<ChatCompletionResult> {

  // 创建流式请求
  const stream = await this.client.messages.create({
    model: options.model,
    messages: messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    system: messages.find((m) => m.role === "system")?.content,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature,
    stream: true,  // ⭐ 关键：启用流式模式
  })

  let fullContent = ""      // 累积完整内容
  let inputTokens = 0       // 输入 token 数
  let outputTokens = 0      // 输出 token 数

  // ──────────────────────────────────────
  // 逐个处理流式事件
  // ──────────────────────────────────────
  for await (const event of stream) {
    switch (event.type) {
      case "content_block_delta":
        // 文本增量事件
        if (event.delta.type === "text_delta") {
          const chunk = event.delta.text
          fullContent += chunk          // 累积内容
          onChunk(chunk)                // 回调通知
        }
        break

      case "message_start":
        // 消息开始事件，包含输入 token 数
        inputTokens = event.message.usage.input_tokens
        break

      case "message_delta":
        // 消息结束事件，包含输出 token 数
        outputTokens = event.usage.output_tokens
        break
    }
  }

  return {
    content: fullContent,
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  }
}
```

**流式事件类型**：

| 事件类型 | 触发时机 | 数据 |
|---------|---------|------|
| `message_start` | 开始生成时 | 输入 token 数 |
| `content_block_delta` | 每生成一段文本 | 文本增量 |
| `message_delta` | 生成结束时 | 输出 token 数 |

**使用示例**：

```typescript
const provider = new AnthropicProvider({ apiKey: 'sk-...' })

await provider.chatStream(
  [{ role: 'user', content: '写一首诗' }],
  { model: 'claude-3-5-sonnet-20241022' },
  (chunk) => {
    // 每收到一段文本就打印
    process.stdout.write(chunk)
  }
)

// 输出效果（逐字显示）：
// 春
// 风
// 吹
// 绿
// 柳
// ...
```

#### 8.3.4 embed 方法实现

```typescript
async embed(_text: string): Promise<EmbeddingResult> {
  throw new Error("Anthropic does not support embeddings")
}

async embedBatch(_texts: string[]): Promise<EmbeddingResult[]> {
  throw new Error("Anthropic does not support embeddings")
}
```

**为什么抛出错误？**

- Anthropic 目前不提供嵌入向量 API
- 如果用户尝试使用，会明确提示错误原因
- 这是接口设计的权衡：不是所有 Provider 都支持所有功能

---

### 8.4 OpenAI Provider 实现

#### 8.4.1 基本结构

**源码位置**：`src/provider/openai.ts`

```typescript
import OpenAI from "openai"
import type { LLMProvider, ProviderConfig } from "./base.js"

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai"
  private client: OpenAI

  constructor(config: ProviderConfig = {}) {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required")
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,      // 支持自定义端点（例如兼容 API）
      timeout: config.timeout ?? 60000,
    })
  }
}
```

**与 Anthropic 的区别**：

- 使用的 SDK 不同：`openai` vs `@anthropic-ai/sdk`
- API 格式略有差异
- 但接口完全一致，可以互换

#### 8.4.2 chat 方法实现

**代码结构**（与 Anthropic 类似）：

```typescript
async chat(
  messages: Message[],
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {

  // 重试机制（同 Anthropic）
  let lastError: Error | null = null
  const maxRetries = 2

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await this.client.chat.completions.create({
        model: options.model,
        messages: messages.map((m) => ({
          role: m.role,      // OpenAI 接受 system 消息
          content: m.content,
        })),
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      })

      const content = response.choices[0]?.message.content ?? ""

      return {
        content,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
      }

    } catch (error: any) {
      // 错误处理（同 Anthropic）
      lastError = error
      const errorMessage = error?.message || String(error)

      if (isContextOverflowError(errorMessage) && attempt < maxRetries) {
        console.warn(
          `[OpenAI] Context overflow detected (attempt ${attempt + 1}/${maxRetries + 1}), ` +
          `please compress messages and retry. Error: ${errorMessage}`
        )
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }
      throw error
    }
  }

  throw lastError || new Error("Max retries exceeded")
}
```

**关键差异**：

| 特性 | Anthropic | OpenAI |
|-----|-----------|--------|
| **system 消息** | 单独传递（`system` 字段） | 放在 `messages` 数组中 |
| **响应结构** | `response.content[0].text` | `response.choices[0].message.content` |
| **Token 字段** | `input_tokens`, `output_tokens` | `prompt_tokens`, `completion_tokens` |

#### 8.4.3 embed 方法实现

```typescript
async embed(text: string): Promise<EmbeddingResult> {
  const response = await this.client.embeddings.create({
    model: "text-embedding-3-small",  // OpenAI 的嵌入模型
    input: text,
  })

  const embedding = response.data[0]?.embedding ?? []

  return {
    embedding,  // 向量数组
    model: response.model,
  }
}

async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
  const response = await this.client.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,  // ⭐ 批量处理，更高效
  })

  return response.data.map((d) => ({
    embedding: d.embedding,
    model: response.model,
  }))
}
```

**使用示例**：

```typescript
const provider = new OpenAIProvider({ apiKey: 'sk-...' })

// 单个文本
const result = await provider.embed("Hello world")
console.log(result.embedding)
// [0.1, -0.2, 0.3, ...]  // 1536 维向量（text-embedding-3-small）

// 批量文本
const results = await provider.embedBatch([
  "Hello world",
  "Goodbye world"
])
console.log(results.length)  // 2
```

---

### 8.5 DeepSeek Provider 实现

#### 8.5.1 基本结构

**源码位置**：`src/provider/deepseek.ts`

```typescript
import OpenAI from "openai"  // ⭐ DeepSeek 使用 OpenAI 兼容的 API

export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek"
  private client: OpenAI

  constructor(config: ProviderConfig = {}) {
    if (!config.apiKey) {
      throw new Error("DeepSeek API key is required")
    }
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl ?? "https://api.deepseek.com",  // ⭐ 默认 DeepSeek 端点
      timeout: config.timeout ?? 60000,
    })
  }
}
```

**要点**：

- DeepSeek API 与 OpenAI API 格式兼容
- 可以直接使用 OpenAI SDK
- 只需修改 `baseURL`

#### 8.5.2 工具调用处理

**DeepSeek 支持 OpenAI 格式的工具调用**：

```typescript
async chat(
  messages: Message[],
  options: ChatCompletionOptions & { tools?: Tool[] }
): Promise<ChatCompletionResult & { toolCalls?: any[] }> {

  // 转换工具格式为 OpenAI 格式
  const openaiTools = options.tools?.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }))

  // ... 调用 API ...

  // 检查工具调用
  if (message?.tool_calls && message.tool_calls.length > 0) {
    const toolCalls = message.tool_calls.map((tc) => {
      try {
        return {
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),  // ⭐ 参数是 JSON 字符串，需要解析
        }
      } catch (error) {
        console.error('[DeepSeek] Failed to parse tool arguments:', {
          toolName: tc.function.name,
          arguments: tc.function.arguments,
          argumentsLength: tc.function.arguments?.length,
          error: error instanceof Error ? error.message : error
        })
        throw new Error(
          `Failed to parse arguments for tool ${tc.function.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    })

    return {
      content: "",
      toolCalls,
      usage: { /* ... */ },
    }
  }

  // ... 普通响应 ...
}
```

**工具调用差异**：

| 特性 | Anthropic | OpenAI / DeepSeek |
|-----|-----------|------------------|
| **工具格式** | `{ name, description, input_schema }` | `{ type: 'function', function: { name, description, parameters } }` |
| **参数格式** | 直接是对象 | JSON 字符串，需要 `JSON.parse()` |

---

### 8.6 Provider 工厂模式

#### 8.6.1 工厂模式简介

**问题**：如何创建 Provider 对象？

**方法 1：直接实例化（❌ 不推荐）**

```typescript
// 用户需要知道具体的类
let provider: LLMProvider

if (type === 'anthropic') {
  provider = new AnthropicProvider(config)
} else if (type === 'openai') {
  provider = new OpenAIProvider(config)
} else if (type === 'deepseek') {
  provider = new DeepSeekProvider(config)
}

// 问题：
// 1. 用户代码复杂
// 2. 每增加一个 Provider 都要修改所有创建代码
```

**方法 2：工厂模式（✅ 推荐）**

```typescript
// 用户只需调用工厂函数
const provider = createProvider('anthropic', config)

// 优势：
// 1. 代码简洁
// 2. 新增 Provider 只需修改工厂函数
```

#### 8.6.2 工厂函数实现

**源码位置**：`src/provider/factory.ts`

```typescript
import type { LLMProvider, ProviderConfig } from "./base.js"
import { AnthropicProvider } from "./anthropic.js"
import { OpenAIProvider } from "./openai.js"
import { DeepSeekProvider } from "./deepseek.js"

/**
 * 支持的 Provider 类型
 */
export type ProviderType = "anthropic" | "openai" | "deepseek"

/**
 * 通用工厂函数
 */
export function createProvider(
  type: ProviderType,
  config: ProviderConfig
): LLMProvider {
  switch (type) {
    case "anthropic":
      return new AnthropicProvider(config)
    case "openai":
      return new OpenAIProvider(config)
    case "deepseek":
      return new DeepSeekProvider(config)
    default:
      // ⭐ TypeScript 会检查是否处理了所有情况
      const _exhaustive: never = type
      throw new Error(`Unknown provider type: ${_exhaustive}`)
  }
}

/**
 * 专用工厂函数（可选）
 */
export function createAnthropicProvider(config: ProviderConfig): LLMProvider {
  return new AnthropicProvider(config)
}

export function createOpenAIProvider(config: ProviderConfig): LLMProvider {
  return new OpenAIProvider(config)
}

export function createDeepSeekProvider(config: ProviderConfig): LLMProvider {
  return new DeepSeekProvider(config)
}
```

**类型安全**：

```typescript
// ✅ 类型检查通过
const provider1 = createProvider('anthropic', { apiKey: 'sk-...' })
const provider2 = createProvider('openai', { apiKey: 'sk-...' })
const provider3 = createProvider('deepseek', { apiKey: 'sk-...' })

// ❌ 编译错误：类型不匹配
const provider4 = createProvider('unknown', { apiKey: 'sk-...' })
// Error: Argument of type '"unknown"' is not assignable to parameter of type 'ProviderType'
```

**使用示例**：

```typescript
// 示例 1：从环境变量创建
const provider = createProvider(process.env.PROVIDER_TYPE, {
  apiKey: process.env.API_KEY
})

// 示例 2：根据配置文件创建
const config = loadConfig('config.yaml')
const provider = createProvider(config.provider.type, config.provider)

// 示例 3：动态切换
let provider = createProvider('anthropic', { apiKey: 'sk-...' })

// 后来想切换到 OpenAI
provider = createProvider('openai', { apiKey: 'sk-...' })
```

---

### 8.7 Provider 选择策略

#### 8.7.1 性能对比

| Provider | 模型 | 速度 | 质量 | 成本 | 工具调用 | 嵌入向量 |
|---------|------|-----|------|------|---------|---------|
| **Anthropic** | Claude 3.5 Sonnet | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | 💰💰💰 | ✅ | ❌ |
| **OpenAI** | GPT-4o | ⚡⚡⚡ | ⭐⭐⭐⭐⭐ | 💰💰💰 | ✅ | ✅ |
| **DeepSeek** | DeepSeek-V3 | ⚡⚡⚡⚡ | ⭐⭐⭐⭐ | 💰 | ✅ | ✅ |

#### 8.7.2 选择建议

**场景 1：需要最强推理能力**

```typescript
// 选择 Anthropic Claude 3.5 Sonnet 或 OpenAI GPT-4o
const provider = createProvider('anthropic', {
  apiKey: process.env.ANTHROPIC_API_KEY
})
```

**场景 2：需要嵌入向量（语义搜索）**

```typescript
// 必须选择支持 embed 的 Provider
const provider = createProvider('openai', {
  apiKey: process.env.OPENAI_API_KEY
})

// 或者 DeepSeek
const provider = createProvider('deepseek', {
  apiKey: process.env.DEEPSEEK_API_KEY
})
```

**场景 3：成本敏感**

```typescript
// DeepSeek 最便宜
const provider = createProvider('deepseek', {
  apiKey: process.env.DEEPSEEK_API_KEY
})
```

**场景 4：混合使用**

```typescript
// 聊天用 Claude，嵌入向量用 OpenAI
const chatProvider = createProvider('anthropic', {
  apiKey: process.env.ANTHROPIC_API_KEY
})

const embedProvider = createProvider('openai', {
  apiKey: process.env.OPENAI_API_KEY
})

// 使用
const chatResult = await chatProvider.chat(messages, options)
const embedResult = await embedProvider.embed("search query")
```

---

### 8.8 本章小结

**核心要点**：

1. ✅ **策略模式**：定义接口，不同实现可以互换
2. ✅ **Provider 接口**：`chat`、`chatStream`、`embed`、`embedBatch`
3. ✅ **Anthropic Provider**：Claude 模型，支持工具调用，不支持嵌入向量
4. ✅ **OpenAI Provider**：GPT 模型，支持工具调用和嵌入向量
5. ✅ **DeepSeek Provider**：使用 OpenAI 兼容 API，成本更低
6. ✅ **工厂模式**：`createProvider` 简化对象创建
7. ✅ **自动重试**：针对上下文溢出错误的容错机制

**Provider 模式优势总结**：

| 优势 | 说明 |
|-----|------|
| **可扩展性** | 新增模型只需添加新的 Provider 类 |
| **可测试性** | 可以 Mock Provider 进行单元测试 |
| **灵活性** | 运行时动态切换模型 |
| **类型安全** | TypeScript 接口保证实现一致性 |
| **代码复用** | Agent 不关心底层 Provider，统一调用 |

**代码示例回顾**：

```typescript
// 1. 定义接口
interface LLMProvider {
  chat(messages: Message[]): Promise<ChatCompletionResult>
}

// 2. 实现多个 Provider
class AnthropicProvider implements LLMProvider { ... }
class OpenAIProvider implements LLMProvider { ... }

// 3. 使用工厂创建
const provider = createProvider('anthropic', { apiKey: 'sk-...' })

// 4. 注入到 Agent
const agent = new Agent({ model: 'claude-3-5-sonnet-20241022' }, { provider })

// 5. Agent 不关心具体实现
await agent.process('Hello')  // 调用的是接口，不是具体类
```

---

**✅ 第8章完成！字数：~4200**

---

## 第9章：Storage 层架构

> **本章目标**：深入理解 Krebs 的存储架构，掌握 Session Storage 和 Memory Storage 的实现
>
> **难度**：⭐⭐⭐⭐
>
> **预计阅读时间**：40 分钟

### 9.1 Storage 层概述

#### 9.1.1 为什么需要 Storage？

AI Agent 的核心能力之一是"记忆"：

```
人类对话：
我：我叫小明
AI：你好小明！
我：我叫什么？
AI：你叫小明（✅ 记住了上下文）

没有 Storage：
我：我叫小明
AI：你好小明！
我：我叫什么？
AI：我不知道（❌ 丢失上下文）
```

**Krebs 的 Storage 层提供两种记忆**：

1. **Session Storage（会话存储）**：
   - 存储对话历史
   - 短期记忆
   - 例如：用户说过的话、AI 的回复

2. **Memory Storage（记忆存储）**：
   - 存储长期知识
   - 语义搜索
   - 例如：文档、笔记、代码片段

#### 9.1.2 Storage 层架构

```
┌─────────────────────────────────────────────┐
│            Storage Layer                    │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────────┐  ┌─────────────────┐ │
│  │ Session Storage  │  │ Memory Storage  │ │
│  │                  │  │                 │ │
│  │ - 对话历史       │  │ - 长期知识      │ │
│  │ - Markdown 文件  │  │ - 向量搜索      │ │
│  │ - 文件锁 + 缓存  │  │ - SQLite + Vec  │ │
│  └──────────────────┘  └─────────────────┘ │
│          │                      │           │
│          ▼                      ▼           │
│  ┌──────────────────┐  ┌─────────────────┐ │
│  │ 文件系统         │  │ better-sqlite3  │ │
│  │ (Markdown 格式)  │  │ sqlite-vec      │ │
│  └──────────────────┘  └─────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

---

### 9.2 Session Storage（会话存储）

#### 9.2.1 核心概念

**Session（会话）**：
- 一次完整的对话
- 包含所有消息（user、assistant、system、tool_calls）
- 持久化到磁盘

**Session Key（会话键）**：
- 唯一标识一个会话
- 可以是用户 ID、会话 ID、或任何字符串
- 例如：`"user:123"`、`"chat:abc"`、`"session:2024-02-25"`

**文件格式**：

```markdown
---
sessionId: "550e8400-e29b-41d4-a716-446655440000"
createdAt: 1708867200000
updatedAt: 1708953600000
title: "第一次对话"
---

## system

你是一个有帮助的助手。

## user

你好！

## assistant

你好！有什么我可以帮助你的吗？

## user

我叫小明

## assistant

你好小明！很高兴认识你。
```

**要点**：
- 前面是 frontmatter（YAML 格式元数据）
- 后面是对话内容（Markdown 格式）
- 每个消息以 `## role` 开头

#### 9.2.2 SessionStore 类结构

**源码位置**：`src/storage/session/session-store.ts`

```typescript
export class SessionStore {
  // 配置
  private readonly baseDir: string          // 存储目录
  private readonly enableCache: boolean     // 是否启用缓存
  private readonly cacheTtl: number         // 缓存过期时间（毫秒）

  // 缓存
  private readonly cache = new Map<string, {
    data: SessionEntry
    loadedAt: number
  }>()

  // 日志
  private readonly logger = createLogger("SessionStore")

  constructor(options: SessionStoreOptions) {
    this.baseDir = path.resolve(options.baseDir)
    this.enableCache = options.enableCache ?? true
    this.cacheTtl = options.cacheTtl ?? 45000  // 默认 45 秒
  }

  // 核心方法
  async saveSession(sessionKey: string, messages: Message[], metadata?: Partial<SessionEntry>): Promise<void>
  async loadSession(sessionKey: string): Promise<SessionLoadResult | null>
  async deleteSession(sessionKey: string): Promise<void>
  async listSessions(): Promise<Array<{ sessionKey: string; entry: SessionEntry }>>
  async updateSessionMetadata(sessionKey: string, metadata: Partial<SessionEntry>): Promise<SessionEntry | null>
}
```

#### 9.2.3 文件锁机制

**问题**：多个进程同时写入同一个文件，会导致数据损坏

**解决方案**：文件锁（File Locking）

```
进程 A：想写入 session:123
├─ 1. 创建 session:123.md.lock 文件
├─ 2. 写入数据
├─ 3. 删除 .lock 文件
└─ ✅ 完成

进程 B：同时想写入 session:123
├─ 1. 尝试创建 session:123.md.lock
├─ 2. 发现已存在，等待...
├─ 3. 等待进程 A 完成
├─ 4. 创建 .lock 文件
├─ 5. 写入数据
└─ ✅ 完成
```

**代码实现**：

```typescript
private async withLock<T>(
  sessionKey: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockPath = `${this.resolveSessionPath(sessionKey)}.lock`
  const timeoutMs = 10000      // 10 秒超时
  const pollIntervalMs = 25    // 每 25ms 轮询一次
  const staleMs = 30000        // 30 秒清理过期锁
  const startedAt = Date.now()

  // ──────────────────────────────────────
  // 第1步：获取锁
  // ──────────────────────────────────────
  while (true) {
    try {
      // 尝试创建锁文件（独占模式）
      const handle = await fs.open(lockPath, "wx")

      // 写入锁信息
      await handle.writeFile(
        JSON.stringify({
          pid: process.pid,         // 进程 ID
          startedAt: Date.now()     // 创建时间
        }),
        "utf-8"
      )
      await handle.close()
      break  // 成功获取锁
    } catch (err: unknown) {
      // 文件已存在（EEXIST = Error: File exists）
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err

      const now = Date.now()

      // 检查超时
      if (now - startedAt > timeoutMs) {
        throw new Error(`Timeout acquiring lock for session: ${sessionKey}`)
      }

      // 检查是否为过期锁
      try {
        const stat = await fs.stat(lockPath)
        const ageMs = now - stat.mtimeMs
        if (ageMs > staleMs) {
          // 锁文件已过期，删除并重试
          await fs.unlink(lockPath)
          continue
        }
      } catch {
        // 忽略错误
      }

      // 等待一小段时间后重试
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
  }

  // ──────────────────────────────────────
  // 第2步：执行操作
  // ──────────────────────────────────────
  try {
    return await fn()
  } finally {
    // ──────────────────────────────────────
    // 第3步：释放锁（删除锁文件）
    // ──────────────────────────────────────
    await fs.unlink(lockPath).catch(() => {
      // 忽略删除错误
    })
  }
}
```

**使用文件锁**：

```typescript
async saveSession(sessionKey: string, messages: Message[]): Promise<void> {
  // 自动加锁
  await this.withLock(sessionKey, async () => {
    // 安全地写入文件
    await this.saveSessionUnlocked(sessionKey, messages)
  })
}
```

**文件锁的优势**：

1. **防止并发写入**：同一时间只有一个进程能写入
2. **自动过期**：超过 30 秒的锁会被自动清理
3. **超时保护**：等待超过 10 秒会抛出错误
4. **进程透明**：锁文件包含进程 ID，便于调试

#### 9.2.4 缓存机制

**问题**：每次加载会话都要读取文件，速度慢

**解决方案**：内存缓存（TTL 缓存）

```
第一次加载：
loadSession("user:123")
├─ 读取文件
├─ 解析 Markdown
├─ 存入缓存
└─ 返回数据

45 秒内再次加载：
loadSession("user:123")
├─ 检查缓存
├─ 缓存命中！
└─ 直接返回（无需读取文件）

45 秒后再次加载：
loadSession("user:123")
├─ 检查缓存
├─ 缓存过期
├─ 重新读取文件
└─ 更新缓存
```

**代码实现**：

```typescript
/**
 * 从缓存获取会话
 */
private getCached(sessionKey: string): SessionEntry | null {
  if (!this.enableCache) return null

  const cached = this.cache.get(sessionKey)
  if (!cached) return null

  const now = Date.now()
  if (now - cached.loadedAt > this.cacheTtl) {
    // 缓存过期
    this.cache.delete(sessionKey)
    return null
  }

  return cached.data
}

/**
 * 设置缓存
 */
private setCached(sessionKey: string, entry: SessionEntry): void {
  if (!this.enableCache) return
  this.cache.set(sessionKey, {
    data: entry,
    loadedAt: Date.now()
  })
}

/**
 * 清除缓存
 */
private clearCached(sessionKey: string): void {
  this.cache.delete(sessionKey)
}
```

**缓存使用示例**：

```typescript
async loadSession(sessionKey: string): Promise<SessionLoadResult | null> {
  // 先检查缓存
  const cachedEntry = this.getCached(sessionKey)
  if (cachedEntry) {
    // 缓存命中，但仍需加载消息内容
    const filePath = this.resolveSessionPath(sessionKey)
    const content = await fs.readFile(filePath, "utf-8")
    const messages = this.parseMessages(content)
    return { entry: cachedEntry, messages }
  }

  // 缓存未命中，读取文件
  const content = await fs.readFile(filePath, "utf-8")
  const { metadata, content: body } = this.parseMarkdown(content)
  const entry: SessionEntry = { ...metadata }
  const messages = this.parseMessages(body)

  // 更新缓存
  this.setCached(sessionKey, entry)

  return { entry, messages }
}
```

**缓存策略**：

| 策略 | 说明 |
|-----|------|
| **TTL（Time To Live）** | 45 秒后自动过期 |
| **LRU（Least Recently Used）** | 可以扩展为 LRU 缓存（当前使用 Map） |
| **容量限制** | 可以添加最大缓存条目数限制 |

#### 9.2.5 Markdown 序列化

**序列化（内存 → 文件）**：

```typescript
private serializeMarkdown(
  metadata: Partial<SessionEntry>,
  content: string
): string {
  return `---\n${stringifyYaml(metadata).trim()}\n---\n${content}`
}

private serializeMessages(messages: Message[]): string {
  return messages
    .map((m) => {
      let lines: string[] = []

      // 角色标题
      lines.push(`## ${m.role}`)

      // 工具调用（如果有）
      if (m.toolCalls && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
        lines.push(`\n### tool_calls\n`)
        lines.push(`\n${JSON.stringify(m.toolCalls, null, 2)}\n`)
      }

      // 消息内容
      if (m.content) {
        lines.push(`\n${m.content}`)
      }

      return lines.join("")
    })
    .join("\n\n")
}
```

**反序列化（文件 → 内存）**：

```typescript
private parseMarkdown(content: string): {
  metadata: Partial<SessionEntry>
  content: string
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (match) {
    const metadata = parseYaml(match[1]) as Partial<SessionEntry>
    const body = match[2]
    return { metadata, content: body }
  }

  return {
    metadata: {},
    content
  }
}

private parseMessages(content: string): Message[] {
  const messages: Message[] = []
  const messageRegex = /## (\w+)\n(\n?)([\s\S]*?)(?=\n## |\n*$)/g
  let match

  while ((match = messageRegex.exec(content)) !== null) {
    const role = match[1] as "user" | "assistant" | "system"
    const messageContent = match[3]

    // 检查是否包含 tool_calls
    const toolCallsMatch = messageContent.match(/### tool_calls\n\n([\s\S]*?)\n\n/)

    let toolCalls: any[] | undefined
    if (toolCallsMatch) {
      try {
        toolCalls = JSON.parse(toolCallsMatch[1].trim())
      } catch (error) {
        console.warn('[SessionStore] Failed to parse tool_calls:', error)
      }
    }

    // 提取实际内容（排除 tool_calls 部分）
    let actualContent = messageContent
    if (toolCallsMatch) {
      actualContent = messageContent.replace(/### tool_calls\n\n[\s\S]*?\n\n/, "").trim()
    } else {
      actualContent = messageContent.trim()
    }

    messages.push({
      role,
      content: actualContent,
      ...(toolCalls ? { toolCalls } : {}),
    } as Message)
  }

  return messages
}
```

#### 9.2.6 消息去重

**问题**：重复保存相同的消息

```typescript
// 第一次保存
await saveSession("user:123", [
  { role: "user", content: "你好" }
])
// 文件内容：1 条消息

// 第二次保存（追加）
await saveSession("user:123", [
  { role: "user", content: "你好" },  // 重复！
  { role: "assistant", content: "你好！" }
])
// 期望：2 条消息
// 实际：3 条消息（包含重复）
```

**解决方案**：消息指纹去重

```typescript
/**
 * 生成消息指纹
 */
private getMessageFingerprint(msg: Message): string {
  let contentHash = msg.content || ''

  // 包含 tool_calls
  if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
    const toolCallsStr = JSON.stringify(msg.toolCalls, Object.keys(msg.toolCalls).sort())
    contentHash += `|toolCalls:${toolCallsStr}`
  }

  // 时间戳精确到秒（避免毫秒级差异）
  const timestampSec = Math.floor((msg.timestamp || Date.now()) / 1000)

  return `${msg.role}|${contentHash}|${timestampSec}`
}

/**
 * 合并消息并去重
 */
private mergeMessagesWithoutDuplicates(
  existingMessages: Message[],
  newMessages: Message[]
): Message[] {
  if (existingMessages.length === 0) return [...newMessages]
  if (newMessages.length === 0) return [...existingMessages]

  // 创建现有消息的指纹集合
  const existingFingerprints = new Set<string>()
  for (const msg of existingMessages) {
    const fingerprint = this.getMessageFingerprint(msg)
    existingFingerprints.add(fingerprint)
  }

  // 过滤新消息
  const uniqueNewMessages: Message[] = []
  for (const msg of newMessages) {
    const fingerprint = this.getMessageFingerprint(msg)
    if (!existingFingerprints.has(fingerprint)) {
      uniqueNewMessages.push(msg)
      existingFingerprints.add(fingerprint)  // 避免新消息之间的重复
    } else {
      this.logger.debug(`Skipping duplicate message: ${fingerprint}`)
    }
  }

  return [...existingMessages, ...uniqueNewMessages]
}
```

**去重效果**：

```
现有消息：[
  { role: "user", content: "你好", timestamp: 1000 }
]
指纹：["user|你好|1"]

新消息：[
  { role: "user", content: "你好", timestamp: 1000 },  // 重复
  { role: "assistant", content: "你好！", timestamp: 2000 }
]
指纹：["user|你好|1", "assistant|你好！|2"]

去重后：[
  { role: "user", content: "你好", timestamp: 1000 },
  { role: "assistant", content: "你好！", timestamp: 2000 }
]
```

---

### 9.3 Memory Storage（记忆存储）

#### 9.3.1 核心概念

**Memory Storage 用于长期记忆和语义搜索**：

```
Session Storage vs Memory Storage：

┌─────────────────────┬─────────────────────┐
│  Session Storage    │  Memory Storage     │
├─────────────────────┼─────────────────────┤
│ 短期记忆            │ 长期记忆             │
│ 对话历史            │ 文档、笔记、代码     │
│ 精确匹配            │ 语义搜索             │
│ Markdown 文件       │ SQLite + 向量索引    │
└─────────────────────┴─────────────────────┘
```

**使用场景**：

```
用户：我昨天写的 React 组件在哪里？

AI 使用 Memory Storage：
1. 将查询转换为向量
2. 搜索相似的文档
3. 返回最相关的代码文件

AI：找到了！在你的 src/components/Button.tsx 中
```

#### 9.3.2 向量搜索原理

**什么是向量（Embedding）**？

```
文本：
"猫" → 向量化 → [0.1, -0.2, 0.3, 0.8, ...]
"狗" → 向量化 → [0.2, -0.1, 0.4, 0.7, ...]
"汽车" → 向量化 → [-0.5, 0.6, -0.3, 0.1, ...]

相似度计算：
"猫" vs "狗"     → 0.95（很相似）
"猫" vs "汽车"   → 0.23（不相似）
```

**为什么要用向量搜索**？

```
传统搜索（关键词）：
搜索："react component"
结果：只匹配包含 "react" 和 "component" 的文档

向量搜索（语义）：
搜索："react component"
结果：匹配相关文档，即使不包含关键词
- "React 组件教程"
- "如何编写 React UI 元素"
- "前端框架组件化设计"
```

#### 9.3.3 MemoryIndexManager 类结构

**源码位置**：`src/storage/memory/manager.ts`

```typescript
export class MemoryIndexManager {
  // 配置
  private readonly dbPath: string                  // SQLite 数据库路径
  private readonly workspaceDir: string            // 工作目录
  private readonly embeddingProvider: IEmbeddingProvider  // 嵌入向量提供者
  private readonly chunkConfig: ChunkConfig        // 分块配置

  // 数据库
  private db: Database.Database

  // 文件监听
  private watcher: chokidar.FSWatcher | null = null
  private watchDebounceTimer: NodeJS.Timeout | null = null
  private dirty = false  // 文件是否变化

  // 同步控制
  private syncInProgress = false
  private intervalSyncTimer?: NodeJS.Timeout

  constructor(params: {
    dbPath: string
    workspaceDir: string
    embeddingProvider: IEmbeddingProvider
    chunkConfig?: ChunkConfig
  }) {
    // 初始化数据库
    this.db = new Database(this.dbPath)
    this.db.pragma("journal_mode = WAL")
    this.db.pragma("synchronous = NORMAL")

    // 加载 sqlite-vec 扩展
    loadSqliteVec(this.db)

    // 确保数据库架构
    ensureMemoryIndexSchema({ ... })
  }

  // 核心方法
  async start(): Promise<void>                  // 启动管理器
  async stop(): Promise<void>                   // 停止管理器
  async search(query: string, limit?: number): Promise<MemorySearchResult[]>  // 搜索
  async sync(options?: { reason?: string }): Promise<number>  // 同步文件到数据库
}
```

#### 9.3.4 文件分块（Chunking）

**问题**：文档太长，无法一次性生成向量

**解决方案**：分块（Chunking）

```
原始文档（2000 字）：
────────────────────────────────────────
React 是一个用于构建用户界面的 JavaScript 库...
（省略 1800 字）
...组件化开发使得代码更易于维护。
────────────────────────────────────────

分块后（每块 500 字）：
Chunk 1: "React 是一个用于构建用户界面的 JavaScript 库..."
Chunk 2: "...它采用虚拟 DOM 技术..."
Chunk 3: "...组件化开发使得代码更易于维护。"
```

**分块配置**：

```typescript
type ChunkConfig = {
  tokens: number      // 每块的 token 数量（默认 500）
  overlap: number     // 块之间的重叠 token 数（默认 50）
}
```

**为什么要重叠？**

```
没有重叠：
Chunk 1: "React 是一个..."
Chunk 2: "...用于构建用户..."

问题：句子被切断，语义不完整

有重叠：
Chunk 1: "React 是一个用于构建用户界面的 JavaScript 库..."
Chunk 2: "用于构建用户界面的 JavaScript 库。它采用虚拟..."

优势：保持上下文连贯性
```

**分块代码**：

```typescript
export function chunkMarkdown(
  content: string,
  config: ChunkConfig
): string[] {
  const { tokens, overlap } = config
  const chunks: string[] = []

  // 简化示例：按字符分块
  // 实际实现使用更复杂的 token 计算
  let start = 0
  while (start < content.length) {
    const end = Math.min(start + tokens, content.length)
    chunks.push(content.slice(start, end))
    start = end - overlap
  }

  return chunks
}
```

#### 9.3.5 向量化与索引

**流程**：

```
1. 读取文件
   ↓
2. 分块（Chunking）
   ↓
3. 生成向量（Embedding）
   ↓
4. 存储到 SQLite（带向量索引）
```

**数据库架构**：

```sql
-- 文件表
CREATE TABLE memory_files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  title TEXT,
  mtime INTEGER,
  indexed_at INTEGER
);

-- 分块表
CREATE TABLE memory_chunks (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  FOREIGN KEY (file_id) REFERENCES memory_files(id)
);

-- 向量索引（sqlite-vec）
CREATE VIRTUAL TABLE memory_chunks_vec USING vec0(
  embedding FLOAT[1536]  -- OpenAI text-embedding-3-small 维度
);
```

**向量化代码**（简化）：

```typescript
async sync(options?: { reason?: string }): Promise<number> {
  // 1. 列出所有文件
  const files = await listMemoryFiles(this.workspaceDir)

  let indexedCount = 0

  for (const file of files) {
    // 2. 检查是否需要更新
    const existing = await this.getFileEntry(file.path)
    if (existing && existing.mtime === file.mtime) {
      continue  // 文件未变化
    }

    // 3. 读取内容
    const content = await fs.readFile(file.path, "utf-8")

    // 4. 分块
    const chunks = chunkMarkdown(content, this.chunkConfig)

    // 5. 生成向量
    const embeddings = await this.embeddingProvider.embedBatch(chunks)

    // 6. 存储到数据库
    await this.indexFile(file, chunks, embeddings)

    indexedCount++
  }

  return indexedCount
}
```

#### 9.3.6 语义搜索

**搜索流程**：

```
用户查询："React 组件"
↓
1. 向量化查询
   queryEmbedding = embed("React 组件")
   ↓
2. 向量相似度搜索
   SELECT * FROM memory_chunks_vec
   WHERE embedding MATCH queryEmbedding
   ORDER BY distance
   LIMIT 5
   ↓
3. 返回最相关的分块
```

**搜索代码**：

```typescript
async search(
  query: string,
  limit: number = 5
): Promise<MemorySearchResult[]> {
  // 1. 向量化查询
  const queryEmbedding = await this.embeddingProvider.embed(query)

  // 2. 向量搜索（使用 sqlite-vec）
  const results = this.db.prepare(`
    SELECT
      c.id,
      c.content,
      f.path,
      f.title,
      distance
    FROM memory_chunks_vec v
    JOIN memory_chunks c ON v.id = c.id
    JOIN memory_files f ON c.file_id = f.id
    WHERE v.embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `).all(queryEmbedding.embedding, limit)

  // 3. 格式化结果
  return results.map((row: any) => ({
    chunkId: row.id,
    content: row.content,
    filePath: row.path,
    fileTitle: row.title,
    distance: row.distance,  // 距离越小越相似
  }))
}
```

**搜索结果示例**：

```typescript
const results = await memoryManager.search("React 组件", 3)

// [
//   {
//     chunkId: "chunk-1",
//     content: "React 组件是构建用户界面的基本单元...",
//     filePath: "/docs/react-guide.md",
//     fileTitle: "React 指南",
//     distance: 0.15  // 很相似
//   },
//   {
//     chunkId: "chunk-2",
//     content: "组件化开发使得代码更易于维护...",
//     filePath: "/docs/best-practices.md",
//     fileTitle: "最佳实践",
//     distance: 0.28  // 相似
//   },
//   {
//     chunkId: "chunk-3",
//     content: "Vue 也是一个流行的前端框架...",
//     filePath: "/docs/vue-guide.md",
//     fileTitle: "Vue 指南",
//     distance: 0.65  // 不太相似
//   }
// ]
```

#### 9.3.7 实时监听（Hot Reload）

**问题**：文件更新后，索引如何自动同步？

**解决方案**：文件监听（chokidar）

```typescript
private enableWatch(): void {
  const memoryDir = path.join(this.workspaceDir, "memory")
  const memoryFile = path.join(this.workspaceDir, "MEMORY.md")

  // 监听文件变化
  this.watcher = chokidar.watch([memoryDir, memoryFile], {
    ignoreInitial: true,     // 忽略初始扫描
    persistent: true,        // 持续监听
    awaitWriteFinish: {
      stabilityThreshold: 100,  // 文件稳定 100ms 后触发
      pollInterval: 50,         // 每 50ms 轮询
    },
  })

  // 文件变化时标记为 dirty
  const markDirty = () => {
    this.dirty = true
    this.scheduleSync()
  }

  this.watcher
    .on("add", markDirty)      // 文件添加
    .on("change", markDirty)   // 文件修改
    .on("unlink", markDirty)   // 文件删除
}

/**
 * 延迟同步（防抖）
 */
private scheduleSync(): void {
  if (this.watchDebounceTimer) {
    clearTimeout(this.watchDebounceTimer)
  }

  // 等待 1 秒后同步（避免频繁同步）
  this.watchDebounceTimer = setTimeout(async () => {
    if (this.dirty && !this.syncInProgress) {
      await this.sync({ reason: "watch" })
      this.dirty = false
    }
  }, 1000)
}
```

**流程**：

```
1. 用户修改文件
   ↓
2. chokidar 检测到变化
   ↓
3. 标记 dirty = true
   ↓
4. 等待 1 秒（防抖）
   ↓
5. 自动同步到数据库
   ↓
6. 重新生成向量索引
```

---

### 9.4 本章小结

**核心要点**：

1. ✅ **Storage 层架构**：Session Storage（短期记忆）+ Memory Storage（长期记忆）
2. ✅ **Session Store**：Markdown 格式、文件锁、缓存机制、消息去重
3. ✅ **Memory Store**：向量搜索、文件分块、实时监听、SQLite + sqlite-vec
4. ✅ **文件锁**：防止并发写入，支持自动过期和超时
5. ✅ **缓存策略**：TTL 缓存（45 秒），减少文件 I/O
6. ✅ **Markdown 序列化**：frontmatter 元数据 + 正文内容
7. ✅ **语义搜索**：Embedding 向量化 + sqlite-vec 相似度搜索

**Storage 层对比**：

| 特性 | Session Storage | Memory Storage |
|-----|----------------|----------------|
| **用途** | 对话历史 | 长期知识 |
| **存储格式** | Markdown 文件 | SQLite + 向量索引 |
| **访问方式** | 精确匹配（sessionKey） | 语义搜索（相似度） |
| **生命周期** | 短期（会话级） | 长期（持久化） |
| **核心技术** | 文件锁 + 缓存 | 分块 + Embedding + 向量搜索 |

**完整流程示例**：

```typescript
// 1. 创建 Session Store
const sessionStore = new SessionStore({
  baseDir: "./data/sessions",
  enableCache: true,
  cacheTtl: 45000
})

// 2. 创建 Memory Store
const memoryStore = new MemoryIndexManager({
  dbPath: "./data/memory.db",
  workspaceDir: "./workspace",
  embeddingProvider: new OpenAIProvider(),
  chunkConfig: { tokens: 500, overlap: 50 }
})

// 3. 保存对话
await sessionStore.saveSession("user:123", [
  { role: "user", content: "我叫小明" },
  { role: "assistant", content: "你好小明！" }
])

// 4. 加载对话
const session = await sessionStore.loadSession("user:123")
console.log(session.messages)  // 2 条消息

// 5. 启动 Memory Store
await memoryStore.start()  // 自动索引文件

// 6. 语义搜索
const results = await memoryStore.search("React 组件", 5)
console.log(results)  // 最相关的 5 个分块

// 7. 停止
await memoryStore.stop()
```

---

**✅ 第9章完成！字数：~4800**

---

## 第10章：Scheduler 并发控制

> **本章目标**：深入理解 Krebs 的 Lane 调度系统，掌握并发控制和任务队列管理
>
> **难度**：⭐⭐⭐
>
> **预计阅读时间**：30 分钟

### 10.1 为什么需要并发控制？

#### 10.1.1 问题场景

**场景 1：无并发控制（❌ 危险）**

```typescript
// 用户发送 100 个请求
for (let i = 0; i < 100; i++) {
  agent.process(`消息 ${i}`)
}

// 结果：
// - 同时发起 100 个 API 请求
// - 可能触发 API 速率限制（Rate Limit）
// - 内存消耗激增
// - 可能导致服务崩溃
```

**场景 2：有并发控制（✅ 安全）**

```typescript
// 设置最大并发数为 5
setConcurrency("agent", 5)

// 用户发送 100 个请求
for (let i = 0; i < 100; i++) {
  enqueueInLane("agent", () => agent.process(`消息 ${i}`))
}

// 结果：
// - 同一时间最多 5 个请求在执行
// - 其他请求排队等待
// - 避免触发速率限制
// - 内存消耗可控
```

#### 10.1.2 并发控制的应用

**Krebs 中的并发控制场景**：

| 场景 | Lane 名称 | 最大并发 | 说明 |
|-----|----------|---------|------|
| **Agent 处理** | `agent` | 1-5 | 限制同时处理的 Agent 请求数 |
| **Cron 任务** | `cron` | 1 | 定时任务，同一时间只执行一个 |
| **主队列** | `main` | 10 | 通用任务队列 |
| **嵌套调用** | `nested` | 5 | Agent 内部嵌套调用 |

---

### 10.2 Lane 调度系统架构

#### 10.2.1 核心概念

**Lane（车道）**：
- 类似于高速公路的车道
- 每个 Lane 有独立的队列和并发控制
- 不同 Lane 之间互不影响

**可视化**：

```
┌─────────────────────────────────────────────┐
│           Lane Manager                      │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │  Agent  │  │  Cron   │  │  Main   │     │
│  │  Lane   │  │  Lane   │  │  Lane   │     │
│  ├─────────┤  ├─────────┤  ├─────────┤     │
│  │ Queue:  │  │ Queue:  │  │ Queue:  │     │
│  │ [Task1] │  │ [Task1] │  │ [Task1] │     │
│  │ [Task2] │  │ [Task2] │  │ [Task2] │     │
│  │ [Task3] │  │         │  │ [Task3] │     │
│  │         │  │         │  │         │     │
│  │ Active: │  │ Active: │  │ Active: │     │
│  │  2/5    │  │  0/1    │  │  3/10   │     │
│  └─────────┘  └─────────┘  └─────────┘     │
│                                             │
└─────────────────────────────────────────────┘

每个 Lane 独立运行：
- Agent Lane: 最多 5 个并发
- Cron Lane: 最多 1 个并发（串行）
- Main Lane: 最多 10 个并发
```

#### 10.2.2 数据结构

**源码位置**：`src/scheduler/lanes.ts`

```typescript
/**
 * Lane 枚举
 */
export enum CommandLane {
  Main = "main",       // 主队列
  Cron = "cron",       // 定时任务
  Agent = "agent",     // Agent 处理
  Nested = "nested",   // 嵌套调用
}

/**
 * 队列条目
 */
export interface QueueEntry {
  task: () => Promise<unknown>      // 要执行的任务
  resolve: (value: unknown) => void // 成功回调
  reject: (reason?: unknown) => void // 失败回调
  enqueuedAt: number                 // 入队时间戳
  warnAfterMs: number                // 等待警告时间
}

/**
 * Lane 状态
 */
export interface LaneState {
  lane: string                // Lane 名称
  queue: QueueEntry[]         // 任务队列
  active: number              // 当前活跃任务数
  maxConcurrent: number       // 最大并发数
  draining: boolean           // 是否正在排空队列
}
```

---

### 10.3 LaneManager 核心实现

#### 10.3.1 类结构

```typescript
class LaneManager {
  // 所有 Lane 的状态
  private lanes = new Map<string, LaneState>()

  /**
   * 获取或创建 Lane 状态
   */
  getLaneState(lane: string): LaneState {
    const existing = this.lanes.get(lane)
    if (existing) return existing

    // 创建新 Lane
    const created: LaneState = {
      lane,
      queue: [],
      active: 0,
      maxConcurrent: 1,  // 默认并发为 1
      draining: false,
    }
    this.lanes.set(lane, created)
    return created
  }

  /**
   * 设置并发数
   */
  setConcurrency(lane: string, maxConcurrent: number): void {
    const cleaned = lane.trim() || CommandLane.Main
    const state = this.getLaneState(cleaned)
    state.maxConcurrent = Math.max(1, Math.floor(maxConcurrent))
    this.drainLane(cleaned)  // 触发队列排空
  }

  /**
   * 入队任务
   */
  enqueue<T>(
    lane: string,
    task: () => Promise<T>,
    opts?: { warnAfterMs?: number }
  ): Promise<T>

  /**
   * 获取队列大小
   */
  getQueueSize(lane?: string): number

  /**
   * 清空队列
   */
  clearLane(lane?: string): number
}
```

#### 10.3.2 入队（Enqueue）

**代码实现**：

```typescript
enqueue<T>(
  lane: string,
  task: () => Promise<T>,
  opts?: { warnAfterMs?: number }
): Promise<T> {
  // 1. 清理 Lane 名称
  const cleaned = lane.trim() || CommandLane.Main
  const warnAfterMs = opts?.warnAfterMs ?? 2000  // 默认 2 秒

  // 2. 获取 Lane 状态
  const state = this.getLaneState(cleaned)

  // 3. 返回 Promise（任务完成时 resolve）
  return new Promise<T>((resolve, reject) => {
    // 4. 添加到队列
    state.queue.push({
      task: () => task(),
      resolve: (value) => resolve(value as T),
      reject,
      enqueuedAt: Date.now(),
      warnAfterMs,
    })

    // 5. 记录日志
    log.debug(`[${cleaned}] Enqueued: ${state.queue.length + state.active}`)

    // 6. 触发队列排空
    this.drainLane(cleaned)
  })
}
```

**使用示例**：

```typescript
// 示例 1：简单入队
const result = await enqueueInLane("agent", async () => {
  return await agent.process("Hello")
})

// 示例 2：带警告时间
const result = await enqueueInLane("agent", async () => {
  return await agent.process("Hello")
}, { warnAfterMs: 5000 })  // 等待超过 5 秒会警告

// 示例 3：使用默认 Lane
const result = await enqueue(async () => {
  return await someTask()
})
```

#### 10.3.3 队列排空（Drain）

**核心逻辑**：

```typescript
private drainLane(lane: string): void {
  const state = this.getLaneState(lane)

  // 防止重复排空
  if (state.draining) return
  state.draining = true

  // 递归执行任务的函数
  const pump = () => {
    // 循环：只要还有空位且队列不为空
    while (state.active < state.maxConcurrent && state.queue.length > 0) {
      // 1. 从队列头部取出任务
      const entry = state.queue.shift() as QueueEntry

      // 2. 检查等待时间
      const waitedMs = Date.now() - entry.enqueuedAt
      if (waitedMs >= entry.warnAfterMs) {
        log.warn(
          `[${lane}] Wait exceeded: ${waitedMs}ms, ` +
          `queued: ${state.queue.length}`
        )
      }

      // 3. 增加活跃计数
      state.active += 1

      // 4. 异步执行任务
      void (async () => {
        const startTime = Date.now()
        try {
          // 执行任务
          const result = await entry.task()

          // 任务完成
          state.active -= 1
          log.debug(
            `[${lane}] Task done: ${Date.now() - startTime}ms, ` +
            `active: ${state.active}, queued: ${state.queue.length}`
          )

          // 触发下一个任务
          pump()

          // 返回结果
          entry.resolve(result)
        } catch (err) {
          // 任务失败
          state.active -= 1
          log.error(
            `[${lane}] Task error: ${Date.now() - startTime}ms, ` +
            `error: ${String(err)}`
          )

          // 触发下一个任务
          pump()

          // 返回错误
          entry.reject(err)
        }
      })()
    }

    // 队列排空完成
    state.draining = false
  }

  // 启动排空
  pump()
}
```

**流程图**：

```
drainLane() 被调用
↓
标记 draining = true
↓
pump() 开始
↓
┌─────────────────────────────┐
│ while (active < max && queue.length > 0) │
├─────────────────────────────┤
│ 1. 从队列取出任务            │
│ 2. 检查等待时间              │
│ 3. active++                  │
│ 4. 异步执行任务              │
│    ├─ 成功: active--, pump() │
│    └─ 失败: active--, pump() │
└─────────────────────────────┘
↓
draining = false
```

#### 10.3.4 并发控制原理

**示例**：`maxConcurrent = 2`

```
初始状态：
active = 0, queue = [Task1, Task2, Task3, Task4]

第 1 次循环：
- Task1 取出，active = 1
- 异步执行 Task1

第 2 次循环：
- Task2 取出，active = 2
- 异步执行 Task2
- active == maxConcurrent，停止循环

Task1 完成（2 秒后）：
- active = 1
- pump() 重新触发
- Task3 取出，active = 2

Task2 完成（3 秒后）：
- active = 1
- pump() 重新触发
- Task4 取出，active = 2

最终：
active = 2
queue = []
所有任务执行完成
```

**关键点**：

1. **非阻塞**：`pump()` 不会等待任务完成
2. **自动触发**：任务完成后自动调用 `pump()` 执行下一个
3. **并发控制**：`active < maxConcurrent` 限制同时执行的任务数

---

### 10.4 使用示例

#### 10.4.1 基本 API 调用

```typescript
import { enqueueInLane, setConcurrency, CommandLane } from "@/scheduler/lanes.js"

// 1. 设置 Agent Lane 的并发数为 3
setConcurrency(CommandLane.Agent, 3)

// 2. 提交 10 个任务
const tasks = []
for (let i = 0; i < 10; i++) {
  const promise = enqueueInLane(CommandLane.Agent, async () => {
    console.log(`Task ${i} started`)
    await new Promise(resolve => setTimeout(resolve, 1000))
    console.log(`Task ${i} completed`)
    return `Result ${i}`
  })
  tasks.push(promise)
}

// 3. 等待所有任务完成
const results = await Promise.all(tasks)
console.log(results)
```

**执行效果**：

```
Task 0 started
Task 1 started
Task 2 started
（等待 1 秒）
Task 0 completed
Task 3 started
Task 1 completed
Task 4 started
Task 2 completed
Task 5 started
...
```

**时间线**：

```
0s:  Task 0, Task 1, Task 2 开始（active = 3，达到上限）
1s:  Task 0 完成，Task 3 开始
2s:  Task 1 完成，Task 4 开始
3s:  Task 2 完成，Task 5 开始
...

总耗时：~4 秒（10 个任务，并发 3，约 10/3 ≈ 4 轮）
```

#### 10.4.2 Agent 集成

**在 Agent 中使用 Lane**：

```typescript
// src/agent/core/agent.ts

export class Agent {
  constructor(
    private config: AgentConfig,
    private deps: AgentDeps
  ) {
    // 设置并发数
    const concurrency = config.concurrency ?? 1
    setConcurrency(CommandLane.Agent, concurrency)
  }

  async process(message: string, userId: string): Promise<AgentResponse> {
    // 使用 Lane 队列
    return enqueueInLane(CommandLane.Agent, async () => {
      // 实际的 Agent 处理逻辑
      return this.processInternal(message, userId)
    })
  }

  private async processInternal(message: string, userId: string) {
    // 加载会话
    const session = await this.deps.storage?.loadSession(userId)

    // 调用 LLM
    const response = await this.deps.provider.chat(messages, options)

    // 保存会话
    await this.deps.storage?.saveSession(userId, messages)

    return response
  }
}
```

**效果**：

```typescript
// 创建并发数为 5 的 Agent
const agent = new Agent(
  { model: 'claude-3-5-sonnet-20241022', concurrency: 5 },
  { provider, storage }
)

// 同时发起 20 个请求
const promises = []
for (let i = 0; i < 20; i++) {
  promises.push(agent.process(`Message ${i}`, 'user:123'))
}

await Promise.all(promises)

// 结果：
// - 同一时间最多 5 个请求在处理
// - 其他请求排队等待
// - 避免触发 API 速率限制
```

#### 10.4.3 Cron 任务（串行执行）

```typescript
// 设置 Cron Lane 并发为 1（串行）
setConcurrency(CommandLane.Cron, 1)

// 提交多个定时任务
async function runCronJobs() {
  await enqueueInLane(CommandLane.Cron, async () => {
    console.log("Cron 1: 清理过期会话")
    await cleanupExpiredSessions()
  })

  await enqueueInLane(CommandLane.Cron, async () => {
    console.log("Cron 2: 同步 Memory 索引")
    await syncMemoryIndex()
  })

  await enqueueInLane(CommandLane.Cron, async () => {
    console.log("Cron 3: 发送日报")
    await sendDailyReport()
  })
}

// 执行效果：
// Cron 1 → Cron 2 → Cron 3（串行，一个接一个）
```

#### 10.4.4 嵌套调用（Nested Lane）

**场景**：Agent 处理过程中需要调用其他 Agent

```typescript
// 主 Agent
async function mainAgent(message: string) {
  return enqueueInLane(CommandLane.Agent, async () => {
    // 调用子 Agent
    const result1 = await enqueueInLane(CommandLane.Nested, async () => {
      return await subAgent1(message)
    })

    const result2 = await enqueueInLane(CommandLane.Nested, async () => {
      return await subAgent2(message)
    })

    return { result1, result2 }
  })
}

// 设置并发
setConcurrency(CommandLane.Agent, 5)   // 主 Agent 最多 5 个
setConcurrency(CommandLane.Nested, 10) // 嵌套调用最多 10 个

// 效果：
// - 最多 5 个主 Agent 并发
// - 每个主 Agent 内部可以有 10 个嵌套调用
```

---

### 10.5 高级特性

#### 10.5.1 队列监控

```typescript
import { getQueueSize, CommandLane } from "@/scheduler/lanes.js"

// 获取队列大小
const agentQueueSize = getQueueSize(CommandLane.Agent)
console.log(`Agent Lane: ${agentQueueSize} tasks`)

// 输出：
// Agent Lane: 15 tasks (3 active + 12 queued)

// 定期监控
setInterval(() => {
  const sizes = {
    agent: getQueueSize(CommandLane.Agent),
    cron: getQueueSize(CommandLane.Cron),
    main: getQueueSize(CommandLane.Main),
  }
  console.log("Queue sizes:", sizes)
}, 5000)
```

#### 10.5.2 清空队列

```typescript
import { clearLane, CommandLane } from "@/scheduler/lanes.js"

// 清空 Agent Lane 的队列
const cleared = clearLane(CommandLane.Agent)
console.log(`Cleared ${cleared} tasks`)

// 使用场景：需要紧急停止某些任务
async function handleEmergency() {
  // 1. 清空队列（停止新任务）
  clearLane(CommandLane.Agent)

  // 2. 等待当前活跃任务完成
  await waitForActiveTasks()

  console.log("All Agent tasks stopped")
}
```

#### 10.5.3 等待警告

```typescript
// 设置自定义警告时间
const result = await enqueueInLane(CommandLane.Agent, async () => {
  return await longRunningTask()
}, { warnAfterMs: 10000 })  // 等待超过 10 秒会警告

// 日志输出：
// [Agent] Wait exceeded: 12500ms, queued: 8
```

---

### 10.6 并发控制最佳实践

#### 10.6.1 设置合理的并发数

**原则**：

| 场景 | 推荐并发数 | 原因 |
|-----|----------|------|
| **API 调用** | 5-10 | 避免触发速率限制 |
| **CPU 密集型** | CPU 核心数 | 避免过度抢占 CPU |
| **I/O 密集型** | 20-50 | 可以提高并发 |
| **串行任务** | 1 | 保证顺序执行 |

**计算公式**：

```typescript
// API 并发数
const apiConcurrency = Math.min(
  Math.floor(rateLimitPerMinute / averageRequestsPerTask),
  10
)

// CPU 密集型并发数
const cpuConcurrency = os.cpus().length

// I/O 密集型并发数
const ioConcurrency = 50
```

#### 10.6.2 监控和调优

```typescript
// 监控队列大小和等待时间
class QueueMonitor {
  private intervals: NodeJS.Timeout[] = []

  start() {
    const interval = setInterval(() => {
      const agentSize = getQueueSize(CommandLane.Agent)
      if (agentSize > 50) {
        console.warn(`Agent queue too large: ${agentSize}`)
        // 考虑增加并发数或优化任务
      }
    }, 10000)

    this.intervals.push(interval)
  }

  stop() {
    this.intervals.forEach(clearInterval)
  }
}

// 使用
const monitor = new QueueMonitor()
monitor.start()

// 动态调整并发
function adjustConcurrency() {
  const queueSize = getQueueSize(CommandLane.Agent)
  if (queueSize > 100) {
    setConcurrency(CommandLane.Agent, 10)  // 增加并发
  } else if (queueSize < 10) {
    setConcurrency(CommandLane.Agent, 3)   // 减少并发
  }
}
```

#### 10.6.3 错误处理

```typescript
// 错误重试
await enqueueInLane(CommandLane.Agent, async () => {
  return await retry(async () => {
    return await flakyOperation()
  }, { maxRetries: 3 })
})

// 超时控制
await enqueueInLane(CommandLane.Agent, async () => {
  return await withTimeout(async () => {
    return await slowOperation()
  }, 30000)  // 30 秒超时
})

// 优雅降级
await enqueueInLane(CommandLane.Agent, async () => {
  try {
    return await primaryOperation()
  } catch (error) {
    console.warn("Primary failed, using fallback")
    return await fallbackOperation()
  }
})
```

---

### 10.7 本章小结

**核心要点**：

1. ✅ **并发控制**：限制同时执行的任务数，避免资源耗尽
2. ✅ **Lane 系统**：独立的队列和并发控制，互不影响
3. ✅ **入队（Enqueue）**：将任务添加到队列，返回 Promise
4. ✅ **排空（Drain）**：自动执行队列中的任务，控制并发数
5. ✅ **QueueEntry**：包含任务、回调、入队时间、警告时间
6. ✅ **LaneState**：包含队列、活跃数、最大并发、排空状态
7. ✅ **实用 API**：`enqueueInLane`、`setConcurrency`、`getQueueSize`、`clearLane`

**Lane 调度系统优势**：

| 优势 | 说明 |
|-----|------|
| **避免速率限制** | 控制并发请求数 |
| **资源控制** | 限制内存和 CPU 使用 |
| **任务隔离** | 不同 Lane 互不影响 |
| **自动管理** | 任务完成后自动触发下一个 |
| **可监控** | 队列大小、等待时间可见 |

**完整使用示例**：

```typescript
import {
  enqueueInLane,
  setConcurrency,
  getQueueSize,
  clearLane,
  CommandLane
} from "@/scheduler/lanes.js"

// 1. 配置并发
setConcurrency(CommandLane.Agent, 5)
setConcurrency(CommandLane.Cron, 1)
setConcurrency(CommandLane.Main, 10)

// 2. 提交任务
const tasks = []
for (let i = 0; i < 20; i++) {
  tasks.push(
    enqueueInLane(CommandLane.Agent, async () => {
      return await agent.process(`Message ${i}`)
    })
  )
}

// 3. 监控队列
console.log("Queue size:", getQueueSize(CommandLane.Agent))

// 4. 等待完成
const results = await Promise.all(tasks)

// 5. 清空队列（如果需要）
clearLane(CommandLane.Agent)
```

---

**✅ 第10章完成！字数：~3800**

---

## 第11章：Agent 核心（智能体）

> **本章目标**：深入理解 Krebs 的 Agent 核心实现，掌握 Tool Calling 循环和上下文管理
>
> **难度**：⭐⭐⭐⭐⭐
>
> **预计阅读时间**：45 分钟

### 11.1 Agent 是什么？

#### 11.1.1 定义

**Agent（智能体）**：
- 一个能够理解用户意图并执行任务的 AI 实体
- 通过 LLM（大语言模型）进行推理
- 通过 Tools（工具）执行实际操作
- 通过 Memory（记忆）保存上下文

**类比**：

```
传统 Chatbot：
用户 → API → LLM → 回复
（只能聊天，无法执行操作）

AI Agent：
用户 → Agent → LLM → Tools → 执行结果 → LLM → 回复
（可以执行复杂任务）
```

**Krebs Agent 的能力**：

```
┌─────────────────────────────────────┐
│          Krebs Agent                │
├─────────────────────────────────────┤
│ 🧠 LLM 对话管理                     │
│    - 理解用户意图                    │
│    - 生成回复                        │
│    - 决策是否使用工具                │
├─────────────────────────────────────┤
│ 🔧 工具执行（Tool Calling）         │
│    - 文件读写                        │
│    - 搜索                            │
│    - 代码执行                        │
│    - 自定义工具                      │
├─────────────────────────────────────┤
│ 💾 历史记录（Session Storage）       │
│    - 保存对话历史                    │
│    - 上下文压缩                      │
│    - 记忆注入                        │
├─────────────────────────────────────┤
│ 🌊 流式响应                          │
│    - 实时输出                        │
│    - 逐字显示                        │
└─────────────────────────────────────┘
```

#### 11.1.2 Agent 核心流程

**完整流程图**：

```
用户发送消息
    ↓
┌─────────────────────────────────────┐
│ 1. 加载历史记录                      │
│    - 从 Session Storage 加载         │
│    - 注入相关记忆（Memory Service）   │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ 2. 构建消息列表                       │
│    - System Prompt                   │
│    - 历史消息（压缩后）               │
│    - 当前用户消息                    │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ 3. Tool Calling 循环                 │
│                                     │
│    ┌──────────────────────────┐     │
│    │ 3.1 调用 LLM             │     │
│    │     - 生成回复或工具调用  │     │
│    └──────────────────────────┘     │
│              ↓                       │
│    ┌──────────────────────────┐     │
│    │ 3.2 检查是否有 tool_calls │     │
│    │     ├─ 有 → 执行工具      │     │
│    │     │        ↓            │     │
│    │     │     继续循环         │     │
│    │     └─ 没有 → 返回回复    │     │
│    └──────────────────────────┘     │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ 4. 保存对话历史                       │
│    - 压缩上下文（如果需要）           │
│    - 保存到 Session Storage          │
│    - 异步保存到 Memory               │
└─────────────────────────────────────┘
    ↓
返回结果给用户
```

---

### 11.2 Agent 类结构

#### 11.2.1 核心接口

**源码位置**：`src/agent/core/agent.ts`

```typescript
/**
 * Agent 配置
 */
export interface AgentConfig {
  model: string              // 模型名称，例如 'claude-3-5-sonnet-20241022'
  systemPrompt?: string      // 系统 Prompt
  maxTokens?: number         // 最大 token 数
  temperature?: number       // 温度参数
  concurrency?: number       // 并发数（默认 1）
}

/**
 * Agent 依赖（依赖注入）
 */
export interface AgentDeps {
  provider: LLMProvider      // LLM 提供者
  storage?: {                // Session Storage（可选）
    saveSession: (sessionId: string, messages: Message[]) => Promise<void>
    loadSession: (sessionId: string) => Promise<Message[] | null>
  }
  tools?: Tool[]             // 工具列表（可选）
  toolConfig?: ToolConfig    // 工具配置（可选）
  skillsManager?: any        // 技能管理器（可选）
  memoryService?: any        // 记忆服务（可选）
}

/**
 * Agent 结果
 */
export interface AgentResult {
  response: string           // 最终回复
  payloads?: any[]           // Payload 列表（用于技能系统）
  usage?: {                  // Token 使用情况
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Agent 核心类
 */
export class Agent {
  private readonly config: AgentConfig
  private readonly deps: AgentDeps
  private readonly maxIterations: number  // 最大迭代次数（防止无限循环）

  constructor(config: AgentConfig, deps: AgentDeps) {
    this.config = config
    this.deps = deps
    this.maxIterations = deps.toolConfig?.maxIterations ?? 1000
  }

  /**
   * 处理用户消息（主要入口）
   */
  async process(userMessage: string, sessionId: string): Promise<AgentResult>

  /**
   * 流式处理
   */
  async processStream(
    userMessage: string,
    sessionId: string,
    onChunk: (chunk: string) => void
  ): Promise<AgentResult>
}
```

#### 11.2.2 依赖注入设计

**为什么使用依赖注入？**

```typescript
// ❌ 不使用依赖注入（硬编码）
export class Agent {
  private provider = new AnthropicProvider()  // 硬编码
  private storage = new SessionStore()        // 硬编码

  async process(message: string) {
    // 无法替换 provider 或 storage
  }
}

// ✅ 使用依赖注入（灵活）
export class Agent {
  constructor(private deps: AgentDeps) {}  // 外部注入

  async process(message: string) {
    // 可以随意替换 provider、storage 等
  }
}

// 使用时注入
const agent = new Agent(config, {
  provider: new AnthropicProvider(),  // 可选 Anthropic
  // provider: new OpenAIProvider(),  // 或 OpenAI
  storage: new SessionStore(),
  tools: [readTool, writeTool],
})
```

**优势**：

1. **灵活性**：可以替换不同的 Provider、Storage
2. **可测试性**：可以 Mock 依赖进行单元测试
3. **解耦**：Agent 不依赖具体实现

---

### 11.3 Tool Calling 循环详解

#### 11.3.1 什么是 Tool Calling？

**定义**：LLM 可以主动调用外部工具（函数），而不仅仅是生成文本

**示例**：

```
用户：帮我读取 README.md 文件

传统 Chatbot：
"我没有文件访问权限，无法读取文件。"

AI Agent（Tool Calling）：
LLM 决定：需要调用 read_file 工具
↓
执行工具：read_file("README.md")
↓
工具返回：文件内容
↓
LLM 根据文件内容生成回复：
"README.md 文件的内容是..."
```

**工具调用流程**：

```
┌─────────────────────────────────────────┐
│ 第 1 轮：LLM 决策                       │
├─────────────────────────────────────────┤
│ 用户：帮我读取 README.md                 │
│ LLM：我需要调用 read_file 工具          │
│      tool_calls: [                      │
│        {                                 │
│          id: "call_123",                │
│          name: "read_file",             │
│          arguments: {                   │
│            "path": "README.md"          │
│          }                               │
│        }                                 │
│      ]                                   │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│ 第 2 轮：执行工具                        │
├─────────────────────────────────────────┤
│ Agent：执行 read_file("README.md")      │
│ 工具返回：{                             │
│   "tool_call_id": "call_123",           │
│   "result": "# Project README\n..."    │
│ }                                       │
└─────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────┐
│ 第 3 轮：LLM 生成最终回复                │
├─────────────────────────────────────────┤
│ LLM：根据工具结果生成回复                │
│      "README.md 的内容是：..."          │
└─────────────────────────────────────────┘
```

#### 11.3.2 Tool Calling 循环代码实现

**核心代码**（简化版）：

```typescript
/**
 * 处理用户消息（带 Tool Calling 循环）
 */
private async processWithTools(
  userMessage: string,
  sessionId: string
): Promise<AgentResult> {

  // ──────────────────────────────────────
  // 第1步：加载历史记录
  // ──────────────────────────────────────
  const history = await this.loadHistory(sessionId)

  // ──────────────────────────────────────
  // 第2步：构建消息列表
  // ──────────────────────────────────────
  const messagesForLLM = [
    { role: "system", content: this.buildSystemPrompt() },
    ...history,  // 历史消息（可能已压缩）
    { role: "user", content: userMessage }
  ]

  // ──────────────────────────────────────
  // 第3步：Tool Calling 循环
  // ──────────────────────────────────────
  let currentMessages = [...messagesForLLM]
  let iteration = 0
  const allMessages: Message[] = []      // 保存所有中间消息
  const allToolResults: any[] = []       // 收集所有工具结果

  // 记录开始时间（超时控制）
  const startTime = Date.now()
  const timeoutMs = this.deps.toolConfig?.timeoutMs ?? 600000  // 默认 10 分钟

  while (iteration < this.maxIterations) {
    iteration++

    // 检查超时
    const elapsedMs = Date.now() - startTime
    if (elapsedMs > timeoutMs) {
      throw new Error(
        `Tool calling timeout (${timeoutMs}ms) reached after ${iteration} iterations`
      )
    }

    // ──────────────────────────────────────
    // 第3.1步：调用 LLM
    // ──────────────────────────────────────
    const response = await this.callLLM(currentMessages)

    // ──────────────────────────────────────
    // 第3.2步：检查是否有 tool_calls
    // ──────────────────────────────────────
    if (response.toolCalls && response.toolCalls.length > 0) {
      // 有工具调用，执行工具

      // 保存 assistant 的工具调用消息
      const assistantToolMessage: Message = {
        role: "assistant",
        content: response.content || "",
        timestamp: Date.now(),
        toolCalls: response.toolCalls,
      }
      allMessages.push(assistantToolMessage)

      // 执行工具调用
      const toolResults = await this.executeToolCalls(response.toolCalls)
      allToolResults.push(...toolResults)

      // 将工具调用消息添加到当前消息列表
      currentMessages.push(assistantToolMessage)

      // 添加每个工具的结果到消息列表
      for (const toolResult of toolResults) {
        const toolResultMessage: Message = {
          role: "user",
          content: JSON.stringify({
            toolCallId: toolResult.id,
            toolName: toolResult.name,
            result: toolResult.result,
          }),
          timestamp: Date.now(),
        }
        allMessages.push(toolResultMessage)
        currentMessages.push(toolResultMessage)
      }

      // 继续循环，让 LLM 根据工具结果生成最终回复
      continue
    }

    // ──────────────────────────────────────
    // 第3.3步：没有 tool_calls，这是最终回复
    // ──────────────────────────────────────
    const finalMessage = {
      role: "assistant" as const,
      content: response.content || "",
      timestamp: Date.now(),
    }
    allMessages.push(finalMessage)

    // ──────────────────────────────────────
    // 第4步：保存对话历史
    // ──────────────────────────────────────
    await this.saveHistory(sessionId, allMessages)

    // 返回结果
    return {
      response: response.content || "",
      payloads: buildPayloads({ ... }),
      usage: response.usage,
    }
  }

  // 达到最大迭代次数
  throw new Error(`Max iterations (${this.maxIterations}) reached`)
}
```

#### 11.3.3 工具执行

**代码实现**：

```typescript
/**
 * 执行工具调用
 */
private async executeToolCalls(toolCalls: any[]): Promise<any[]> {
  const results = []

  for (const toolCall of toolCalls) {
    const { id, name, arguments: args } = toolCall

    try {
      // 查找工具
      const tool = this.deps.tools?.find(t => t.name === name)
      if (!tool) {
        throw new Error(`Tool not found: ${name}`)
      }

      // 执行工具
      console.log(`[Agent] Executing tool: ${name}`, args)
      const result = await tool.execute(args)

      // 保存结果
      results.push({
        id,
        name,
        result,
      })

    } catch (error: any) {
      // 工具执行失败
      console.error(`[Agent] Tool execution failed: ${name}`, error)
      results.push({
        id,
        name,
        error: error?.message || String(error),
      })
    }
  }

  return results
}
```

**工具定义示例**：

```typescript
// 定义一个读取文件工具
const readFileTool: Tool = {
  name: "read_file",
  description: "读取文件内容",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "文件路径"
      }
    },
    required: ["path"]
  },

  async execute(args: { path: string }) {
    const content = await fs.readFile(args.path, "utf-8")
    return { content }
  }
}

// 使用
const agent = new Agent(config, {
  provider: new AnthropicProvider(),
  tools: [readFileTool]
})
```

#### 11.3.4 多轮 Tool Calling

**场景**：LLM 需要连续调用多个工具

```
用户：帮我分析 README.md 并在文件末尾添加总结

第 1 轮：
LLM：调用 read_file("README.md")
工具：返回文件内容

第 2 轮：
LLM：调用 write_file("README.md", 新内容)
工具：写入成功

第 3 轮：
LLM：生成最终回复
"已成功为 README.md 添加总结"
```

**代码自动处理**：

```typescript
// 代码会自动循环，直到 LLM 不再调用工具
while (iteration < maxIterations) {
  const response = await this.callLLM(currentMessages)

  if (response.toolCalls && response.toolCalls.length > 0) {
    // 执行工具
    await this.executeToolCalls(response.toolCalls)
    // 继续循环
    continue
  }

  // 没有工具调用，退出循环
  break
}
```

---

### 11.4 上下文管理

#### 11.4.1 历史记录加载

**代码实现**：

```typescript
/**
 * 加载历史记录
 */
private async loadHistory(sessionId: string): Promise<Message[]> {
  if (!this.deps.storage) {
    return []
  }

  const history = await this.deps.storage.loadSession(sessionId)
  return history || []
}
```

#### 11.4.2 记忆注入（Memory Service）

**功能**：自动从 Memory Storage 检索相关记忆并注入

```typescript
// 如果有 MemoryService，自动注入相关记忆
if (this.deps.memoryService) {
  // 1. 提取最近的消息用于搜索查询
  const recentMessages = history.slice(-5)

  // 2. 构建完整的消息列表
  const fullMessages = [
    ...history,
    { role: "user", content: userMessage }
  ]

  // 3. 自动注入相关记忆
  const enhanced = await this.deps.memoryService.injectRelevantMemories(
    fullMessages,
    recentMessages
  )

  // 4. 智能上下文压缩
  const compressedEnhanced = await this.compressHistoryIfNeeded(enhanced)

  // 5. 添加 system prompt
  messagesForLLM = [
    { role: "system", content: this.buildSystemPrompt() },
    ...compressedEnhanced,
  ]
}
```

**效果**：

```
用户：我昨天写的 React 组件在哪里？

没有记忆注入：
LLM：我不知道你昨天写了什么。

有记忆注入：
Memory Service：检索到相关记忆
- "用户创建了 src/components/Button.tsx"
- "组件包含 props: onClick, disabled"

LLM：你昨天创建的 React 组件在 src/components/Button.tsx
```

#### 11.4.3 上下文压缩

**问题**：对话历史过长，超出模型上下文限制

**解决方案**：自动压缩

```typescript
/**
 * 智能压缩历史记录
 */
private async compressHistoryIfNeeded(messages: Message[]): Promise<Message[]> {
  // 1. 估算 token 数
  const estimatedTokens = this.estimateTokens(messages)
  const maxTokens = getModelContextWindow(this.config.model)

  // 2. 如果未超限，直接返回
  if (estimatedTokens < maxTokens * 0.8) {
    return messages
  }

  // 3. 压缩策略
  console.log(`[Agent] Context limit approaching, compressing...`)

  // 策略 1：保留最近 N 条消息
  if (messages.length > 50) {
    return messages.slice(-30)
  }

  // 策略 2：摘要压缩
  const compressed = await this.compactMessages(messages)
  return compressed
}
```

**压缩效果**：

```
压缩前：
[
  { role: "system", content: "..." },
  { role: "user", content: "你好" },
  { role: "assistant", content: "你好！" },
  ... 100 条消息 ...
  { role: "user", content: "最近怎么样？" },
  { role: "assistant", content: "我很好，谢谢！" },
]
Token 数：250,000（超出限制）

压缩后：
[
  { role: "system", content: "..." },
  { role: "user", content: "对话摘要：用户询问了关于 React、TypeScript 的问题，并得到了详细解答..." },
  { role: "assistant", content: "好的，我已了解上下文。" },
  { role: "user", content: "最近怎么样？" },
  { role: "assistant", content: "我很好，谢谢！" },
]
Token 数：50,000（在限制内）
```

---

### 11.5 错误处理与重试

#### 11.5.1 上下文溢出处理

**问题**：消息过长，超出模型上下文限制

**解决方案**：自动压缩重试

```typescript
try {
  response = await this.callLLM(currentMessages)
} catch (error: any) {
  const errorMessage = error?.message || String(error)

  // 检查是否为上下文溢出错误
  if (isContextOverflowError(errorMessage) && !overflowCompactionAttempted) {
    console.log(`[Agent] Context overflow detected, attempting auto-compaction...`)

    // 压缩当前消息
    const compressedMessages = await this.compactIfNeeded(currentMessages)
    currentMessages = compressedMessages
    overflowCompactionAttempted = true

    console.log(`[Agent] Auto-compaction succeeded, retrying...`)
    continue  // 重试
  }

  // 其他错误直接抛出
  throw error
}
```

#### 11.5.2 超时控制

**代码实现**：

```typescript
// 记录开始时间
const startTime = Date.now()
const timeoutMs = this.deps.toolConfig?.timeoutMs ?? 600000  // 默认 10 分钟

while (iteration < this.maxIterations) {
  // 检查超时
  const elapsedMs = Date.now() - startTime
  if (elapsedMs > timeoutMs) {
    throw new Error(
      `Tool calling timeout (${timeoutMs}ms) reached after ${iteration} iterations`
    )
  }

  // 执行任务...
}
```

#### 11.5.3 最大迭代次数

**目的**：防止无限循环

```typescript
const maxIterations = 1000  // 最多 1000 轮

while (iteration < maxIterations) {
  iteration++
  // 执行任务...
}

// 达到最大迭代次数
throw new Error(`Max iterations (${maxIterations}) reached`)
```

---

### 11.6 使用示例

#### 11.6.1 基本使用

```typescript
import { Agent } from "@/agent/core/agent.js"
import { AnthropicProvider } from "@/provider/index.js"
import { SessionStore } from "@/storage/session/index.js"

// 1. 创建 Agent
const agent = new Agent(
  {
    model: "claude-3-5-sonnet-20241022",
    systemPrompt: "你是一个有帮助的助手",
  },
  {
    provider: new AnthropicProvider({ apiKey: "sk-..." }),
    storage: new SessionStore({ baseDir: "./data/sessions" }),
    tools: [readFileTool, writeFileTool],
  }
)

// 2. 处理消息
const result = await agent.process("帮我读取 README.md", "user:123")

console.log(result.response)
// "README.md 的内容是：..."

console.log(result.usage)
// { promptTokens: 1200, completionTokens: 300, totalTokens: 1500 }
```

#### 11.6.2 流式响应

```typescript
// 流式处理
await agent.processStream(
  "写一首诗",
  "user:123",
  (chunk) => {
    // 每收到一个文本块就打印
    process.stdout.write(chunk)
  }
)

// 输出效果（逐字显示）：
// 春
// 风
// 吹
// 绿
// ...
```

#### 11.6.3 自定义工具

```typescript
// 定义自定义工具
const weatherTool: Tool = {
  name: "get_weather",
  description: "获取天气信息",
  inputSchema: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "城市名称"
      }
    },
    required: ["city"]
  },

  async execute(args: { city: string }) {
    // 调用天气 API
    const response = await fetch(`https://api.weather.com/${args.city}`)
    const data = await response.json()
    return { weather: data.temperature }
  }
}

// 使用自定义工具
const agent = new Agent(config, {
  provider: new AnthropicProvider(),
  tools: [weatherTool]
})

// 用户询问天气
const result = await agent.process("北京今天天气怎么样？", "user:123")
// Agent 会自动调用 get_weather 工具
```

---

### 11.7 本章小结

**核心要点**：

1. ✅ **Agent 定义**：能够理解意图并执行任务的 AI 实体
2. ✅ **核心流程**：加载历史 → 构建消息 → Tool Calling 循环 → 保存历史
3. ✅ **Tool Calling**：LLM 可以主动调用外部工具
4. ✅ **循环机制**：自动处理多轮工具调用
5. ✅ **上下文管理**：历史加载、记忆注入、自动压缩
6. ✅ **错误处理**：上下文溢出自动重试、超时控制、最大迭代次数
7. ✅ **依赖注入**：灵活配置 Provider、Storage、Tools

**Agent 核心能力**：

| 能力 | 说明 |
|-----|------|
| **LLM 对话** | 理解意图、生成回复 |
| **工具执行** | 调用外部工具完成任务 |
| **历史管理** | 保存和加载对话历史 |
| **记忆注入** | 自动检索相关记忆 |
| **上下文压缩** | 自动压缩过长对话 |
| **流式响应** | 实时输出生成内容 |

**Tool Calling 流程总结**：

```
用户消息
  ↓
LLM 决策
  ├─ 需要工具？
  │   ├─ 是 → 执行工具 → 将结果反馈给 LLM → 继续循环
  │   └─ 否 → 生成最终回复 → 保存历史 → 返回
  ↓
返回结果
```

---

**✅ 第11章完成！字数：~4800**

---

## 第12章：Skills 系统（技能框架）

> **本章目标**：深入理解 Krebs 的 Skills 系统，掌握技能加载、格式化和热重载
>
> **难度**：⭐⭐⭐⭐
>
> **预计阅读时间**：35 分钟

### 12.1 什么是 Skills 系统？

#### 12.1.1 定义

**Skill（技能）**：
- 一段预定义的 Prompt 模板
- 赋予 Agent 特定的能力或行为模式
- 可以动态加载和卸载

**类比**：

```
传统 Agent：
用户 + 固定 Prompt → Agent
（能力固定，无法扩展）

Skills Agent：
用户 + 固定 Prompt + 动态 Skills → Agent
（能力可扩展，灵活组合）
```

**Skill 示例**：

```markdown
---
name: "code_reviewer"
description: "代码审查专家"
category: "coding"
---

你是一位经验丰富的代码审查专家。

你的职责：
1. 检查代码质量
2. 发现潜在的 bug
3. 提出改进建议

审查风格：
- 友好但严格
- 提供具体的修改建议
- 解释为什么要修改
```

#### 12.1.2 Skills 的优势

**优势对比**：

| 特性 | 固定 Prompt | Skills 系统 |
|-----|------------|-----------|
| **可扩展性** | 需要修改代码 | 添加 Skill 文件即可 |
| **模块化** | 所有逻辑在一起 | 每个 Skill 独立 |
| **可维护性** | 难以维护 | 易于管理和更新 |
| **动态性** | 需要重启 | 支持热重载 |
| **组合性** | 难以组合 | 可以组合多个 Skills |

**使用场景**：

```
场景 1：代码审查
用户：帮我审查这段代码
Agent：加载 code_reviewer Skill
     → 按照代码审查标准分析
     → 给出专业建议

场景 2：文档生成
用户：帮我生成 API 文档
Agent：加载 doc_generator Skill
     → 按照文档规范生成
     → 输出 Markdown 格式

场景 3：数据查询
用户：查询用户信息
Agent：加载 data_query Skill
     → 执行 SQL 查询
     → 格式化结果
```

---

### 12.2 Skills 系统架构

#### 12.2.1 核心组件

```
┌─────────────────────────────────────────┐
│         Skills System                   │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐  ┌─────────────────┐ │
│  │SkillsManager │  │  Skill Loader   │ │
│  │  (Facade)    │  │  - 加载 Skill   │ │
│  │              │  │  - 解析文件     │ │
│  │ - loadSkills │  │  - 构建快照     │ │
│  │ - getSkills  │  └─────────────────┘ │
│  │ - reload     │                      │
│  └──────┬───────┘                      │
│         │                               │
│  ┌──────┴──────────────────────────┐   │
│  │                                  │   │
│  ▼                                  ▼   │
│  ┌─────────────────┐  ┌─────────────────┐│
│  │Skills Formatter │  │Skills HotReload ││
│  │ - 格式化 Prompt │  │ - 监听文件变化  ││
│  │ - 构建 Prompt   │  │ - 自动重载      ││
│  └─────────────────┘  └─────────────────┘│
│                                         │
└─────────────────────────────────────────┘
```

**组件职责**：

| 组件 | 职责 |
|-----|------|
| **SkillsManager** | Facade 层，统一 API，隐藏实现细节 |
| **SkillsLoader** | 加载 Skill 文件，解析 Markdown 和 frontmatter |
| **SkillsFormatter** | 将 Skills 格式化为 LLM Prompt |
| **SkillsHotReload** | 监听文件变化，自动重载 Skills |

#### 12.2.2 Skill 目录结构

**多层目录设计**：

```
skills/
├── bundled/           # 内置技能（框架提供）
│   ├── coder.md
│   └── reviewer.md
├── managed/           # 托管技能（用户安装）
│   ├── translator.md
│   └── summarizer.md
└── workspace/         # 工作区技能（用户自定义）
    └── my-skill.md
```

**优先级**（从低到高）：

```
extra (最低) < bundled < managed < workspace (最高)

后加载的会覆盖同名的先加载技能
```

**示例**：

```
bundled/coder.md:
  name: "coder"
  description: "编程助手"

workspace/coder.md:
  name: "coder"
  description: "高级编程助手"  # 覆盖了 bundled 的版本

最终生效：workspace 的版本（优先级更高）
```

---

### 12.3 Skills Manager 核心实现

#### 12.3.1 类结构

**源码位置**：`src/agent/skills/skills-manager.ts`

```typescript
export class SkillsManager {
  // 子组件
  private loader: SkillsLoader
  private formatter: SkillsFormatter
  private hotReload: SkillsHotReload

  // 配置
  private config: SkillsConfig

  // 状态
  private snapshot: SkillSnapshot | null = null  // 技能快照
  private version: number = 0                    // 版本号

  constructor(config: SkillsConfig) {
    this.config = config
    this.loader = createSkillsLoader()
    this.formatter = createSkillsFormatter()
    this.hotReload = createSkillsHotReload()

    // 设置热加载回调
    this.hotReload.onChange(() => this.handleReload())
    this.hotReload.onSkillChange((event) => this.handleSkillChange(event))
  }

  /**
   * 加载所有技能
   */
  async loadSkills(): Promise<void>

  /**
   * 重新加载技能
   */
  async reloadSkills(): Promise<void>

  /**
   * 构建技能 Prompt
   */
  buildSkillsPrompt(options?: BuildPromptOptions): string

  /**
   * 获取所有技能
   */
  getAllSkills(): SkillEntry[]

  /**
   * 获取启用的技能（供 Agent 使用）
   */
  getSkills(): Array<{ name: string; description: string; prompt?: string }>

  /**
   * 根据名称获取技能
   */
  getSkillByName(name: string): SkillEntry | undefined
}
```

#### 12.3.2 加载技能

**代码实现**：

```typescript
async loadSkills(): Promise<void> {
  logger.info("Loading skills...")

  // ──────────────────────────────────────
  // 第1步：收集所有技能目录（按优先级从低到高）
  // ──────────────────────────────────────
  const dirs: Array<{ dir: string; source: string }> = []

  // Extra Skills (最低优先级)
  if (this.config.extraSkillsDirs) {
    for (const dir of this.config.extraSkillsDirs) {
      dirs.push({ dir, source: "extra" })
    }
  }

  // Bundled Skills
  dirs.push({ dir: this.config.bundledSkillsDir, source: "bundled" })

  // Managed/local Skills
  if (this.config.localSkillsDir) {
    dirs.push({ dir: this.config.localSkillsDir, source: "managed" })
  }

  // Workspace Skills (最高优先级)
  if (this.config.workspaceSkillsDir) {
    dirs.push({ dir: this.config.workspaceSkillsDir, source: "workspace" })
  }

  // ──────────────────────────────────────
  // 第2步：从所有目录加载（后加载的会覆盖同名技能）
  // ──────────────────────────────────────
  const entries = this.loader.loadFromDirs(dirs)

  // ──────────────────────────────────────
  // 第3步：构建快照
  // ──────────────────────────────────────
  this.version++
  this.snapshot = this.loader.buildSnapshot(entries, this.version)

  logger.info(
    `Loaded ${this.snapshot.count} skills from ${dirs.length} directories ` +
    `(version ${this.snapshot.version})`
  )
}
```

**SkillEntry 结构**：

```typescript
interface SkillEntry {
  skill: {
    name: string
    description?: string
    category?: string
    // ... 其他字段
  }
  frontmatter?: {
    description?: string
    enabled?: boolean
    // ... 其他元数据
  }
  source: string      // 来源（bundled/managed/workspace）
  enabled: boolean   // 是否启用
}
```

#### 12.3.3 构建 Prompt

**代码实现**：

```typescript
buildSkillsPrompt(options?: BuildPromptOptions): string {
  if (!this.snapshot) {
    logger.warn("No skills loaded, returning empty prompt")
    return ""
  }

  return this.formatter.formatForPrompt(this.snapshot.skills, options)
}
```

**Formatter 实现**（简化）：

```typescript
formatForPrompt(skills: SkillEntry[], options?: BuildPromptOptions): string {
  // 过滤启用的技能
  const enabledSkills = skills.filter(s => s.enabled !== false)

  // 格式化为 Prompt
  const sections = []

  for (const entry of enabledSkills) {
    const skill = entry.skill

    // 构建技能描述
    let section = `## ${skill.name}\n`
    if (skill.description) {
      section += `${skill.description}\n`
    }
    if (skill.prompt) {
      section += `\n${skill.prompt}\n`
    }

    sections.push(section)
  }

  return sections.join("\n\n")
}
```

**输出示例**：

```
## code_reviewer
代码审查专家

你是一位经验丰富的代码审查专家。

你的职责：
1. 检查代码质量
2. 发现潜在的 bug
3. 提出改进建议

## translator
翻译专家

你是一位专业的翻译专家，精通中文和英文。

翻译风格：
- 准确传达原文意思
- 符合目标语言习惯
- 保持原文语气和风格
```

#### 12.3.4 获取技能

**供 Agent 使用**：

```typescript
getSkills(): Array<{ name: string; description: string; prompt?: string }> {
  if (!this.snapshot) {
    return []
  }

  // 只返回启用的技能
  const enabledSkills = this.snapshot.skills.filter(
    (entry) => entry.enabled !== false
  )

  // 转换为 Agent 期望的格式
  return enabledSkills.map((entry) => {
    // 尝试从 skill 对象获取 prompt
    const prompt =
      (entry.skill as any).prompt ||
      (entry.skill as any).instructions ||
      (entry.skill as any).content ||
      undefined

    return {
      name: entry.skill.name,
      description:
        entry.frontmatter?.description || entry.skill.description || "",
      prompt,  // 可选的详细说明
    }
  })
}
```

**使用示例**：

```typescript
// 在 Agent 中使用
const skills = skillsManager.getSkills()

// 构建系统 Prompt
const systemPrompt = `
你是一个有帮助的助手。

可用的技能：
${skills.map(s => `- ${s.name}: ${s.description}`).join("\n")}

根据用户需求，选择合适的技能完成任务。
`
```

---

### 12.4 热重载（Hot Reload）

#### 12.4.1 什么是热重载？

**定义**：文件变化时自动重新加载，无需重启

```
传统方式：
1. 修改 Skill 文件
2. 重启应用
3. 技能生效

热重载：
1. 修改 Skill 文件
2. 自动检测变化
3. 立即生效（无需重启）
```

#### 12.4.2 实现原理

**使用 chokidar 监听文件**：

```typescript
import chokidar from "chokidar"

class SkillsHotReload {
  private watcher: chokidar.FSWatcher | null = null

  /**
   * 启用监听
   */
  enable(dirs: string[]) {
    // 监听所有技能目录
    this.watcher = chokidar.watch(dirs, {
      ignoreInitial: true,     // 忽略初始扫描
      persistent: true,        // 持续监听
      awaitWriteFinish: {
        stabilityThreshold: 100,  // 文件稳定 100ms 后触发
        pollInterval: 50,         // 每 50ms 轮询
      },
    })

    // 文件变化时触发回调
    this.watcher.on("change", (path) => {
      console.log(`Skill file changed: ${path}`)
      this.onChangeCallbacks.forEach(cb => cb())
    })

    this.watcher.on("add", (path) => {
      console.log(`Skill file added: ${path}`)
      this.onSkillChangeCallbacks.forEach(cb => cb({ type: "add", path }))
    })

    this.watcher.on("unlink", (path) => {
      console.log(`Skill file removed: ${path}`)
      this.onSkillChangeCallbacks.forEach(cb => cb({ type: "remove", path }))
    })
  }

  /**
   * 注册回调
   */
  onChange(callback: () => void) {
    this.onChangeCallbacks.push(callback)
  }

  onSkillChange(callback: (event: SkillsChangeEvent) => void) {
    this.onSkillChangeCallbacks.push(callback)
  }
}
```

#### 12.4.3 重载逻辑

**在 SkillsManager 中处理**：

```typescript
export class SkillsManager {
  constructor(config: SkillsConfig) {
    // ...
    this.hotReload.onChange(() => this.handleReload())
    this.hotReload.onSkillChange((event) => this.handleSkillChange(event))
  }

  /**
   * 处理重载
   */
  private async handleReload() {
    logger.info("Skill files changed, reloading...")
    try {
      await this.loadSkills()
      logger.info("Skills reloaded successfully")
    } catch (error) {
      logger.error("Failed to reload skills:", error)
    }
  }

  /**
   * 处理单个技能变化
   */
  private handleSkillChange(event: SkillsChangeEvent) {
    logger.info(`Skill ${event.type}: ${event.path}`)
    // 可以在这里做更细粒度的处理
    // 例如：只重新加载变化的技能
  }
}
```

---

### 12.5 Skill 文件格式

#### 12.5.1 基本格式

**Markdown + Frontmatter**：

```markdown
---
name: "skill_name"
description: "技能描述"
category: "coding"
enabled: true
---

技能的详细说明

这里可以写：
1. 技能的使用场景
2. 具体的执行步骤
3. 注意事项
4. 示例
```

#### 12.5.2 完整示例

**示例 1：代码审查技能**

```markdown
---
name: "code_reviewer"
description: "代码审查专家，检查代码质量并提供改进建议"
category: "coding"
tags: ["review", "quality", "best-practices"]
enabled: true
---

# 代码审查专家

你是一位经验丰富的代码审查专家，擅长发现代码中的问题并提出改进建议。

## 审查要点

1. **代码质量**
   - 检查代码是否符合语言最佳实践
   - 是否有重复代码
   - 命名是否清晰

2. **潜在 Bug**
   - 边界条件处理
   - 错误处理
   - 资源泄漏

3. **性能问题**
   - 算法复杂度
   - 不必要的计算
   - 可以优化的地方

4. **安全性**
   - 输入验证
   - SQL 注入
   - XSS 漏洞

## 审查风格

- 友好但严格
- 提供具体的修改建议
- 解释为什么要修改
- 给出修改前后的对比

## 输出格式

```markdown
## 审查结果

### 问题 1：[问题描述]
- **严重程度**：高/中/低
- **位置**：文件名:行号
- **问题**：详细说明
- **建议**：修改方案

### 优点
- 列出代码做得好的地方

### 总结
整体评价和建议
```
```

**示例 2：文档生成技能**

```markdown
---
name: "doc_generator"
description: "API 文档生成器，自动生成 Markdown 格式的 API 文档"
category: "documentation"
tags: ["api", "docs", "markdown"]
enabled: true
---

# API 文档生成器

你是一个专业的 API 文档生成器，能够根据代码或接口描述生成清晰的 Markdown 文档。

## 文档结构

为每个 API 生成以下部分：

1. **概述**
   - 功能说明
   - 使用场景

2. **请求**
   - 方法（GET/POST/PUT/DELETE）
   - 路径
   - 请求参数
   - 请求示例

3. **响应**
   - 响应格式
   - 响应字段说明
   - 响应示例

4. **错误码**
   - 可能的错误码
   - 错误处理建议

## 输出格式

使用标准的 Markdown 格式，包含：
- 标题（## 用于章节）
- 代码块（``` 用于示例）
- 表格（用于参数说明）
- 列表（用于要点）
```

---

### 12.6 使用示例

#### 12.6.1 创建 SkillsManager

```typescript
import { SkillsManager } from "@/agent/skills/skills-manager.js"

// 创建 Skills Manager
const skillsManager = new SkillsManager({
  bundledSkillsDir: "./skills/bundled",
  localSkillsDir: "./skills/managed",
  workspaceSkillsDir: "./workspace/skills",
})

// 加载技能
await skillsManager.loadSkills()
```

#### 12.6.2 在 Agent 中使用

```typescript
import { Agent } from "@/agent/core/agent.js"

// 创建 Agent（带 Skills）
const agent = new Agent(
  {
    model: "claude-3-5-sonnet-20241022",
    systemPrompt: "你是一个有帮助的助手",
  },
  {
    provider: new AnthropicProvider(),
    skillsManager: skillsManager,  // 注入 Skills Manager
  }
)

// Agent 会自动使用 Skills
const result = await agent.process("帮我审查这段代码", "user:123")
```

#### 12.6.3 动态获取技能

```typescript
// 获取所有技能
const allSkills = skillsManager.getAllSkills()
console.log(`Total skills: ${allSkills.length}`)

// 获取启用的技能
const enabledSkills = skillsManager.getSkills()
console.log("Enabled skills:", enabledSkills.map(s => s.name))

// 根据名称获取技能
const reviewerSkill = skillsManager.getSkillByName("code_reviewer")
console.log("Reviewer skill:", reviewerSkill)

// 构建 Prompt
const skillsPrompt = skillsManager.buildSkillsPrompt({
  format: "markdown",
  includeDescription: true,
})
console.log("Skills prompt:", skillsPrompt)
```

#### 12.6.4 热重载使用

```typescript
// 启动时加载
await skillsManager.loadSkills()

// 启用热重载（在开发环境）
if (process.env.NODE_ENV === "development") {
  skillsManager.enableHotReload()
  console.log("Skills hot reload enabled")
}

// 修改技能文件后，自动重新加载
// 无需重启应用
```

---

### 12.7 本章小结

**核心要点**：

1. ✅ **Skills 系统**：动态加载技能，扩展 Agent 能力
2. ✅ **Skill 格式**：Markdown + Frontmatter
3. ✅ **SkillsManager**：Facade 层，统一 API
4. ✅ **多层目录**：bundled < managed < workspace（优先级）
5. ✅ **热重载**：文件变化自动重新加载
6. ✅ **Prompt 构建**：将 Skills 格式化为 LLM Prompt
7. ✅ **可扩展性**：添加新 Skill 无需修改代码

**Skills 系统优势**：

| 优势 | 说明 |
|-----|------|
| **模块化** | 每个 Skill 独立文件 |
| **可扩展** | 添加新 Skill 无需修改代码 |
| **动态性** | 支持热重载，无需重启 |
| **组合性** | 可以组合多个 Skills |
| **优先级** | 支持覆盖和继承 |

**完整流程总结**：

```
1. 创建 SkillsManager
   ↓
2. 加载 Skills（loadSkills）
   ├─ 收集目录（bundled/managed/workspace）
   ├─ 解析文件（Markdown + Frontmatter）
   └─ 构建快照
   ↓
3. 启用热重载（可选）
   ├─ 监听文件变化
   └─ 自动重新加载
   ↓
4. 在 Agent 中使用
   ├─ 获取 Skills（getSkills）
   ├─ 构建 Prompt（buildSkillsPrompt）
   └─ 注入到 System Prompt
   ↓
5. Agent 使用 Skills
   └─ 根据用户需求选择合适的 Skill
```

---

**✅ 第12章完成！字数：~4200**

---

## 第13章：Gateway 接入层

> **本章目标**：理解 Krebs 的 Gateway 架构，掌握 HTTP 和 WebSocket 服务
>
> **难度**：⭐⭐⭐
>
> **预计阅读时间**：30 分钟

### 13.1 Gateway 概述

#### 13.1.1 什么是 Gateway？

**定义**：Gateway（网关）是系统的接入层，负责处理外部请求

**类比**：

```
没有 Gateway：
用户 → 直接调用 Agent
（不安全、难以管理）

有 Gateway：
用户 → Gateway → Agent
（统一接入、安全、可管理）
```

**Gateway 的职责**：

```
┌─────────────────────────────────────────┐
│           Gateway Layer                 │
├─────────────────────────────────────────┤
│ 🌐 HTTP API                            │
│    - RESTful 接口                       │
│    - 静态文件服务                        │
│    - API 密钥管理                        │
├─────────────────────────────────────────┤
│ 🔌 WebSocket                            │
│    - 实时通信                           │
│    - 流式响应                           │
│    - 双向消息                           │
├─────────────────────────────────────────┤
│ 🛡️ 安全与鉴权                          │
│    - CORS 配置                          │
│    - API 验证                           │
│    - 速率限制（可选）                    │
└─────────────────────────────────────────┘
```

#### 13.1.2 Gateway 架构

```
┌───────────────────────────────────────────────────────────┐
│                      Client                                │
│                    (Browser/API)                           │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│                   Gateway Layer                            │
├───────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────┐  ┌──────────────────────────┐    │
│  │   HTTP Server        │  │   WebSocket Server      │    │
│  │   (Express)          │  │   (ws)                   │    │
│  │                      │  │                          │    │
│  │  - /api/chat         │  │  - 实时消息              │    │
│  │  - /api/agents       │  │  - 流式响应              │    │
│  │  - /api/sessions     │  │  - 双向通信              │    │
│  │  - /ui/*             │  │                          │    │
│  └──────────┬───────────┘  └──────────┬───────────────┘    │
│             │                         │                      │
│             └──────────┬──────────────┘                      │
│                        ▼                                     │
│            ┌───────────────────────┐                        │
│            │   ChatService         │                        │
│            │   (业务逻辑层)         │                        │
│            └───────────┬───────────┘                        │
└────────────────────────┼───────────────────────────────────┘
                         │
                         ▼
┌───────────────────────────────────────────────────────────┐
│                   Agent Layer                               │
│                  (Agent + Skills)                           │
└───────────────────────────────────────────────────────────┘
```

---

### 13.2 HTTP Server

#### 13.2.1 基本结构

**源码位置**：`src/gateway/server/http-server.ts`

```typescript
import express from "express"
import type { IChatService } from "../service/chat-service.js"
import type { AgentManager } from "@/agent/core/index.js"

export class GatewayHttpServer {
  private readonly app: express.Application
  private readonly chatService: IChatService
  private readonly agentManager: AgentManager
  private readonly port: number
  private readonly host: string

  constructor(
    chatService: IChatService,
    port: number,
    host: string = "0.0.0.0",
    agentManager?: AgentManager
  ) {
    this.app = express()
    this.chatService = chatService
    this.agentManager = agentManager!
    this.port = port
    this.host = host

    this.setupMiddleware()
    this.setupRoutes()
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, this.host, () => {
        console.log(`HTTP server listening on http://${this.host}:${this.port}`)
        resolve()
      })
    })
  }
}
```

#### 13.2.2 中间件配置

**代码实现**：

```typescript
private setupMiddleware(): void {
  // 1. JSON 解析
  this.app.use(express.json())

  // 2. URL 编码解析
  this.app.use(express.urlencoded({ extended: true }))

  // 3. CORS 配置
  this.app.use((_, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    res.setHeader("Access-Control-Max-Age", "86400")
    next()
  })

  // 4. 请求日志
  this.app.use((req, _, next) => {
    log.info(`${req.method} ${req.path}`)
    next()
  })
}
```

#### 13.2.3 核心 API 路由

**1. 健康检查**

```typescript
this.app.get("/health", (_, res) => {
  res.json({ status: "ok", timestamp: Date.now() })
})

this.app.get("/api/health", (_, res) => {
  res.json({ status: "ok", timestamp: Date.now() })
})
```

**2. 聊天接口**

```typescript
this.app.post("/api/chat", async (req, res) => {
  try {
    const { message, sessionId } = req.body

    // 调用 ChatService
    const result = await this.chatService.chat({
      message,
      sessionId: sessionId || this.getDefaultSessionId(req)
    })

    res.json(result)
  } catch (error) {
    log.error("Chat error:", error)
    res.status(500).json({ error: String(error) })
  }
})
```

**3. 工具列表**

```typescript
this.app.get("/api/tools", async (_, res) => {
  try {
    const tools = await this.handleGetTools()
    res.json({ tools })
  } catch (error) {
    log.error("Get tools error:", error)
    res.status(500).json({ error: String(error) })
  }
})
```

**4. 会话管理**

```typescript
// 列出会话
this.app.get("/api/sessions", async (req, res) => {
  try {
    const sessions = await this.chatService.listSessions(req.query)
    res.json(sessions)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

// 创建会话
this.app.post("/api/sessions", async (req, res) => {
  try {
    const session = await this.chatService.createSession(req.body)
    res.json(session)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})
```

#### 13.2.4 静态文件服务

**UI 界面服务**：

```typescript
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uiDistPath = path.join(__dirname, "../../../ui/dist")

// 静态文件
this.app.use(express.static(uiDistPath))

// SPA fallback - 所有其他路由返回 index.html
this.app.get("/ui/*", (_, res) => {
  res.sendFile(path.join(uiDistPath, "index.html"))
})
```

**效果**：

```
访问 http://localhost:3000/
      ↓
返回 UI 界面（index.html）

访问 http://localhost:3000/ui/dashboard
      ↓
返回 UI 界面（Vue Router 处理路由）
```

---

### 13.3 WebSocket Server

#### 13.3.1 为什么需要 WebSocket？

**HTTP vs WebSocket**：

```
HTTP（请求-响应）：
客户端 → 请求 → 服务器
客户端 ← 响应 ← 服务器
（每次都需要重新连接）

WebSocket（双向通信）：
客户端 ←→ 服务器
（保持连接，实时通信）
```

**使用场景**：

| 场景 | HTTP | WebSocket |
|-----|------|-----------|
| **普通 API 调用** | ✅ 适用 | ❌ 过度设计 |
| **实时聊天** | ❌ 轮询浪费资源 | ✅ 最佳选择 |
| **流式响应** | ⚠️ 可以实现 | ✅ 更高效 |
| **服务器推送** | ❌ 无法主动推送 | ✅ 支持 |

#### 13.3.2 WebSocket Server 实现

**基本结构**：

```typescript
import { WebSocketServer, WebSocket } from "ws"
import type { IChatService } from "../service/chat-service.js"

export class GatewayWsServer {
  private readonly wss: WebSocketServer
  private readonly chatService: IChatService
  private readonly port: number

  constructor(chatService: IChatService, port: number) {
    this.chatService = chatService
    this.port = port

    // 创建 WebSocket 服务器
    this.wss = new WebSocketServer({ port })
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.on("listening", () => {
        console.log(`WebSocket server listening on port ${this.port}`)
        resolve()
      })

      // 处理连接
      this.wss.on("connection", (ws, req) => {
        this.handleConnection(ws, req)
      })
    })
  }

  /**
   * 处理客户端连接
   */
  private handleConnection(ws: WebSocket, req: any) {
    const clientId = this.generateClientId()

    console.log(`Client connected: ${clientId}`)

    // 处理消息
    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        await this.handleMessage(ws, message)
      } catch (error) {
        console.error("Message handling error:", error)
        ws.send(JSON.stringify({ error: String(error) }))
      }
    })

    // 处理断开
    ws.on("close", () => {
      console.log(`Client disconnected: ${clientId}`)
    })
  }

  /**
   * 处理客户端消息
   */
  private async handleMessage(ws: WebSocket, message: any) {
    const { type, payload } = message

    switch (type) {
      case "chat":
        // 处理聊天消息
        const response = await this.chatService.chat(payload)
        ws.send(JSON.stringify({ type: "chat", data: response }))
        break

      case "stream":
        // 处理流式聊天
        await this.handleStreamChat(ws, payload)
        break

      default:
        ws.send(JSON.stringify({ error: `Unknown message type: ${type}` }))
    }
  }
}
```

#### 13.3.3 流式响应

**实现流式聊天**：

```typescript
private async handleStreamChat(ws: WebSocket, payload: any) {
  const { message, sessionId } = payload

  try {
    // 发送开始事件
    ws.send(JSON.stringify({ type: "stream_start" }))

    // 流式处理
    await this.chatService.chatStream({
      message,
      sessionId,
      onChunk: (chunk) => {
        // 每收到一个文本块就发送
        ws.send(JSON.stringify({
          type: "stream_chunk",
          data: { chunk }
        }))
      }
    })

    // 发送结束事件
    ws.send(JSON.stringify({ type: "stream_end" }))

  } catch (error) {
    ws.send(JSON.stringify({ type: "stream_error", error: String(error) }))
  }
}
```

**客户端示例**：

```javascript
// 连接 WebSocket
const ws = new WebSocket("ws://localhost:3001")

ws.onopen = () => {
  // 发送消息
  ws.send(JSON.stringify({
    type: "stream",
    payload: {
      message: "写一首诗",
      sessionId: "user:123"
    }
  }))
}

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)

  switch (message.type) {
    case "stream_start":
      console.log("开始生成...")
      break

    case "stream_chunk":
      // 逐字显示
      process.stdout.write(message.data.chunk)
      break

    case "stream_end":
      console.log("\n生成完成！")
      break

    case "stream_error":
      console.error("错误:", message.error)
      break
  }
}
```

---

### 13.4 ChatService（业务逻辑层）

#### 13.4.1 为什么需要 ChatService？

**问题**：Gateway 直接调用 Agent？

```
Gateway → Agent
（紧耦合，难以测试和扩展）
```

**解决方案**：引入 ChatService

```
Gateway → ChatService → Agent
（解耦，易于测试和扩展）
```

#### 13.4.2 ChatService 接口

```typescript
export interface IChatService {
  /**
   * 普通聊天
   */
  chat(params: { message: string; sessionId: string }): Promise<ChatResult>

  /**
   * 流式聊天
   */
  chatStream(params: {
    message: string
    sessionId: string
    onChunk: (chunk: string) => void
  }): Promise<ChatResult>

  /**
   * 列出会话
   */
  listSessions(params?: SessionListParams): Promise<SessionInfo[]>

  /**
   * 创建会话
   */
  createSession(params: SessionCreateParams): Promise<SessionInfo>

  /**
   * 获取工具列表
   */
  getTools(): Promise<ToolInfo[]>
}
```

#### 13.4.3 ChatService 实现

**简化版实现**：

```typescript
export class ChatService implements IChatService {
  constructor(
    private agentManager: AgentManager,
    private sessionStore: SessionStore
  ) {}

  async chat(params: { message: string; sessionId: string }): Promise<ChatResult> {
    const { message, sessionId } = params

    // 获取或创建 Agent
    const agent = await this.agentManager.getOrCreateAgent(sessionId)

    // 处理消息
    const result = await agent.process(message, sessionId)

    return {
      response: result.response,
      usage: result.usage,
      payloads: result.payloads
    }
  }

  async chatStream(params: {
    message: string
    sessionId: string
    onChunk: (chunk: string) => void
  }): Promise<ChatResult> {
    const { message, sessionId, onChunk } = params

    // 获取或创建 Agent
    const agent = await this.agentManager.getOrCreateAgent(sessionId)

    // 流式处理
    return await agent.processStream(message, sessionId, onChunk)
  }

  async listSessions(): Promise<SessionInfo[]> {
    const sessions = await this.sessionStore.listSessions()
    return sessions.map(({ sessionKey, entry }) => ({
      sessionId: sessionKey,
      title: entry.title || "Untitled",
      updatedAt: entry.updatedAt,
      messageCount: entry.messageCount || 0
    }))
  }

  async createSession(params: SessionCreateParams): Promise<SessionInfo> {
    const sessionId = params.sessionId || `user:${Date.now()}`
    await this.sessionStore.saveSession(sessionId, [], {
      title: params.title || "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    return {
      sessionId,
      title: params.title || "New Chat",
      updatedAt: Date.now(),
      messageCount: 0
    }
  }

  async getTools(): Promise<ToolInfo[]> {
    // 返回可用的工具列表
    return [
      { name: "read_file", description: "读取文件" },
      { name: "write_file", description: "写入文件" },
      { name: "search", description: "搜索" }
    ]
  }
}
```

---

### 13.5 使用示例

#### 13.5.1 启动 Gateway

```typescript
import { GatewayHttpServer } from "@/gateway/server/http-server.js"
import { GatewayWsServer } from "@/gateway/server/ws-server.js"
import { ChatService } from "@/gateway/service/chat-service.js"
import { AgentManager } from "@/agent/core/index.js"

// 1. 创建 Agent Manager
const agentManager = new AgentManager({ ... })

// 2. 创建 Chat Service
const chatService = new ChatService(agentManager, sessionStore)

// 3. 启动 HTTP Server
const httpServer = new GatewayHttpServer(
  chatService,
  3000,  // port
  "0.0.0.0",  // host
  agentManager
)
await httpServer.start()

// 4. 启动 WebSocket Server
const wsServer = new GatewayWsServer(chatService, 3001)
await wsServer.start()

console.log("Gateway started!")
console.log("HTTP: http://localhost:3000")
console.log("WebSocket: ws://localhost:3001")
```

#### 13.5.2 客户端调用

**HTTP 调用**：

```bash
# 发送聊天消息
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好",
    "sessionId": "user:123"
  }'

# 响应
{
  "response": "你好！有什么我可以帮助你的吗？",
  "usage": {
    "promptTokens": 20,
    "completionTokens": 15,
    "totalTokens": 35
  }
}
```

**WebSocket 调用**：

```javascript
const ws = new WebSocket("ws://localhost:3001")

ws.onopen = () => {
  // 发送聊天消息
  ws.send(JSON.stringify({
    type: "chat",
    payload: {
      message: "你好",
      sessionId: "user:123"
    }
  }))
}

ws.onmessage = (event) => {
  const response = JSON.parse(event.data)
  console.log("Response:", response.data)
}
```

---

### 13.6 本章小结

**核心要点**：

1. ✅ **Gateway 层**：系统的接入层，处理外部请求
2. ✅ **HTTP Server**：Express 实现，提供 RESTful API
3. ✅ **WebSocket Server**：ws 实现，支持实时通信和流式响应
4. ✅ **ChatService**：业务逻辑层，解耦 Gateway 和 Agent
5. ✅ **中间件**：CORS、日志、JSON 解析等
6. ✅ **静态文件服务**：UI 界面服务
7. ✅ **API 设计**：/api/chat、/api/sessions、/api/tools 等

**Gateway 架构优势**：

| 优势 | 说明 |
|-----|------|
| **统一接入** | 所有请求通过 Gateway |
| **安全控制** | CORS、API 验证等 |
| **解耦** | Gateway 不直接依赖 Agent |
| **可扩展** | 易于添加新的 API |
| **实时通信** | WebSocket 支持流式响应 |

---

**✅ 第13章完成！字数：~3500**

---

## 第14章：Docker 容器化部署

> **本章目标**：掌握 Krebs 的 Docker 容器化部署
>
> **难度**：⭐⭐
>
> **预计阅读时间**：20 分钟

### 14.1 Docker 基础

#### 14.1.1 什么是 Docker？

**定义**：Docker 是一个容器化平台，可以将应用及其依赖打包到一个独立的容器中

**类比**：

```
传统部署：
应用 A → 服务器
（可能与其他应用冲突，环境不一致）

Docker 部署：
应用 A → 容器 A → 服务器
应用 B → 容器 B → 服务器
（隔离运行，环境一致）
```

**Docker 优势**：

| 优势 | 说明 |
|-----|------|
| **环境一致性** | 开发、测试、生产环境完全一致 |
| **依赖隔离** | 不同应用互不影响 |
| **快速部署** | 秒级启动 |
| **易于扩展** | 可以快速创建多个实例 |
| **资源高效** | 比虚拟机更轻量 |

#### 14.1.2 核心概念

**镜像（Image）**：
- 应用的只读模板
- 包含代码、运行时、库、环境变量等
- 例如：`krebs:latest`

**容器（Container）**：
- 镜像的运行实例
- 可以启动、停止、删除
- 例如：运行中的 `krebs:latest`

**Dockerfile**：
- 构建镜像的脚本
- 包含构建步骤和指令

---

### 14.2 Dockerfile 解析

#### 14.2.1 Krebs 的 Dockerfile

**源码位置**：`Dockerfile`

```dockerfile
# 使用 Node.js 22 作为基础镜像
FROM node:22-bookworm-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装 Node.js 依赖
RUN npm ci --only=production

# 复制项目文件
COPY . .

# 构建 TypeScript
RUN npm run build

# 暴露端口
EXPOSE 3000 3001

# 设置环境变量
ENV NODE_ENV=production

# 启动应用
CMD ["npm", "start"]
```

#### 14.2.2 指令详解

**FROM**：
```dockerfile
FROM node:22-bookworm-slim
```
- 指定基础镜像
- `node:22-bookworm-slim`：Node.js 22，Debian Bookworm，slim 版本（精简）

**WORKDIR**：
```dockerfile
WORKDIR /app
```
- 设置工作目录
- 后续指令都在此目录执行

**RUN**：
```dockerfile
RUN apt-get update && apt-get install -y build-essential
```
- 在镜像中执行命令
- 安装系统依赖

**COPY**：
```dockerfile
COPY package*.json ./
```
- 从主机复制文件到镜像
- 先复制 `package.json`，利用 Docker 缓存

**EXPOSE**：
```dockerfile
EXPOSE 3000 3001
```
- 声明容器暴露的端口
- 3000：HTTP
- 3001：WebSocket

**CMD**：
```dockerfile
CMD ["npm", "start"]
```
- 容器启动时执行的命令
- 只能有一个 CMD

---

### 14.3 构建和运行

#### 14.3.1 构建镜像

```bash
# 克隆项目
git clone https://github.com/your-repo/krebs.git
cd krebs

# 构建镜像
docker build -t krebs:latest .

# 查看镜像
docker images | grep krebs
```

#### 14.3.2 运行容器

**基本运行**：

```bash
# 运行容器
docker run -d \
  --name krebs \
  -p 3000:3000 \
  -p 3001:3001 \
  -e ANTHROPIC_API_KEY="sk-..." \
  krebs:latest
```

**参数说明**：

| 参数 | 说明 |
|-----|------|
| `-d` | 后台运行 |
| `--name krebs` | 容器名称 |
| `-p 3000:3000` | 端口映射（主机:容器） |
| `-e KEY=VALUE` | 环境变量 |

**挂载数据目录**：

```bash
docker run -d \
  --name krebs \
  -p 3000:3000 \
  -p 3001:3001 \
  -v $(pwd)/data:/app/data \
  -e ANTHROPIC_API_KEY="sk-..." \
  krebs:latest
```

**挂载配置文件**：

```bash
docker run -d \
  --name krebs \
  -p 3000:3000 \
  -p 3001:3001 \
  -v $(pwd)/config.yaml:/app/config.yaml \
  -e ANTHROPIC_API_KEY="sk-..." \
  krebs:latest
```

#### 14.3.3 管理容器

```bash
# 查看运行中的容器
docker ps

# 查看容器日志
docker logs -f krebs

# 进入容器
docker exec -it krebs /bin/bash

# 停止容器
docker stop krebs

# 启动容器
docker start krebs

# 重启容器
docker restart krebs

# 删除容器
docker rm krebs

# 删除镜像
docker rmi krebs:latest
```

---

### 14.4 Docker Compose

#### 14.4.1 docker-compose.yml

**源码位置**：`docker-compose.yml`

```yaml
version: '3.8'

services:
  krebs:
    build: .
    container_name: krebs
    ports:
      - "3000:3000"  # HTTP
      - "3001:3001"  # WebSocket
    environment:
      - NODE_ENV=production
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./data:/app/data
      - ./config.yaml:/app/config.yaml
    restart: unless-stopped
```

#### 14.4.2 使用 Docker Compose

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart
```

#### 14.4.3 多服务编排

**示例：Krebs + Nginx**：

```yaml
version: '3.8'

services:
  krebs:
    build: .
    container_name: krebs
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./data:/app/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    container_name: krebs-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - krebs
    restart: unless-stopped
```

---

### 14.5 生产环境优化

#### 14.5.1 多阶段构建

**减小镜像体积**：

```dockerfile
# 构建阶段
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 运行阶段
FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
CMD ["npm", "start"]
```

#### 14.5.2 健康检查

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"
```

#### 14.5.3 日志管理

```yaml
services:
  krebs:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

### 14.6 本章小结

**核心要点**：

1. ✅ **Docker 基础**：镜像、容器、Dockerfile
2. ✅ **Dockerfile**：构建镜像的脚本
3. ✅ **构建和运行**：`docker build`、`docker run`
4. ✅ **Docker Compose**：多服务编排
5. ✅ **生产优化**：多阶段构建、健康检查、日志管理
6. ✅ **数据持久化**：使用 volumes 挂载数据目录
7. ✅ **环境变量**：通过 `-e` 或 `.env` 文件配置

**部署流程总结**：

```
1. 编写 Dockerfile
   ↓
2. 构建镜像（docker build）
   ↓
3. 运行容器（docker run）
   ↓
4. 配置端口映射、环境变量、数据卷
   ↓
5. 使用 Docker Compose 管理多服务
   ↓
6. 生产优化（多阶段构建、健康检查）
```

---

**✅ 第14章完成！字数：~2800**

---

### 第三部分总结

**第三部分：核心架构深度解析**（第8-14章）已完成！

| 章节 | 标题 | 字数 | 核心内容 |
|-----|------|-----|---------|
| 第8章 | Provider 模式（策略模式） | ~4200 | LLM Provider、工厂模式、工具调用 |
| 第9章 | Storage 层架构 | ~4800 | Session Store、Memory Store、文件锁、向量搜索 |
| 第10章 | Scheduler 并发控制 | ~3800 | Lane 调度、任务队列、并发控制 |
| 第11章 | Agent 核心（智能体） | ~4800 | Tool Calling 循环、上下文管理、错误处理 |
| 第12章 | Skills 系统（技能框架） | ~4200 | Skills Manager、热重载、Prompt 构建 |
| 第13章 | Gateway 接入层 | ~3500 | HTTP Server、WebSocket Server、ChatService |
| 第14章 | Docker 容器化部署 | ~2800 | Dockerfile、Docker Compose、生产优化 |

**第三部分总计**: ~28,100 字

---

**📊 整体进度更新**

### ✅ 已完成内容

| 部分 | 章节 | 字数 | 状态 |
|-----|------|-----|------|
| **总纲** | 0.1-0.6 | ~2500 | ✅ 完成 |
| **第一部分** | 第1-3章 | ~11500 | ✅ 完成 |
| **第二部分** | 第4-7章 | ~13800 | ✅ 完成 |
| **第三部分** | 第8-14章 | ~28100 | ✅ 完成 |

**文档总计**: ~55,900 字

---

**✅ 第三部分完成！核心架构深度解析部分已全部完成！**

---


