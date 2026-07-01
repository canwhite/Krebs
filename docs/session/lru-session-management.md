# LRU Session Management Plan

## Context

当前 session 管理存在以下问题：
1. `sessions Map`（内存）无大小限制
2. `sessions/` 目录（磁盘）无清理机制
3. session 文件包含完整对话历史，占用空间大

需要实现 LRU 缓存策略，最多保留 **30 条** session，超出时清理中间消息只保留最终结果。

## Requirements

1. **内存 sessions Map**：最多 30 条，超出时 evict 最老的
2. **磁盘 session 文件**：最多 30 条，超出时清理
3. **清理策略**：保留最终结果（最后一条 assistant 回复），清除中间消息

## Implementation Plan

### 1. 创建 LRU Session Manager

**文件**: `server/services/lru-session-manager.ts`（新建）

```typescript
// 核心数据结构
interface LRUSessionEntry {
  sessionId: string;
  lastAccess: number;
  filePath: string;
  finalResult?: string;  // 最后一条 assistant 回复
}

// LRU 双向链表实现
// 或使用 lru-cache 包（已在 node_modules）
```

### 2. 修改 Session Service

**文件**: `server/session-service.ts`

- 引入 LRU Session Manager
- 在 `sessions Map` 操作时同步更新 LRU
- 添加 eviction 触发逻辑

### 3. Session 文件清理

**文件**: `server/services/session-cleaner.ts`（新建）

- 扫描 `sessions/` 目录
- 按时间戳排序，保留最新 30 个
- 每个 session 文件只保留最终结果（建议保留最后 5 条消息）

### 4. 最终结果提取

从 session JSONL 文件中提取最后一条 assistant 消息内容，作为 `finalResult`。

## Files to Modify

| 文件 | 操作 |
|------|------|
| `server/session-service.ts` | 集成 LRU 管理 |
| `server/services/lru-session-manager.ts` | 新建，LRU 核心实现 |
| `server/services/session-cleaner.ts` | 新建，session 文件清理 |

## Trigger Timing

- **定时清理**：每小时检查一次
- **按需清理**：每次添加新 session 时检查并清理

## Verification

1. `bun run build` - 构建通过
2. `bunx tsc --noEmit` - 无类型错误
3. 创建 40+ sessions，验证：
   - sessions Map 大小 <= 30
   - sessions/ 目录文件数 <= 30
   - 被清理的 session 文件只保留最终结果（建议最后 5 条）

---

## Impact Analysis: Frontend & API

### 前端读取 Session 的方式

**1. `loadSessions()` → `/api/sessions/list`**
- 获取 session 列表，显示在 history dropdown
- 使用字段：`first_question`（标题）、`created_at`（时间）、`session_id`（删除用）

**2. `loadSessionMessages()` → `/api/sessions/${id}`**
- 获取指定 session 的所有消息
- 返回 `{ sessionId, messages: [{ role, content, timestamp }] }`
- 前端直接渲染 `messages` 数组

### 影响点

| API / 组件 | 影响 | 严重性 |
|-----------|------|--------|
| `/api/sessions/list` | 无影响，列表数据来自 `db/index.ts` 的 `sessions_meta` 表 | 低 |
| `/api/sessions/${id}` | **重大影响**，返回的消息从完整历史变成只有 1 条 | 高 |
| `chat.tsx` history dropdown | 无影响，显示的是 `first_question` | 低 |
| 切换 session 后消息显示 | **重大影响**，旧 session 只能看到最终结果 | 高 |

### 需要修改的前端

如果采用"只保留最终结果"策略，前端 `chat.tsx` 需要适配：
1. 加载旧 session 时，检测到只有 1 条消息时显示提示"此 session 的中间消息已被清理"
2. 或改用 `finalResult` 字段显示

---

## Pre-Mortem Analysis

### Risk 1: 活跃 Session 被 Evict

**问题**：正在处理的 session 被 LRU 判定为"最老"并清除，导致服务中断。

**解决方案**：
- LRU 只 evict `status !== "running"` 的 session
- eviction 前检查 `AgentSessionRuntime.status`
- 或用 `protectedSessions` Set 标记正在活跃的 session

---

### Risk 2: Session 文件清理丢失关键上下文

**问题**：session 文件清理后，最终结果可能丢失或无法反映完整上下文。

**解决方案**：
- 清理前先提取并保存 `finalResult` 到独立索引（如 SQLite）
- 或在清理时同时保存 session metadata（id, timestamp, finalResult）到 `db/index.ts`
- 保留 session 文件的 header（session info）而不仅是最终结果

---

### Risk 3: 并发清理导致数据竞争

**问题**：多个请求同时触发清理，或清理过程中新请求访问 session。

