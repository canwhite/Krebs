# Self-Verification

## 解决的问题

在 Agent 结束时验证其回答是否正确，失败时让 Agent 继续修正，最多修正 5 次。

## 与 Goal Constraint 的互补关系

| | Goal Constraint | Self-Verification |
|--|----------------|-------------------|
| 时机 | context 事件（每轮） | turn_end（每轮，跳过前2次） |
| 检查 | "你在做对的事吗？" | "你做的事对吗？" |
| 触发 | 漂移检测 | 验证（通过/失败） |
| 注入 | 纠正消息 | 修正消息 |

两者独立运作，互不干扰：
- **Goal Constraint**：检测是否偏离目标（方向）
- **Self-Verification**：检测结果是否正确（结果）

## 核心流程

```
用户消息 → turn 1 → turn 2 → turn 3+ → 验证 FAIL → 修正 → turn N+1 → 验证 PASS → 结束
                                    ↓
                               最多修正5次
```

## 架构设计

- 使用 `turn_end` 事件在每个 turn 结束时验证
- 跳过前两次 turn，避免过早验证误判
- 验证失败时，通过 `context` 事件注入修正消息（参考 Goal Constraint 方式）
- 修正消息带序号 `[SELF-VERIFICATION]-N` 区分不同修正

## 验证标准

1. **相关性**：回答是否针对用户的问题，没有答非所问
2. **完整性**：用户要求的主要部分是否都有涉及
3. **逻辑性**：推理过程是否自洽，没有明显矛盾
4. **清晰度**：表达是否清晰，没有混淆或歧义

注意：不验证代码是否能运行（需要实际执行），不验证事实准确性（需要查询外部知识）。

## 关键文件

| 文件 | 作用 |
|------|------|
| `server/services/self-verification/types.ts` | 类型定义和常量 |
| `server/services/self-verification/llm.ts` | LLM 验证逻辑 |
| `.pi/extensions/self-verification/index.ts` | Extension 入口 |

## 注册方式

在 `server/session-service.ts` 中的 `extensionFactories` 数组添加：

```typescript
import selfVerificationExtension from "../.pi/extensions/self-verification/index.js";

extensionFactories: [
  // ... existing extensions
  selfVerificationExtension,
]
```

## 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `SKIP_FIRST_N_TURNS` | 2 | 跳过前两次 turn |
| `MAX_RETRIES` | 5 | 最多修正次数 |
