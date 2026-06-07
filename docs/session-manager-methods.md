# SessionManager 存储方法调研

## 概述

`SessionManager` 负责管理对话会话的存储，支持多种存储策略。会话以树形结构存储在 JSONL 文件中，每个会话包含消息、分支、压缩摘要等信息。

## 可用的存储方法

### 1. SessionManager.inMemory(cwd?)

**类型**：静态方法

**描述**：创建内存中的会话，不进行文件持久化

**特点**：
- ✅ 会话完全在内存中，不写入磁盘
- ✅ 适合测试或临时会话
- ❌ 程序重启后会话丢失
- ❌ 无法恢复之前的对话

**使用场景**：
- 开发和测试
- 不需要持久化的临时对话
- 隐私敏感的对话（不想记录到磁盘）

**示例**：
```typescript
const sessionManager = SessionManager.inMemory(cwd);
```

---

### 2. SessionManager.create(cwd, sessionDir?)

**类型**：静态方法

**描述**：创建新的持久化会话，保存到文件系统

**特点**：
- ✅ 会话持久化到磁盘
- ✅ 程序重启后可以恢复
- ✅ 可以继续之前的对话
- 📁 默认存储位置：`~/.pi/agent/sessions/<encoded-cwd>/`

**参数**：
- `cwd` - 工作目录
- `sessionDir` - 可选，自定义会话目录

**使用场景**：
- 正式使用，需要持久化
- 长期项目，需要保存对话历史
- 需要恢复之前的对话

**示例**：
```typescript
const sessionManager = SessionManager.create(process.cwd());
// 或指定自定义目录
const sessionManager = SessionManager.create(process.cwd(), "./my-sessions");
```

---

### 3. SessionManager.open(path, sessionDir?)

**类型**：静态方法

**描述**：打开已存在的会话文件

**特点**：
- ✅ 加载已有的会话
- ✅ 可以查看和继续历史对话
- ✅ 支持分支会话的导航

**参数**：
- `path` - 会话文件路径
- `sessionDir` - 可选，用于新分支/恢复的目录

**使用场景**：
- 恢复之前的对话
- 查看历史会话
- 分支操作

**示例**：
```typescript
// 加载特定会话
const sessionManager = SessionManager.open("./sessions/session_abc123.json");

// 或从列表中选择后打开
const sessions = await SessionManager.list(cwd);
const sessionManager = SessionManager.open(sessions[0].path);
```

---

### 4. SessionManager.continueRecent(cwd, sessionDir?)

**类型**：静态方法

**描述**：继续最近的会话，如果不存在则创建新会话

**特点**：
- ✅ 自动找到最近的会话
- ✅ 如果没有会话则创建新的
- ✅ 适合"恢复上次的工作"场景

**使用场景**：
- 程序启动时自动恢复上次对话
- 用户期望继续之前的工作

**示例**：
```typescript
// 程序启动时自动恢复
const sessionManager = SessionManager.continueRecent(process.cwd());
```

---

### 5. SessionManager.forkFrom(sourcePath, targetCwd, sessionDir?)

**类型**：静态方法

**描述**：从其他项目目录分叉会话到当前项目

**特点**：
- ✅ 复制完整的对话历史
- ✅ 跨项目迁移对话
- ✅ 保留所有分支和上下文

**使用场景**：
- 将对话从一个项目迁移到另一个项目
- 在不同项目中复用对话上下文

**示例**：
```typescript
// 从项目 A 复制会话到项目 B
const sessionManager = SessionManager.forkFrom(
  "./project-a/sessions/session_abc.json",
  "/path/to/project-b"
);
```

---

### 6. SessionManager.list(cwd, sessionDir?, onProgress?)

**类型**：静态方法

**描述**：列出指定目录的所有会话

**特点**：
- ✅ 获取会话列表
- ✅ 包含会话元信息（名称、时间、消息数等）
- ✅ 支持进度回调（加载大量会话时）

**返回**：`Promise<SessionInfo[]>`

