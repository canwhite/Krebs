# Self-Verification Plan

## Context

在 agent 结束时（用 `turn_end` 近似）验证结果是否正确，最多修正 5 次。与 Goal Constraint 互补：
- **Goal Constraint**："你在做对的事吗？" — 检测偏离目标
- **Self-Verification**："你做的事对吗？" — 检测结果错误

跳过前两次 turn，避免过早验证误判。

## 核心问题

- pi-coding-agent 没有 `before_agent_end` hook
- 用 `turn_end` 事件近似"结束前"验证
- 跳过前两次 turn，之后才开始验证

## 与 Goal Constraint 的互补关系

| | Goal Constraint | Self-Verification |
|--|----------------|-------------------|
| 时机 | context 事件（每轮） | turn_end（每轮，跳过前2次） |
| 检查 | 是否偏离目标 | 结果是否正确 |
| 触发 | 漂移检测 | 验证（通过/失败） |
| 注入 | 纠正消息 | 修正消息 |

两者独立运作，互不干扰。

## 架构设计

```
用户消息 → turn 1 → turn 2 → turn 3+ → 验证 FAIL → 修正 → turn N+1 → 验证 PASS → 结束
                                    ↓
                               最多修正5次
```

**关键洞察**：用 `turn_end` 事件，在跳过前两次后开始验证，每次失败注入修正消息让 agent 继续。

## 状态管理

```typescript
const sessionStates = new Map<string, SessionState>();

interface SessionState {
  originalGoal: string;
  turnCount: number;         // 当前 turn 数
  retryCount: number;        // 已注入的修正次数
  pendingCorrection: string | null;
}
```

## 实施步骤

### Step 1: 创建 Types

**文件**: `server/services/self-verification/types.ts`

```typescript
export const SELF_VERIFICATION_MARKER = "[SELF-VERIFICATION]";
export const MAX_RETRIES = 5;
export const SKIP_FIRST_N_TURNS = 2;  // 跳过前两次 turn

export interface SessionState {
  originalGoal: string;
  turnCount: number;
  retryCount: number;
  pendingCorrection: string | null;
  lastVerifiedContent: string;  // 避免重复验证同一个内容
}

export interface VerificationResult {
  passed: boolean;
  reason?: string;
}
```

### Step 2: 创建验证 LLM 调用

**文件**: `server/services/self-verification/llm.ts`

验证重点：回答是否合理解决了用户的问题（不验证代码执行和事实核实）。

```typescript
export async function verifyResult(
  result: string,
  originalGoal: string,
  ctx: any
): Promise<VerificationResult> {
  const prompt = `
你是验证助手。检查 Agent 的回答是否解决了用户的问题。

## 用户原始目标
${originalGoal}

## Agent 回答
${result}

## 验证标准（满足所有才 PASS）：
1. **相关性**：回答是否针对用户的问题，没有答非所问
2. **完整性**：用户要求的主要部分是否都有涉及
3. **逻辑性**：推理过程是否自洽，没有明显矛盾
4. **清晰度**：表达是否清晰，没有混淆或歧义

## 注意
- 不要验证代码是否能运行（需要实际执行）
- 不要验证事实准确性（需要查询外部知识）
- 专注于：回答是否合理地解决了用户的问题

## 输出格式
PASS - 所有标准满足
FAIL: <具体原因> - 指出哪个标准没满足及原因
`;

  try {
    // 调用 LLM...
  } catch (e) {
    return { passed: true };  // 验证 LLM 失败时默认 PASS
  }
}
```

### Step 3: 创建 Extension

**文件**: `.pi/extensions/self-verification/index.ts`