**解决方案**：
- 使用 `setInterval` 定时清理，不在每次添加时触发
- 添加 `isCleaning` 锁，防止并发清理
- 清理操作在独立的 async 队列中执行

---

### Risk 4: LRU 实现复杂度

**问题**：自己实现双向链表容易出 bug，维护成本高。

**解决方案**：
- 直接使用 `lru-cache` npm 包（已在 node_modules）
- 或使用 `Map` + `lastAccess` 时间戳排序（简单够用）

```typescript
// 简单 LRU 实现（无需额外依赖）
const sessions = new Map<string, LRUSessionEntry>();
function access(key: string) {
  const entry = sessions.get(key);
  sessions.delete(key);
  sessions.set(key, entry); // 移到最后（最新）
}
```

---

### Risk 5: 磁盘文件与内存 Map 不同步

**问题**：内存 Map 已 evict，但磁盘文件未清理，或反之。

**解决方案**：
- 统一入口：所有 session 操作都通过 LRU Session Manager
- LRU Manager 维护 `filePath` 映射，evict 时同时清理磁盘
- 启动时扫描磁盘，与内存 Map 重建同步

---

### Risk 6: 清理后用户仍需访问旧 Session

**问题**：用户查询历史 session 时发现已被清理。

**解决方案**：
- 保留 `finalResult` 到 `db/sessions` 表的 `summary` 字段
- API 支持查询已清理 session 的 summary
- 或只清理超时的 session（如 7 天前），而非简单按数量清理

---

### Risk 7: 前端切换 Session 后消息为空/不完整

**问题**：用户切换到被清理的 session 后，只看到 1 条 assistant 消息，无法看到完整的对话上下文。

**影响链**：
```
session 文件清理 → /api/sessions/${id} 返回 1 条消息 → 前端 loadSessionMessages() 只渲染 1 条 → 用户困惑
```

**解决方案**：
- 方案 A：前端适配 - 检测到只有 1 条消息时显示"中间消息已清理，仅显示最终结果"
- 方案 B：保留最后 N 条消息（不只是 1 条），如保留最后 5 条
- 方案 C：在 `db/sessions_meta` 添加 `summary` 字段，清理时保存摘要，API 返回摘要而非空消息

**推荐：方案 B** - 保留最后 5 条消息，平衡空间和可用性

---

### Risk 8: Session RAG / Search 功能受影响

**问题**：如果系统有基于 session 内容做 RAG 或搜索的功能，清理后内容不完整。

**解决方案**：
- 清理前先为 session 生成 summary/embedding
- RAG 使用 `db/index.ts` 中的 summary 而非原始文件
- 或将完整内容归档到冷存储

---

### Risk 9: 30 条限制导致频繁清理

**问题**：30 条对于生产环境可能太少，导致：
- 旧 session 频繁被清理
- 用户常用的 session 可能被不常用的挤出

**解决方案**：
- 添加"pin/favorite" session 功能，被 pin 的不参与 LRU 清理
- 或增加限制到 50-100 条
- 或按时间+访问频率综合排序，而非纯 LRU

---

### Risk 10: session-service.ts 与 db/index.ts 数据不一致

**问题**：内存和 SQLite 的 session meta 数量不一致。

**当前架构**：
- `session-service.ts` 的 `sessions Map` 管理运行时 session
- `db/index.ts` 的 `sessions_meta` 表管理 session 元数据（列表用）

**清理时的操作顺序**：
1. 先从 `sessions Map` evict（运行时）
2. 再清理 `sessions/` 文件
3. 最后更新 `sessions_meta` 表（可选删除或标记）

**风险**：如果步骤 2 或 3 失败，会导致：
- `sessions_meta` 指向不存在的文件
- 或内存有但数据库没有

**解决方案**：
- 使用事务确保一致性
- 启动时做完整性检查，清理孤立数据

---

### Risk 11: first_question 字段过时

**问题**：`db/index.ts` 的 `first_question` 是创建时保存的，但 session 内容清理后，first_question 可能与实际内容不匹配。

**影响**：history 列表显示的标题可能误导用户。

**解决方案**：
- 清理时同步更新 `first_question` 为 `finalResult` 的前 30 字符
- 或新增 `display_title` 字段专门用于列表显示

---

### Risk 12: sessions Map 被多处直接访问，绕过 LRU Manager

**问题**：发现以下文件直接操作 `sessions` Map，绕过我计划中的 LRU Session Manager：

| 文件 | 操作 |
|------|------|
| `SwitchSessionHandler.ts:87` | `sessions.set(message.sessionId, runtime)` |
| `SwitchSessionHandler.ts:92` | `sessions.delete(oldSessionId)` |
| `server/index.ts:279,283` | `sessions.get()` / `sessions.delete()` |

**影响**：即使实现了 LRU Session Manager，这些代码仍然直接操作 Map，导致 LRU tracking 失效。

