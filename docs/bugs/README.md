# Bugs

> 2026-06-30 / 2026-07-01 发现并修复的问题记录

## 目录

### Memory 模块

| 文件 | 描述 |
|------|------|
| [memory-extensions-append-entry-returns-void](memory-extensions-append-entry-returns-void.md) | `api.appendEntry` 返回 void，entry ID 丢失；修复后 consolidation entry ID 可获取 |
| [memory-context-empty-header-detection](memory-context-empty-header-detection.md) | `trim()` 导致空 header `"# Memory\n\n"` 检测失败，被错误注入到 systemPrompt |

### Compact 模块

| 文件 | 描述 |
|------|------|
| [compact-micro-compact-field-mismatch](compact-micro-compact-field-mismatch.md) | `MicroCompactEntry.originalMessageIndex` 字段名与写入端不匹配 |
| [compact-generate-summary-stub](compact-generate-summary-stub.md) | `generateSummary` 是 stub 无 LLM 调用；`shouldCollapse` 除零风险 |

### Session / Frontend

| 文件 | 描述 |
|------|------|
| [session-transcript-extract-turn-event-think-content](session-transcript-extract-turn-event-think-content.md) | `extractFromTurnEvent` 将 think 内容也提取，turn 结束后 think 被重新渲染 |

---

## 分类统计

| 类别 | 数量 |
|------|------|
| Memory extensions | 2 |
| Compact extensions | 2 |
| Session / Frontend | 1 |
| **Total** | **5** |

## 修复状态

- [x] memory-extensions-append-entry-returns-void
- [x] memory-context-empty-header-detection
- [x] compact-micro-compact-field-mismatch
- [x] compact-generate-summary-stub
- [x] session-transcript-extract-turn-event-think-content

---

## 已知局限（暂未实现）

以下问题已识别但尚未修复，留作后续处理：

### 1. Memory consolidation 触发盲区

**位置**: `.pi/extensions/memory/index.ts` 第 21 行触发条件

```typescript
if (usage.percent >= MEMORY_THRESHOLD && usage.percent < MEMORY_THRESHOLD_MAX) {
```

**问题**: `percent` 从 0.49 跳到 0.72 时，单次 `context` 事件直接跳过整个 `[50%, 70%)` 窗口，consolidation 不会触发。

**触发条件**: 需要模拟 token 使用率快速跳变的场景验证。

---

### 2. Invalidation entry 创建路径不存在

**位置**: `server/services/memory/engine.ts` + `server/services/memory/types.ts`

**问题**: `isInvalidated()` 检查函数已实现（第 34-42 行），`INVALIDATION_ENTRY_TYPE` 已定义。但**没有任何代码创建过 invalidation entry**。即使想废弃旧的 consolidation，也没有触发路径。

**现状**: 当前为 append-only 设计，每次 consolidation 只追加新 entry，不废弃旧的。旧的 consolidation entry 会一直留在 session entries 中。

**触发条件**: 需要在"需要废弃旧 consolidation"的明确场景出现时再实现。

---

### 3. Context Collapse 重复压缩 → 已排除

**结论**: 经代码分析，`emitContext` 在每次 LLM call 只运行一次（`runner.js`），不存在同一次 call 内重复触发风险。此条不是 bug。

