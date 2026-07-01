# Bugs

> 2026-06-30 / 2026-07-01 发现并修复的问题记录

## 目录

### Memory 模块

| 文件 | 描述 |
|------|------|
| [memory-extensions-append-entry-returns-void](memory-extensions-append-entry-returns-void.md) | `api.appendEntry` 返回 void，entry ID 丢失，导致 invalidation 机制无法实现 |
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

## 已知局限（暂未实现）

以下问题已识别但尚未修复，留作后续处理：

1. **Rollback/Invalidation 触发路径不存在** — `isInvalidated()` 检查已实现，`INVALIDATION_ENTRY_TYPE` 已定义，但无代码主动创建 invalidation entry。当前为 append-only 设计。
2. **Memory consolidation 触发盲区** — token 使用率从 49% 跳到 72% 会跳过整个 `[50%, 70%)` 窗口，consolidation 不会被触发。
3. **Context Collapse 重复压缩** — 如果 `shouldCollapse` 在同一次 context hook 中多次返回 true（messages 被修改后仍超过阈值），可能产生多个投影嵌套。当前无保护。