**解决方案**：
- 方案 A：**重构 sessions Map 访问** - 将 `sessions` Map 封装为 class，只通过 `addSession()`, `removeSession()`, `getSession()` 方法访问
- 方案 B：**Instrument sessions Map** - 创建一个 proxy 包装 sessions，在所有 `set/delete` 操作时自动更新 LRU
- 方案 C：**仅监控不清洗** - LRU Manager 只记录/警告，不主动 evict，只在定时任务中清理磁盘

**推荐：方案 A** - 最干净，但需要重构所有访问点

---

### Risk 13: Extension 持有 session 引用，清理后无效

**问题**：多个 Extension 可能在内部缓存了 session 引用或消息：

| Extension | 潜在问题 |
|-----------|----------|
| `memory-extension` | 可能缓存了 session 消息用于 RAG |
| `session-history-rag` | 可能维护了 session → 消息的映射 |
| `self-verification` | 可能缓存了 correction 历史 |
| `goal-constraint` | 可能维护了 session 状态 |

**影响**：即使我们清理了 session 文件，这些 Extension 内部的缓存仍然持有旧引用，导致：
- 内存泄漏
- RAG 结果不一致
- 状态错误

**解决方案**：
- 在清理 session 文件前，先通知所有 Extension 进行清理
- 或在 Extension 中实现与 LRU Manager 联动的清理回调
- 或限制 Extension 持有引用的时间

---

### Risk 14: Session 切换时 race condition

**问题**：当前 `SwitchSessionHandler.ts` 的切换逻辑（第74-93行）存在潜在 race condition：

```typescript
// 第74行：检查是否存在
const existingRuntime = sessions.get(message.sessionId);
// 第87行：设置为新的
sessions.set(message.sessionId, runtime);
```

如果在步骤 A 和 B 之间，另一个请求也执行了切换，可能导致：
- 覆盖而非替换
- 旧的 runtime 被 dispose 但实际还在被使用

**影响**：session 切换可能失败或导致数据丢失。

**解决方案**：
- 使用 `sessions` Map 的 mutation 需要加锁
- 或使用 atomic swap 操作
- 或在 ws.data 中维护 runtime 引用，不依赖全局 Map

---

### Risk 15: 清理时 session 正在写入文件

**问题**：session 文件正在被写入时（agent 还在运行时），清理任务可能误判 session 为"完成"并清理。

**影响**：
- 清理了正在活跃使用的 session 文件
- agent 可能正在写入 tool result 到文件

**解决方案**：
- **核心**：只有 `status !== "running"` 的 session 才能被清理
- 检查 `AgentSessionRuntime.session.isStreaming` 状态
- 在清理前获取文件锁（如果支持）
- 延迟清理：先标记为"待清理"，等 session 真正结束后再清理

---

### Risk 16: WebSocket 连接持有旧 session 引用

**问题**：即使清理了 session，如果某个 WebSocket 连接仍然保持着对旧 session runtime 的引用，该连接会处于不一致状态。

**当前架构**：
- `(ws as any).data.runtime` 持有 runtime 引用
- `(ws as any).data.session` 持有 session 引用
- `SwitchSessionHandler` 在切换时才更新这些引用

**影响**：用户切换到新 session 后，旧 session 应该被清理，但 WebSocket 可能仍然持有引用。

**解决方案**：
- 在 `session_switched` 事件后，确保旧 runtime 被正确 dispose
- 检查 `(ws as any).data.sessionId` 与 `sessions` Map 的一致性
- 定期检查 ws 连接持有的 session 是否仍然有效

---

### Risk 17: Session History RAG Index 与实际文件不同步

**问题**：`session-history-rag/indexer.ts` 的 `buildIndex()` 从 `sessions_meta` 获取 session 列表，但 index 会缓存 24 小时。

**当前行为**：
1. session 文件被清理 → 只保留最后 5 条消息
2. `sessions_meta` 记录仍存在（未删除）
3. index 缓存 24 小时，包含已清理的 session
4. RAG 查询时，`extractAssistantContent(filePath)` 读取已清理的文件 → 返回空内容
5. 最终结果：RAG 跳过该 session，但 index 有无效条目

**影响**：
- 轻微：index 中有无用的 session 条目（浪费一点内存）
- RAG 查询会尝试读取已清理的文件（I/O 浪费）
- 当缓存过期后重建 index，才会把已清理的 session 从 index 中移除

**更深层问题**：如果同时删除 `sessions_meta` 记录，index 会立即移除，但 `retrievedSessions` (Map) 可能有缓存。

**解决方案**：
- 方案 A：LRU 清理时同步更新 `sessions_meta`，而不是保留记录
- 方案 B：LRU 清理后调用 `rebuildIndex()` 强制重建 index
- 方案 C：接受现状（轻微浪费，可忽略）