**SessionInfo 包含**：
- `path` - 会话文件路径
- `id` - 会话 ID
- `cwd` - 工作目录
- `name` - 用户定义的显示名称
- `created` - 创建时间
- `modified` - 修改时间
- `messageCount` - 消息数量
- `firstMessage` - 第一条消息预览
- `allMessagesText` - 所有消息的文本

**使用场景**：
- 会话浏览器/选择器
- 显示历史对话列表

**示例**：
```typescript
const sessions = await SessionManager.list(process.cwd());
console.log(`找到 ${sessions.length} 个会话`);
sessions.forEach(session => {
  console.log(`- ${session.name || session.id}: ${session.messageCount} 条消息`);
});
```

---

### 7. SessionManager.listAll(onProgress?)

**类型**：静态方法

**描述**：列出所有项目目录的所有会话

**特点**：
- ✅ 跨所有项目获取会话
- ✅ 全局会话搜索

**使用场景**：
- 全局会话管理界面
- 跨项目会话搜索

**示例**：
```typescript
const allSessions = await SessionManager.listAll();
console.log(`全局共有 ${allSessions.length} 个会话`);
```

---

## 会话文件结构

会话以 JSONL 格式（每行一个 JSON 对象）存储，树形结构：

```
{"type": "session", "version": 3, "id": "...", "timestamp": "...", "cwd": "..."}
{"type": "message", "id": "msg1", "parentId": null, "message": {...}}
{"type": "message", "id": "msg2", "parentId": "msg1", "message": {...}}
{"type": "message", "id": "msg3", "parentId": "msg2", "message": {...}}
{"type": "thinking_level_change", "id": "change1", "parentId": "msg3", "thinkingLevel": "high"}
```

## 方法对比

| 方法 | 持久化 | 适用场景 |
|------|--------|----------|
| `inMemory()` | ❌ 否 | 测试、临时对话 |
| `create()` | ✅ 是 | 创建新会话 |
| `open()` | ✅ 是 | 加载已有会话 |
| `continueRecent()` | ✅ 是 | 恢复最近会话 |
| `forkFrom()` | ✅ 是 | 跨项目复制会话 |
| `list()` | ✅ 是 | 获取会话列表 |
| `listAll()` | ✅ 是 | 全局会话列表 |

## 当前配置

当前项目使用的是 **内存存储**：

```typescript
sessionManager: SessionManager.inMemory(),
```

**注意事项**：
- ❌ 程序重启后所有对话会丢失
- ❌ 无法恢复之前的对话
- ✅ 适合开发和测试
- ✅ 无磁盘 I/O，性能最好

## 建议的生产配置

对于生产环境，建议使用持久化存储：

```typescript
// 选项 1：每次启动创建新会话
sessionManager: SessionManager.create(process.cwd()),

// 选项 2：启动时恢复最近会话（推荐）
sessionManager: SessionManager.continueRecent(process.cwd()),

// 选项 3：指定自定义会话目录
sessionManager: SessionManager.create(process.cwd(), "./sessions"),
```

## 实例方法

SessionManager 实例还提供了丰富的操作方法：

### 导航方法
- `branch(branchFromId)` - 从指定位置创建新分支
- `resetLeaf()` - 重置到开始位置
- `getBranch(fromId)` - 获取从根到指定节点的路径

### 内容管理
- `appendMessage()` - 添加消息
- `appendThinkingLevelChange()` - 记录思考级别变化
- `appendModelChange()` - 记录模型切换
- `appendCompaction()` - 添加压缩摘要
- `appendCustomEntry()` - 添加自定义数据
- `appendSessionInfo()` - 设置会话信息

### 查询方法
- `getEntries()` - 获取所有条目
- `getTree()` - 获取树形结构
- `buildSessionContext()` - 构建 LLM 上下文
- `getHeader()` - 获取会话头信息

## 相关文件

- `node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts` - 完整 API 定义
- `examples/sdk/11-sessions.ts` - 会话管理示例代码
