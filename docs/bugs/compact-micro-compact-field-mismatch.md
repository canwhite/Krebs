# Bug: `MicroCompactEntry` 字段名不匹配

## 影响范围

`.pi/extensions/compact/index.ts` + `server/services/compact/types.ts`

## 根因

**types 定义**（消费者）:
```typescript
// server/services/compact/types.ts
export interface MicroCompactEntry {
  originalMessageIndex: number;  // 期望这个字段名
  toolName: string;
  truncatedAt: number;
  originalContent: string;
}
```

**extension 写入**（生产者）:
```typescript
// .pi/extensions/compact/index.ts
api.appendEntry("micro_compact", {
  originalContent: content,
  toolName: target.toolMessage.toolName,
  truncatedAt: Date.now(),
  messageIndex: target.messageIndex,  // ← 字段名错误
});
```

写入 `messageIndex`，读取 `originalMessageIndex` → 得到 `undefined`。

## 修复

```typescript
(ctx.sessionManager as any).appendCustomEntry("micro_compact", {
  originalContent: content,
  toolName: target.toolMessage.toolName,
  truncatedAt: Date.now(),
  originalMessageIndex: target.messageIndex,  // Fixed
});
```

## 验证

- Build ✅
- TypeScript ✅（零错误）