**推荐：方案 B** - 在清理后调用 `rebuildIndex()`，确保 index 一致性

---

### Risk 18: 清理后 DB 和 File 的一致性边界不清晰

**问题**：当前架构中，多个地方维护着 session 相关数据：

| 数据源 | 存储内容 |
|--------|----------|
| `sessions/` 文件 | 完整消息历史 |
| `db/sessions_meta` | session 元数据（id, first_question, file_path, created_at） |
| `sessions Map` | 内存中的 runtime |
| `retrievedSessions Map` | RAG 用，去重（TTL 10分钟） |
| `indexCache` | BM25 索引（TTL 24小时） |

**清理时的操作顺序**：
```
1. 从 sessions Map evict
2. 清理 session 文件（只保留最后5条）
3. 更新 sessions_meta？（删除 or 保留）
4. 清理 retrievedSessions？（如果清理了对应 session）
5. 标记 indexCache 无效，触发 rebuild
```

**问题**：如果在步骤 3 选择"保留 sessions_meta"，会导致：
- `sessions_meta` 指向已清理的文件
- 用户仍然可以看到 session 列表，但打开后消息不完整

如果在步骤 3 选择"删除 sessions_meta"：
- 用户看不到这个 session 了
- 但 `retrievedSessions` 和 `indexCache` 仍然有引用

**解决方案**：
- 定义清晰的清理策略：**同时删除 sessions_meta 记录**
- 清理步骤：
  1. 提取 finalResult 保存到归档（可选）
  2. 删除 session 文件
  3. 删除 sessions_meta 记录
  4. 从 retrievedSessions 移除
  5. 触发 index rebuild（标记 cache 无效即可）
- 重要：**不要单独只做某一步**，要作为原子操作或事务

---

### Risk 19: subagent sessionStates 与主 session 生命周期不同步

**问题**：`server/services/subagent/agent-manager.ts` 中维护了 `sessionStates` Map：

```typescript
const sessionStates = new Map<string, SessionState>();
// SessionState = { queue, records, maxConcurrent }
```

这个 Map 按 `parentSessionId` 组织，存储所有 subagent 的状态。

**当前行为**：
- `cleanupAgents(parentSessionId)` 可以清理某个 session 的所有 subagent 状态
- 但 **LRU 清理 session 时不会调用 `cleanupAgents`**
- 可能导致：parent session 被清理，但 subagent 的 sessionStates 记录仍存在

**影响**：
- 内存泄漏：subagent 的状态永远不会被清理
- `listAgents()` 和 `getAgentResult()` 仍然可以查询到"已死亡"的 subagent
- 如果用户重新创建同名 session，会看到旧的 subagent 记录

**解决方案**：
- 在 LRU 清理 session 前，先调用 `cleanupAgents(sessionId)` 清理所有 subagent
- 或在 `sessionStates` 中添加"parent session 有效性"检查
- 或定期清理孤立的 sessionStates（没有对应 runtime 的）

---

### Risk 20: LRU 清理触发时机与 session 活跃期重叠

**问题**：假设使用定时清理（每小时一次），但某个 session 可能在：
- 第 59 分钟时还在活跃运行
- 第 60 分钟时被定时任务清理
- 但 session 实际上还没结束

**或者**：
- 用户打开 session A，10分钟后切换到 session B
- session A 现在是"不活跃"但还没完成
- 定时清理可能在下一小时清理掉 session A

**影响**：用户的 session 在"暂停"状态时被清理。

**解决方案**：
- **不使用定时清理**，只在 session 完成（agent_end）后才考虑清理
- 或使用"访问时间"而非"创建时间"作为 LRU 排序依据
- 活跃的 session（有 WebSocket 连接的）永远不清理

---

### Risk 21: 30 条限制对小团队可能足够，但对长期运行实例不足

**问题**：如果 Krebs 作为长期运行的服务（部署在服务器上不重启）：

| 场景 | 30 条能撑多久 |
|------|---------------|
| 每天 10 个 session | 3 天 |
| 每天 50 个 session | 12 小时 |
| 持续开发 1 周 | 70+ sessions，超出 2 倍多 |

**影响**：对于长期运行的实例，30 条限制太激进，会导致历史 session 快速丢失。

**解决方案**：
- 将 30 条改为可配置：`process.env.MAX_SESSIONS || 30`
- 或者改为"保留最近 N 天"的策略：`process.env.MAX_SESSION_AGE_DAYS || 7`
- 或两者结合：取 `min(30, N天)`

---

### Risk 22: SQLite 没有事务支持，cleanup 不是原子的

**问题**：`db/index.ts` 没有使用任何事务。当前代码：

