# Session 历史记录显示错乱问题修复

## 问题描述

用户报告了一个 session 历史记录显示错乱的 bug：
- 点击"能给我讲个笑话吗"的会话，显示的内容却是"你能干啥"的回答
- 点击"你能干啥"的会话，显示的内容却是"笑话"的回答

## 问题原因

### 根本原因

在 `server.ts` 中，session 元数据保存时使用了错误的文件映射逻辑。代码通过查找"最新的 session 文件"来关联 session ID：

```typescript
// 问题代码
const sessionsPath = join(process.cwd(), "sessions");
const sessionFiles = readdirSync(sessionsPath);
const latestFile = sessionFiles
  .filter(f => f.endsWith(".jsonl"))
  .sort()
  .reverse()[0] || "";
const sessionFilePath = latestFile ? join(sessionsPath, latestFile) : "";
```

### 为什么会出错

当多个 session 同时创建时：
1. 用户 A 打开页面，创建 session_A，问"能给我讲个笑话吗"
2. PI SDK 创建 session 文件：`session_A.jsonl`
3. 用户 B 打开页面，创建 session_B，问"你能干啥"
4. PI SDK 创建 session 文件：`session_B.jsonl`

由于文件名是按时间戳生成的，`session_B.jsonl` 会比 `session_A.jsonl` 更新。

**问题发生**：
- 当保存 session_A 的元数据时，代码查找"最新"文件，找到了 `session_B.jsonl`
- 于是 session_A 的元数据错误地指向了 session_B 的文件
- 反之亦然

这就是为什么点击"笑话"会话却显示了"你能干啥"的内容。

## 修复方案

### PI SDK 提供的正确方法

`AgentSession` 类已经提供了 `sessionFile` 属性，可以直接获取当前 session 对应的文件路径：

```typescript
class AgentSession {
  /** Current session file path, or undefined if sessions are disabled */
  get sessionFile(): string | undefined;
}
```

### 修复代码

#### 1. API 路由修复 (`handleApiMessage`)

**修复前**：
```typescript
await session.prompt(message);

// Save session meta after first message is sent (file must exist now)
const sessionsPath = join(process.cwd(), "sessions");
const sessionFiles = readdirSync(sessionsPath);
const latestFile = sessionFiles
  .filter(f => f.endsWith(".jsonl"))
  .sort()
  .reverse()[0] || "";
const sessionFilePath = latestFile ? join(sessionsPath, latestFile) : "";

if (!sessionId) {
  saveSessionMeta(usedSessionId, message, sessionFilePath);
}
```

**修复后**：
```typescript
// Get session file path from PI SDK (created when session is initialized)
const sessionFilePath = session.sessionFile;

await session.prompt(message);

if (!sessionId && sessionFilePath) {
  saveSessionMeta(usedSessionId, message, sessionFilePath);
}
```

#### 2. WebSocket 路由修复 (`message` handler)

**修复前**：
```typescript
const firstMessageSaved = (ws as any).data?.firstMessageSaved;
if (!firstMessageSaved) {
  const cwd = process.cwd();
  const sessionsPath = join(cwd, "sessions");
  const sessionFiles = readdirSync(sessionsPath);
  const latestFile = sessionFiles
    .filter(f => f.endsWith(".jsonl"))
    .sort()
    .reverse()[0] || "";
  const filePath = latestFile ? join(sessionsPath, latestFile) : "";

  if (filePath) {
    saveSessionMeta(sessionId!, data.message, filePath);
    (ws as any).data.firstMessageSaved = true;
  }
}
```

**修复后**：
```typescript
const firstMessageSaved = (ws as any).data?.firstMessageSaved;
if (!firstMessageSaved) {
  // Get session file path from PI SDK (created when session is initialized)
  const filePath = session.sessionFile;

  if (filePath) {
    saveSessionMeta(sessionId!, data.message, filePath);
    (ws as any).data.firstMessageSaved = true;
  }
}
```

## 关键要点

1. **不要假设文件创建顺序**：多个 session 可能同时创建，"最新"文件不一定属于当前 session
2. **使用 SDK 提供的 API**：PI SDK 的 `session.sessionFile` 属性提供了正确的映射
3. **在创建 session 时就获取文件路径**：不要等到发送消息后再去查找

## 验证方法

1. 清空旧的 session 数据：
   ```bash
   rm -f db/sessions.db
   rm -f sessions/*.jsonl
   ```

2. 重启服务器：
   ```bash
   bun --hot server.ts
   ```

3. 创建多个不同的会话，然后点击历史记录验证内容是否正确匹配
