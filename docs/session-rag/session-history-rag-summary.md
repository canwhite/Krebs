# Session History RAG 核心总结

## 解决的问题

在每次 `before_agent_start` 阶段自动检索相关历史会话，注入 system prompt，避免 Agent 重复回答同一问题。

## 核心流程

```
用户消息 → hook触发 → ①每session只检索一次 → ②context已满则跳过
→ ③用户意图跳过（"重新"/"clear"）→ ④获取/构建索引 → ⑤query分词
→ ⑥BM25检索top5 → ⑦提取助手回答top2 → ⑧score去重 → ⑨长度截断
→ ⑩格式化为markdown → 返回 { systemPrompt }
```

## 核心代码

**BM25 检索**（`bm25.ts`）：
```typescript
// IDF
const idf = Math.log((N - d + 0.5) / (d + 0.5) + 1);
// TF归一化
const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * docLen / avgDocLen));
score += idf * tfNorm;
```
k1=1.5 控制词频饱和，b=0.75 控制文档长度归一化。

**每 session 只检索一次**（`index.ts`）：
```typescript
const retrievedSessions = new Map<string, number>();
function markRetrieved(sid: string): boolean {
  if (retrievedSessions.has(sid)) return false;
  retrievedSessions.set(sid, Date.now());
  return true;
}
```
Map 存 timestamp，每100次清理10分钟前过期 entry。

**内容提取**（`storage.ts`）：只提取 `role: assistant` 的 `type: text` 内容，跳过 tool_call，按句子边界截断。

**索引缓存**（`indexer.ts`）：version + sessionCount + 24h TTL 三重失效条件，Promise lock 防止并发重复构建。

## 分层架构

Extension Hook（`.pi/extensions/session-history-rag/`）负责业务编排，导入 `server/services/session-history/` 中的工具函数（bm25、storage、indexer）实现检索逻辑。

## 安全保护

| 层级 | 机制 |
|------|------|
| P0 | 所有错误 try-catch，永不 throw |
| P0 | `usage.percent > 80%` 跳过 |
| P1 | 3s timeout + 意图过滤 + score去重 |