```typescript
// saveSessionMeta - 直接 INSERT，没有事务
stmt.run(id, sessionId, firstQuestion, filePath, Date.now());

// deleteSessionFromDb - 直接 DELETE，没有事务
const result = stmt.run(sessionId);
```

**影响**：
- Risk 10 的解决方案说"使用事务确保一致性"，但实际上 **Bun:sqlite 的 stmt.run() 不是原子的**
- 如果 cleanup 过程中在步骤 2（删除文件）和步骤 3（删除 DB 记录）之间崩溃，会导致：
  - 文件已删除，但 DB 记录还在 → `sessions_meta` 指向不存在的文件
  - 或者文件还在，但 DB 记录已删除 → 用户看不到但文件占用空间

**检查**：Bun:sqlite 支持事务吗？

```typescript
// 需要验证是否支持：
db.exec("BEGIN TRANSACTION");
// ... operations ...
db.exec("COMMIT"); // 或 ROLLBACK
```

**解决方案**：

```typescript
// 方案 A：使用 Bun:sqlite 事务（如果支持）
export function cleanupSessionAtomic(sessionId: string, filePath: string): boolean {
  try {
    db.exec("BEGIN TRANSACTION");
    // 1. 删除文件
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    // 2. 删除 DB 记录
    const stmt = db.prepare('DELETE FROM sessions_meta WHERE session_id = ?');
    stmt.run(sessionId);
    db.exec("COMMIT");
    return true;
  } catch (e) {
    db.exec("ROLLBACK");
    console.error(`[CLEANUP] Failed: ${e}`);
    return false;
  }
}

// 方案 B：补偿事务（如果不支持 BEGIN TRANSACTION）
// 先标记为 "pending_delete"，然后删除，最后确认
// 如果任何步骤失败，标记为 "orphaned" 供下次处理
```

**推荐：方案 A** - 如果 Bun:sqlite 不支持事务，再降级到方案 B

---

### Risk 23: 文件删除操作没有错误处理，导致不一致

**问题**：`server/routes/sessions.ts:96` 的文件删除：

```typescript
unlinkSync(sessionMeta.file_path);  // 没有 try-catch！
```

**影响**：
- 如果文件不存在，`unlinkSync` 抛出异常
- 如果权限不足，抛出异常
- 异常导致整个 delete 操作失败，用户收到错误，但 DB 可能已经部分更新

**当前代码**：
```typescript
// 第94-101行
if (sessionMeta && sessionMeta.file_path) {
  try {
    unlinkSync(sessionMeta.file_path);
    console.log(`[DELETE] Deleted session file: ${sessionMeta.file_path}`);
  } catch (error: any) {
    console.error(`[DELETE] Failed to delete session file: ${error.message}`);
  }
}
// 继续删除 DB 记录，不管文件删除是否成功
```

**问题**：文件删除失败后仍然删除 DB 记录，导致不一致。

**解决方案**：

```typescript
// 修改 handleDeleteSession
if (sessionMeta && sessionMeta.file_path) {
  try {
    unlinkSync(sessionMeta.file_path);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // 文件已不存在，继续删除 DB 记录
      console.log(`[DELETE] File already gone: ${sessionMeta.file_path}`);
    } else if (error.code === 'EPERM' || error.code === 'EACCES') {
      // 权限问题，不删除 DB，标记需要手动处理
      console.error(`[DELETE] Permission denied: ${sessionMeta.file_path}`);
      return Response.json(
        { error: "权限不足，无法删除文件" },
        { status: 403 }
      );
    } else {
      // 其他错误，回滚 - 不删除 DB 记录
      console.error(`[DELETE] Failed to delete file: ${error.message}`);
      return Response.json(
        { error: "文件删除失败" },
        { status: 500 }
      );
    }
  }
}
// 只有文件删除成功（或文件本来就不存在）时才删除 DB 记录
deleteSessionFromDb(sessionId);
```

**LRU Cleanup 应该使用事务版本（见 Risk 22 方案 A）**

---

### Risk 24: 同步文件操作可能阻塞事件循环

**问题**：多处使用同步文件操作：

```typescript
// session-service.ts:29
readFileSync(filePath, "utf-8")

// routes/sessions.ts:29
readFileSync(filePath, "utf-8")
// routes/sessions.ts:96
unlinkSync(sessionMeta.file_path)
```

**影响**：
- 在 WebSocket 请求处理中，同步 I/O 会阻塞事件循环
- 如果文件很大或磁盘慢，可能导致请求卡顿
- 高并发时可能影响整体性能

**解决方案**：
- 改为异步版本：`await Bun.file(path).text()` 或 `fs.promises`
- LRU cleanup 在独立 worker/线程中执行（如果可能）
- 或接受现状（session 文件通常不大，影响有限）

---

### Risk 25: 外部删除文件导致 DB 与磁盘不一致

**问题**：用户可能通过 shell 直接删除 `sessions/` 目录下的文件：