```typescript
import type { ExtensionAPI, TurnEndEvent, BeforeAgentStartEvent, ContextEvent } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";
import { MAX_RETRIES, SKIP_FIRST_N_TURNS, SELF_VERIFICATION_MARKER, type SessionState } from "../../../server/services/self-verification/types.js";
import { verifyResult } from "../../../server/services/self-verification/llm.js";

const sessionStates = new Map<string, SessionState>();

function getSessionState(sessionId: string): SessionState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      originalGoal: "",
      turnCount: 0,
      retryCount: 0,
      pendingCorrection: null,
      lastVerifiedContent: "",
    });
  }
  return sessionStates.get(sessionId)!;
}

function getLastAssistantContent(message: any): string {
  if (!message.content) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");
}

function isSelfVerificationMessage(msg: any): boolean {
  if (!msg.content) return false;
  const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  // 匹配 [SELF-VERIFICATION] 或 [SELF-VERIFICATION-N]
  return content.includes(SELF_VERIFICATION_MARKER);
}

export default function (api: ExtensionAPI) {
  // 1. 捕获原始目标（每次新用户消息时更新）
  api.on("before_agent_start", (event: BeforeAgentStartEvent, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);

    // 新的用户消息，清除 pending 和所有状态
    if (state.pendingCorrection !== null) {
      console.log(`[SelfVerification] New user message, clearing pending`);
    }
    state.pendingCorrection = null;
    state.originalGoal = event.prompt;
    state.retryCount = 0;
    state.lastVerifiedContent = "";
    state.turnCount = 0;  // 重置 turnCount，新任务从头开始
    console.log(`[SelfVerification] New task: ${event.prompt.substring(0, 50)}...`);

    return {};
  });

  // 2. 每个 turn 结束时验证（跳过前两次）
  api.on("turn_end", async (event: TurnEndEvent, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);

    state.turnCount++;
    console.log(`[SelfVerification] Turn ${state.turnCount} ended`);

    // 跳过前 N 次 turn
    if (state.turnCount <= SKIP_FIRST_N_TURNS) {
      console.log(`[SelfVerification] Skipping (turn ${state.turnCount} <= ${SKIP_FIRST_N_TURNS})`);
      return;
    }

    // 如果有待注入的修正消息（不重复验证同一个内容）
    if (state.pendingCorrection) {
      console.log(`[SelfVerification] Pending correction exists, will inject in context`);
      return;
    }

    // 超过最大修正次数，不再验证/修正
    if (state.retryCount >= MAX_RETRIES) {
      console.log(`[SelfVerification] Max corrections (${MAX_RETRIES}) reached`);
      return;
    }

    // 获取本 turn 的结果
    const result = getLastAssistantContent(event.message);
    if (!result) {
      console.log(`[SelfVerification] No result to verify`);
      return;
    }

    // 不重复验证同一个内容
    if (result === state.lastVerifiedContent) {
      console.log(`[SelfVerification] Same content, skipping`);
      return;
    }
    state.lastVerifiedContent = result;

    // 调用 LLM 验证
    const verification = await verifyResult(result, state.originalGoal, ctx);

    if (!verification.passed) {
      state.retryCount++;
      console.log(`[SelfVerification] Correction ${state.retryCount}/${MAX_RETRIES}: ${verification.reason}`);

      // 设置待注入的修正消息，在 context 事件中注入（带序号区分）
      state.pendingCorrection = `${SELF_VERIFICATION_MARKER}-${state.retryCount} ${verification.reason}\n请修正并继续。`;
    } else {
      console.log(`[SelfVerification] Verification passed`);
    }
  });

  // 3. context 事件：注入修正消息（参考 Goal Constraint 方式）
  api.on("context", async (event: ContextEvent, ctx): Promise<{ messages?: any[] }> => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);

    // 如果有待注入的修正消息
    if (state.pendingCorrection) {
      // 过滤掉之前的修正消息，避免循环
      event.messages = event.messages.filter(m => !isSelfVerificationMessage(m));

      // 注入修正消息
      event.messages.unshift({
        role: "user",
        content: state.pendingCorrection,
        id: "self-verification-correction"
      } as any);

      console.log(`[SelfVerification] Injected correction via context`);
      state.pendingCorrection = null;

      return { messages: event.messages };
    }

    return {};
  });

  // 4. Session 结束时清理
  api.on("session_shutdown", (_, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    if (sessionId) {
      sessionStates.delete(sessionId);
    }
  });
}
```

### Step 4: 注册 Extension

**文件**: `server/session-service.ts` 中的 `extensionFactories` 数组

```typescript
import selfVerificationExtension from "./extensions/self-verification/index.js";

extensionFactories: [
  // ... existing extensions
  selfVerificationExtension,
]
```

## 关键文件

| 文件 | 作用 |
|------|------|
| `server/services/self-verification/types.ts` | 类型定义和常量 |
| `server/services/self-verification/llm.ts` | LLM 验证逻辑 |
| `.pi/extensions/self-verification/index.ts` | Extension 入口，监听 turn_end |

## 与 Goal Constraint 的分工

- **Goal Constraint**：在 context 事件中检测漂移，注入纠正消息（方向）
- **Self-Verification**：在 turn_end 事件中验证结果，注入修正消息（结果）

两者独立，不重复。

## 验证方法

1. `bun run build` — 必须通过
2. `bunx tsc --noEmit` — 零错误
3. 启动服务器，发送需要修正的消息，验证：
   - Turn 1, 2：跳过验证
   - Turn 3+：开始验证
   - 验证失败注入修正消息
   - 达到 5 次上限后停止

## 风险及缓解

| 风险 | 缓解措施 |
|------|---------|
| 验证 LLM 增加延迟 | 只在 turn_end 时验证，不是每轮都验证 |
| 验证 prompt 太简单 | 4 个详细标准 + FAIL 时给出具体原因 |
| 修正消息循环 | 使用 `[SELF-VERIFICATION]` 标记过滤 |
| 超过 MAX_RETRIES 后继续注入 | 达到上限后不再注入修正 |
| 重复验证同一内容 | 使用 lastVerifiedContent 去重 |
