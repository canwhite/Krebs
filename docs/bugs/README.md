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

### Self-Verification

| 文件 | 描述 |
|------|------|
| [self-verification-parse-undefined](self-verification-parse-undefined.md) | `parseVerificationResponse` 未处理 API 返回空 content，导致 `undefined.startsWith` 抛出 TypeError |

---

## 分类统计

| 类别 | 数量 |
|------|------|
| Memory extensions | 2 |
| Compact extensions | 2 |
| Session / Frontend | 1 |
| Self-Verification | 1 |
| **Total** | **6** |

## 修复状态

- [x] memory-extensions-append-entry-returns-void
- [x] memory-context-empty-header-detection
- [x] compact-micro-compact-field-mismatch
- [x] compact-generate-summary-stub
- [x] session-transcript-extract-turn-event-think-content
- [x] self-verification-parse-undefined