```bash
rm /Users/Admin/Desktop/Krebs/sessions/*.jsonl
```

**影响**：
- DB 记录还在，但文件已不存在
- `getSessionMessages()` 会返回 null，但用户仍然可以看到 session 在列表里
- 点击后看到"Session 不存在或文件路径无效"

**当前行为**：`getSessionMessages()` 会检查 `existsSync(filePath)`，如果不存在返回 null。

**解决方案**：
- 启动时做完整性检查：扫描 `sessions/` 目录，对比 `sessions_meta` 表
- 清理孤立的 DB 记录
- 或接受现状（用户主动删除文件是罕见情况）

---

### Risk 26: 清理过程中新请求访问导致数据竞争

**问题**：即使有 `isCleaning` 锁，清理过程中的操作顺序仍有问题：

```
时间线：
T1: 清理任务开始，isCleaning = true
T2: 新请求到达，尝试读取 session X
T3: 清理任务正在删除 session X 的文件
T4: 新请求读取到不完整的文件（正在被删除）
T5: 清理任务删除 DB 记录
T6: 新请求发现 session 消失了
```

**影响**：
- 用户在清理过程中访问 session，看到不一致状态
- 可能读取到正在写入的文件，导致解析错误

**解决方案**：

```typescript
// 使用 atomic rename 实现安全删除
async function safeDeleteSession(sessionId: string, filePath: string): Promise<boolean> {
  const tempPath = `${filePath}.deleting.${Date.now()}`;

  try {
    // 1. 重命名为临时名称（原子操作）
    if (existsSync(filePath)) {
      await Bun.file(filePath).rename(tempPath);
    }

    // 2. 现在可以安全删除，不会与读取冲突
    await Bun.file(tempPath).delete();

    // 3. 删除 DB 记录（在文件删除之后）
    db.prepare('DELETE FROM sessions_meta WHERE session_id = ?').run(sessionId);

    return true;
  } catch (e) {
    // 失败时尝试恢复原文件名
    if (existsSync(tempPath)) {
      await Bun.file(tempPath).rename(filePath);
    }
    console.error(`[SAFE_DELETE] Failed: ${e}`);
    return false;
  }
}

// 读取时检查是否为 "删除中" 状态
function isFileDeleting(filePath: string): boolean {
  return filePath.includes('.deleting.');
}
```

**注意**：读取操作需要在文件不存在或为 `.deleting.` 状态时返回友好错误，而不是静默失败。

---

### Risk 27: 磁盘空间耗尽导致写入失败

**问题**：如果 session 文件不断增长（包含大量工具调用和结果），磁盘空间可能耗尽。

**场景**：
- 用户运行一个大型任务，生成了 100MB 的 session 文件
- 磁盘只剩 50MB
- 新请求无法创建新 session 或写入文件

**当前行为**：Bun 写入文件时如果磁盘满会抛出异常，但异常处理可能不完善。

**影响**：
- 新 session 无法创建
- 现有 session 无法追加消息
- agent 运行到一半崩溃

**解决方案**：

```typescript
// 检查磁盘空间的阈值
const MIN_DISK_SPACE_GB = 1;
const EMERGENCY_CLEANUP_COUNT = 5;

async function checkDiskSpaceAndCleanup(): Promise<void> {
  // Bun 没有直接的 statfs，需要用 fspromises.statfs
  const stats = await fs.promises.statfs('/');
  const availableBytes = stats.bavail * stats.bsize;
  const availableGB = availableBytes / (1024 ** 3);

  console.log(`[DISK] Available: ${availableGB.toFixed(2)} GB`);

  if (availableGB < MIN_DISK_SPACE_GB) {
    console.warn(`[DISK] Low disk space! Running emergency cleanup`);
    // 立即清理最老的 5 个 session
    await emergencyCleanup(EMERGENCY_CLEANUP_COUNT);
  }
}

// 启动时和定时检查
setInterval(checkDiskSpaceAndCleanup, 5 * 60 * 1000); // 每 5 分钟
```

---

### Risk 28: Session 文件损坏导致解析失败

**问题**：session 文件是 JSONL 格式，如果文件损坏（如写入中断），解析会失败。

**当前代码**：`routes/sessions.ts:34-66` 遍历每行 JSON.parse，如果一行损坏会跳过：

```typescript
for (const line of lines) {
  try {
    const data = JSON.parse(line);  // 如果损坏，这行被跳过
    if (data.type === "message") { ... }
  } catch (e) {
    // Skip invalid JSON lines  ← 静默忽略
  }
}
```

**影响**：
- 消息丢失但不知道
- 用户看到不完整的 session 内容
- RAG 读取损坏文件时行为不确定

**解决方案**：

```typescript
// 方案 A：使用 atomic write（推荐）
// 写入时先写 temp 文件，完成后 rename
async function writeSessionLineAtomic(filePath: string, line: string): Promise<void> {
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  await Bun.write(tempPath, line + '\n');
  await Bun.file(tempPath).rename(filePath, { overwrite: true }); // atomic overwrite
}

// 方案 B：验证文件完整性
function validateSessionFile(filePath: string): { valid: boolean; error?: string } {
  try {
    const content = Bun.file(filePath).text();
    const lines = content.split('\n').filter(Boolean);
    let validLineCount = 0;
    let invalidLineCount = 0;

    for (const line of lines) {
      try {
        JSON.parse(line);
        validLineCount++;
      } catch {
        invalidLineCount++;
      }
    }

    if (invalidLineCount > 0) {
      return {
        valid: false,
        error: `${validLineCount} valid, ${invalidLineCount} invalid lines`
      };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: String(e) };
  }
}

// 清理前验证
async function cleanupSession(sessionId: string): Promise<boolean> {
  const meta = getSessionById(sessionId);
  if (!meta) return false;

  const validation = validateSessionFile(meta.file_path);
  if (!validation.valid) {
    console.warn(`[CLEANUP] Skipping corrupted file: ${meta.file_path}, ${validation.error}`);
    return false;
  }

  return safeDeleteSession(sessionId, meta.file_path);
}
```

---

### Risk 29: 大 Session 文件导致内存压力

**问题**：一个 session 文件可能很大（如包含大量代码修改），读取到内存时可能 OOM。

**场景**：
- 用户运行一个生成了 10MB session 文件的任务
- 同时运行 10 个这样的 session
- 总内存占用 100MB+

**影响**：
- 服务 OOM 崩溃
- 读取大文件时阻塞事件循环

**解决方案**：
- 对 session 文件大小设置上限（如 10MB）
- 超过上限时自动压缩/归档
- 使用流式读取而非一次性读取整个文件

---

### Risk 30: 多个 WebSocket 连接同时访问同一 Session

**问题**：用户可能打开多个浏览器 tab，都连接到同一个 session。

**当前代码**：
- `server/index.ts` 每个 WebSocket 连接创建独立的 runtime 引用
- 但 `sessions Map` 是共享的

**影响**：
- 两个连接同时向同一个 session 写入，可能导致文件写入冲突
- 消息顺序错乱
- 或两个连接看到不同的 session 状态

**解决方案**：
- 检测同一 session 的多个连接，只允许一个活跃连接
- 其他连接显示"session 已被其他连接使用"
- 或使用文件锁机制

---

### Risk 31: LRU 排序依赖时间戳，时钟回跳导致排序错误

**问题**：LRU 依赖 `Date.now()` 或 `lastAccess` 时间戳排序。如果：

- 系统时钟回跳（NTP 校正）
- 用户修改系统时间
- 虚拟机时间不同步

**影响**：
- LRU 排序错误
- 刚访问的 session 被错误地"最老"而优先清理

**解决方案**：
- 使用 `process.hrtime.bigint()` 而非 `Date.now()` 获得单调递增的时间
- 或使用访问计数器而非时间戳排序
- 定期用访问计数器重排 LRU 顺序

---

### Risk 32: 没有 Graceful Shutdown，进程被 kill 时 session 数据丢失

**问题**：服务器没有处理 `SIGTERM` / `SIGINT` 信号。如果进程被强制终止：

- 正在写入的 session 文件可能损坏（部分写入）
- 内存中的 session runtime 来不及 flush 到磁盘
- `sessions Map` 中的数据全部丢失

**当前代码**：没有 signal handler。

```typescript
// server/index.ts:48
process.exit(1);  // 直接退出，没有任何清理
```

**影响**：
- 用户最近的 session 可能丢失
- session 文件可能损坏，无法读取
- 下次启动时需要从磁盘重建内存状态

**解决方案**：

```typescript
// server/index.ts 添加 graceful shutdown
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[SHUTDOWN] Received ${signal}, starting graceful shutdown...`);

  // 1. 停止接受新 WebSocket 连接
  server.stop();

  // 2. 等待所有 in-flight requests 完成（最多 30 秒）
  const shutdownTimeout = 30000;
  const startTime = Date.now();

  // 3. Flush 所有 sessions 到磁盘（调用 runtime.dispose()）
  for (const [sessionId, runtime] of sessions) {
    try {
      await runtime.dispose();
      console.log(`[SHUTDOWN] Flushed session: ${sessionId}`);
    } catch (e) {
      console.error(`[SHUTDOWN] Failed to flush ${sessionId}: ${e}`);
    }

    if (Date.now() - startTime > shutdownTimeout) {
      console.warn(`[SHUTDOWN] Timeout, forcing exit`);
      break;
    }
  }

  // 4. 关闭数据库连接
  db.close();

  console.log(`[SHUTDOWN] Done, exiting with code 0`);
  process.exit(0);
}

// 注册 signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

---

### Risk 33: Session 事件订阅未清理，导致内存泄漏

**问题**：`event-subscription.ts` 中的 `subscribeToSessionEvents` 返回 `unsubscribe` 函数，但如果：

- session 被清理时没有调用 unsubscribe
- WebSocket 断开时没有清理订阅

**影响**：
- 事件监听器累积，内存泄漏
- 已"清理"的 session 仍然触发事件处理
- CPU 使用率逐渐升高

**检查代码**：
```typescript
// SwitchSessionHandler.ts:50-58
const oldUnsubscribe = (ws as any).data.unsubscribe;
if (oldUnsubscribe) {
  try {
    oldUnsubscribe();  // 看起来有清理
  } catch (e) { ... }
}
```

**问题**：但 LRU 清理时是否有调用 unsubscribe？

**解决方案**：
- 在 `deleteSession()` 中确保调用 unsubscribe
- 或使用 weak reference 允许 GC

---

### Risk 34: Session 超时配置固定，无法动态调整

**问题**：`session-service.ts:217-220` 硬编码了超时时间：

```typescript
const SESSION_TIMEOUT_MS = parseInt(
  process.env.SESSION_TIMEOUT_MS || "480000",  // 8 分钟
);
```

**影响**：
- 长时间运行的任务会被强制终止
- 用户无法根据任务复杂度调整超时
- 8 分钟对某些任务可能不够

**LRU 清理时的影响**：
- 超时后 session 会被"认为已完成"
- 但实际可能还在运行

**解决方案**：
- 将超时时间改为可配置
- 添加 session 续期机制（heartbeat）
- 区分"空闲超时"和"最大运行时长"

---

### Risk 35: Temp 文件清理不完整，磁盘空间逐渐减少

**问题**：session 文件写入使用 append 模式，但如果写入过程中崩溃，会留下不完整的 temp 文件。

**检查**：
```typescript
// memory/storage.ts 使用 appendFileSync
appendFileSync(path, formatted, "utf-8");
```

**影响**：
- 每次写入可能创建隐式的 temp 文件
- 异常崩溃后 temp 文件不会被清理
- 磁盘空间逐渐减少但找不到原因

**解决方案**：
- 使用显式的 temp 文件 + atomic rename
- 定期扫描 `sessions/` 目录，删除非 `.jsonl` 文件
- 启动时清理任何非标准的文件

---

### Risk 36: Session 文件名冲突导致数据覆盖

**问题**：session 文件由 PI SDK 创建，路径格式可能存在冲突。

**检查**：`session-service.ts:165`:
```typescript
const sessionManager = SessionManager.create(cwd, join(cwd, "sessions"));
// sessionManager 内部如何生成文件名？
```

**影响**：
- 如果两个 session 同时创建且时间戳相同，可能覆盖
- 用户看到别人的 session 数据

**解决方案**：
- 确认 PI SDK 使用唯一文件名（UUID 或足够随机）
- 添加文件存在性检查
- 清理前备份（如果担心覆盖）

---

### Risk 37: 非 .jsonl 文件被错误处理

**问题**：`session-history/indexer.ts:43` 只处理 `.jsonl` 文件：

```typescript
if (!meta.file_path.endsWith('.jsonl')) continue;
```

**影响**：
- 如果 PI SDK 创建了非 `.jsonl` 文件，会被忽略
- 但 `sessions_meta` 仍然记录该文件
- 用户看到 session 在列表里，但打开时文件被跳过

**LRU 清理时的影响**：
- 清理逻辑假设所有文件都是 `.jsonl`
- 如果有其他格式文件，可能处理不当

**解决方案**：
- 清理时验证文件类型
- 如果不是 `.jsonl`，删除并从 `sessions_meta` 移除
- 或拒绝非 `.jsonl` 文件进入系统

---

### Risk 38: 数据库连接没有错误恢复，文件损坏导致服务崩溃

**问题**：`db/index.ts` 在模块加载时创建数据库连接：

```typescript
const db = new Database(dbPath);  // 一次性连接，无重试机制
db.exec(`CREATE TABLE IF NOT EXISTS...`);  // 没有错误处理
```

**影响**：
- 如果 `sessions.db` 被删除或损坏，服务器无法启动
- 数据库操作失败时没有重试
- 没有备份机制

**LRU 清理时的影响**：
- 如果清理操作导致 DB 锁定或损坏，影响整个系统

**解决方案**：
- 添加数据库连接健康检查
- 实现定期备份 `sessions.db` 到 `sessions.db.backup`
- 添加 DB 损坏检测，启动时尝试从备份恢复
- 添加连接重试机制
