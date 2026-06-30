# Goal Constraint System - Implementation Plan

## Context

用户在25%、40%、55% token阈值时，希望系统自动：
1. 总结核心目标和key metrics（用户问题+AI回复）
2. 检测最近20条context是否偏离核心目标
3. 如偏离严重，通过注入用户消息拉回正轨

触发机制：利用现有框架hook
漂移判定：语义相似度 + 关键词匹配率 混合
纠正方式：注入用户消息

---

## Architecture

```
server/services/goal-constraint/
├── index.ts              # Main exports
├── engine.ts             # GoalConstraintEngine (orchestrator)
├── llm.ts               # Goal extraction via LLM
├── embedding.ts          # Memlight BM25-based keyword extraction + scoring
├── semantic.ts           # Drift detection using BM25
├── storage.ts            # GoalStorage (SQLite persistence)
├── types.ts              # TypeScript interfaces + constants

.pi/extensions/goal-constraint/
└── index.ts             # Extension entry (hooks into framework)
```

---

## Premortem: Known Issues and Mitigations

### Issue 1: Hook `context` Event Mutability
**Risk**: `event.messages` may be read-only, cannot prepend
**Mitigation**: Based on existing `contextCollapser.ts` usage, returning `{ messages }` IS supported. Extension receives mutable array.
**Status**: ✅ Verified - contextCollapser uses this pattern successfully

### Issue 2: Token Usage API May Not Exist
**Risk**: `session.getContextUsage()` API signature unknown
**Mitigation**: `ctx.getContextUsage()` exists and returns `{ tokens, contextWindow }`
**Status**: ✅ Verified - contextCollapser uses `ctx.getContextUsage()` at line 31

### Issue 3: Token-Frequency Embedding is Semantically Weak
**Risk**: "修复bug" and "引入bug" have similar tokens but opposite meaning
**Mitigation**: Use keyword presence/absence as primary signal; keep BM25 as secondary; tune threshold lower (0.5)
**Status**: ✅ RESOLVED - Replaced with Memlight (BM25) keyword scoring, keyword is primary signal

### Issue 4: Memory Leak in Session State Map
**Risk**: `engines` Map grows unbounded
**Mitigation**: Use `WeakMap` keyed by session object, or clean on `session_shutdown`
**Status**: ⚠️ Need to verify `session_shutdown` event exists

### Issue 5: Correction Message Cascading
**Risk**: Correction message becomes part of context, may trigger another drift detection
**Mitigation**:
- Mark correction messages with `id: "goal_constraint_correction"` and skip them in drift detection
- Add cooldown period (e.g., don't re-check for 3 turns after correction)
**Status**: ✅ Solution identified

### Issue 6: Empty Initial State
**Risk**: First few messages have no goal to compare against
**Mitigation**: Require at least 3 user messages before enabling drift detection; skip drift check if `coreGoals.length === 0`
**Status**: ✅ Solution identified

### Issue 7: SQLite Concurrency
**Risk**: Multiple sessions writing simultaneously may cause lock contention
**Mitigation**: Use WAL mode; batch writes; consider in-memory cache for threshold status
**Status**: ✅ WAL mode will be used

### Issue 8: Framework Version Compatibility
**Risk**: API changes on pi-coding-agent upgrade
**Mitigation**: Pin dependency version; wrap API calls with try/catch and degrade gracefully
**Status**: ⚠️ Standard risk

### Issue 9: Threshold Conflict with Context Collapse ⚠️ CRITICAL
**Risk**: Context Collapse triggers at 75%, Goal Constraint at 73% - nearly identical
**Problem**:
```
LAYER_THRESHOLDS from contextCollapse.ts:
  budget_reduction: 0.50
  snip: 0.60
  micro_compact: 0.70
  context_collapse: 0.75  <-- Goal Constraint 73% is too close!
```
**Mitigation**:
- Option A: Move Goal Constraint thresholds to 25%, 40%, 55% (avoiding overlap with existing layers)
- Option B: Integrate Goal Constraint INTO contextCollapser as a sub-feature
- Option C: Disable contextCollapse when goal-constraint is active

**Decision**: Option A - Reassign thresholds to avoid conflict
```
NEW THRESHOLDS: 25%, 40%, 55%
```

### Issue 10: Duplicate Entry Appending
**Risk**: Both goal-constraint and contextCollapser may append entries for same event
**Mitigation**: Check for existing entries before appending; use unique entry types
**Status**: ⚠️ Need to investigate `api.appendEntry()` behavior

### Issue 11: Extension Execution Order ⚠️ VERIFIED
**Risk**: Unknown which extension runs first (goal-constraint vs contextCollapse)
**Mitigation**: Extensions execute in `extensionFactories` array order
**Status**: ✅ Verified - `resource-loader.js` iterates `extensionFactories` sequentially

**Implication**: If registered order is `[goalConstraint, contextCollapser]`:
1. goal-constraint runs first (checks 25/40/55%)
2. contextCollapser runs second (checks 75%)
3. If goal-constraint prepends correction, contextCollapser sees modified messages

**Decision**: goal-constraint should NOT modify the messages array it returns, only prepend correction via event.messages.unshift(). The return value modifications happen after all extensions run.

### Issue 12: Shared State Between Mechanisms
**Risk**: If goal-constraint at 40% and contextCollapse at 75% both modify context, state may diverge
**Mitigation**: Both read from same `ctx.getContextUsage()` and append to same session
**Status**: ✅ Should be OK - they operate at different thresholds

### Issue 13: Message Filtering Uses Unsafe Any Cast
**Risk**: Using `(m as any).id` to filter correction messages is type-unsafe
**Problem**: Standard `Message` type (UserMessage | AssistantMessage | ToolResultMessage) has no `id` field
**Mitigation**:
- Use content-based filtering: check if `content.includes("[GOAL CONSTRAINT]")`
- Or extend the Message type via declaration merging
**Status**: ✅ RESOLVED - Use content-based filtering (Issue 16)

### Issue 14: SessionShutdown Event Name
**Risk**: `session_shutdown` event may not exist or have different name
**Mitigation**: Verified - `SessionShutdownEvent` exists with `type: "session_shutdown"`
**Status**: ✅ Verified in types.d.ts line 358

### Issue 15: Threshold Calculation Basis
**Risk**: Unclear whether 25%, 40%, 55% are relative to contextWindow or current usage
**Verification**:
```
percent = tokens / contextWindow
where tokens = current token count
      contextWindow = 204800 (from MODEL_CONFIG)

Therefore:
  25% = ~51K tokens
  40% = ~82K tokens
  55% = ~113K tokens
```
**Status**: ✅ Verified - percent = tokens / contextWindow

### Issue 16: Content-Based Correction Filtering (替代 Issue 13)
**Risk**: Using `(m as any).id` is type-unsafe
**Solution**: Use content-based filtering instead
```typescript
// Instead of: (m as any).id !== CORRECTION_MESSAGE_ID
// Use: content.includes("[GOAL CONSTRAINT]")
function isCorrectionMessage(msg: AgentMessage): boolean {
  if (typeof msg.content === "string") {
    return msg.content.includes("[GOAL CONSTRAINT]");
  }
  return false;
}
```
**Status**: ✅ Solution identified

### Issue 17: Goal Extraction Quality ⚠️ UPDATED
**Risk**: Current implementation uses "first 200 chars of user message as goal" - too simplistic
**Problem**:
- User messages may contain multiple intents
- 200 chars may cut mid-sentence
- No semantic understanding of actual goals
**Impact**: Drift detection will be unreliable if goals are poorly extracted

**Investigation Results**:
- ✅ ExtensionContext has `ctx.model` (provider, baseUrl, modelId)
- ✅ ExtensionContext has `ctx.modelRegistry.getApiKeyForProvider(provider)`
- ⚠️ No built-in LLM call API in ExtensionContext
- ⚠️ contextCollapser.generateSummary() is a STUB (TODO, returns placeholder)

**Decision**: Option A - Use LLM for goal extraction (with fallback)

LLM调用实现方案：
```typescript
// server/services/goal-constraint/llm.ts
const GOAL_EXTRACTION_PROMPT = `从以下对话中提取核心目标和关键指标。

请以JSON格式返回：
{
  "goals": ["目标1", "目标2", ...],
  "metrics": [{"name": "指标名", "value": "指标值"}, ...]
}

要求：
- goals: 识别用户真正想要完成的任务（最多5个）
- metrics: 识别可量化的指标（如文件数、错误数、代码行数等）
- 用中文回答
- 只返回JSON，不要其他内容`;

// 实现见 llm.ts 第674-725行
```

**Trade-off**: LLM调用有延迟和成本，但提高了goal提取质量。fallback到heuristics保证最终可用性。

---

### Issue 18: Embedding Implementation - Memlight (BM25-based) ⚠️ UPDATED

**Decision**: Use Memlight (BM25 keyword matching) instead of Ollama embeddings

**Why Memlight**:
- No external service dependency (unlike Ollama)
- Lightweight, fast keyword-based retrieval
- Already implemented and tested in session-history-rag
- Avoids 768-dim vector overhead

**Implementation** (reuses session-history-rag components):
```typescript
// server/services/goal-constraint/embedding.ts
// Now delegates to BM25 from session-history-rag
import { bm25Search, preprocessForQuery } from './bm25.js';
import { buildIndex } from './indexer.js';

const K1 = 1.5;
const B = 0.75;

// For goal embedding, we store keywords instead of vectors
export interface GoalKeywords {
  keywords: string[];
  tokenCount: number;
}

// Extract keywords from goal text (reuses session-history-rag tokenizer)
export async function extractGoalKeywords(text: string): Promise<GoalKeywords> {
  const normalized = text.normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').toLowerCase();
  const tokens = preprocessForQuery(normalized);
  return {
    keywords: tokens,
    tokenCount: tokens.length
  };
}

// Build a mini index for goals (in-memory, not persisted)
export function buildGoalIndex(goals: { id: string; keywords: string[] }[]): Map<string, GoalIndexEntry> {
  const entries = new Map();
  for (const goal of goals) {
    entries.set(goal.id, {
      goalId: goal.id,
      keywords: goal.keywords,
      tokenCount: goal.keywords.length
    });
  }
  return entries;
}

// Score recent messages against goals using BM25
export function scoreGoalDrift(
  messageTokens: string[],
  goalIndex: Map<string, GoalIndexEntry>,
  avgGoalTokenCount: number
): Map<string, number> {
  const scores = new Map();
  const N = goalIndex.size;
  if (N === 0) return scores;

  // Compute document frequency for each message token across goals
  const df = new Map<string, number>();
  for (const qt of messageTokens) {
    let count = 0;
    for (const entry of goalIndex.values()) {
      if (entry.keywords.includes(qt)) count++;
    }
    df.set(qt, count);
  }

  for (const [goalId, entry] of goalIndex) {
    let score = 0;
    for (const qt of messageTokens) {
      const tf = entry.keywords.filter(t => t === qt).length;
      if (tf === 0) continue;

      const d = df.get(qt) ?? 0;
      const idf = Math.log((N - d + 0.5) / (d + 0.5) + 1);
      const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * entry.tokenCount / (avgGoalTokenCount || 1)));

      score += idf * tfNorm;
    }
    scores.set(goalId, score);
  }

  return scores;
}
```

**Note**: Uses the same BM25 algorithm as session-history-rag, but for in-memory goal scoring. No external Ollama service required.

---

### Issue 19: Threshold State Persistence ⚠️ NEW

**Risk**: `thresholdsHit` only exists in memory. If session is persisted and resumed, thresholdsHit resets.

**Impact**: Same threshold could trigger multiple times after session resume.

**Current Status**: `thresholdsHit` is a `Set<number>` in `SessionState` - purely in-memory.

**Options**:
1. Accept risk - threshold triggers are idempotent, just regenerate summary
2. Persist to SQLite alongside goal_summaries table
3. Check existing summaries in storage before generating new one

**Decision**: Option 1 (Accept) + Option 3 (Check storage)

```typescript
// In checkTokenThresholds()
async function checkTokenThresholds(sessionId: string, usage: ContextUsage): Promise<number | null> {
  const thresholds = [25, 40, 55];
  const existing = storage.getAllGoalSummaries(sessionId);
  const triggeredThresholds = new Set(existing.map(s => s.threshold));

  for (const threshold of thresholds) {
    const percent = (usage.tokens / usage.contextWindow) * 100;
    if (percent >= threshold && !triggeredThresholds.has(threshold)) {
      return threshold;
    }
  }
  return null;
}
```

**Status**: ⚠️ Need to implement - the engine.ts stub uses in-memory check

---

### Issue 20: detectDrift Implementation is Incomplete ⚠️ CRITICAL

**Risk**: `engine.detectDrift()` returns hardcoded `hasDrifted: false` - drift detection never actually triggers

**Current State** (engine.ts line 561-563):
```typescript
// TODO: 实现实际的漂移检测逻辑
// 需要使用 semantic.ts 中的 SemanticAnalyzer 计算 hybrid score
return { hasDrifted: false, semanticSimilarity: 1, keywordMatchRate: 1, hybridScore: 1, dominantGoal: null, details: "Not implemented" };
```

**Required Implementation**:
1. Tokenize recent messages using `preprocessForQuery()`
2. Build goal index using `buildGoalIndex()`
3. Score using `scoreGoalDrift()`
4. Calculate hybrid score with weights 0.4 BM25 + 0.6 keyword
5. Return actual drift result

**Status**: ❌ TODO - must implement before release

---

### Issue 21: recordCorrection Method Missing ⚠️ CRITICAL

**Risk**: Extension calls `engine.recordCorrection()` but this method doesn't exist on `GoalConstraintEngine`

**Location**: Extension line 847:
```typescript
engine.recordCorrection();
state.correctionCooldownTurns = GOAL_CONSTRAINT_THRESHOLDS.CORRECTION_COOLDOWN_TURNS;
```

**Fix Required**: Add `recordCorrection()` method to `GoalConstraintEngine`:
```typescript
recordCorrection(): void {
  this.lastCorrectionAt = Date.now();
}
```

**Status**: ❌ TODO - must implement before release

---

### Issue 22: embedding.ts Import Paths are Wrong ⚠️ CRITICAL

**Risk**: `embedding.ts` imports from `./bm25.js` and `./indexer.js` which don't exist in this module

**Current (Wrong) Imports**:
```typescript
import { bm25Search, preprocessForQuery } from './bm25.js';
import { buildIndex } from './indexer.js';
```

**Problem**: These should import from `session-history-rag`:
```typescript
import { bm25Search, preprocessForQuery } from '../../session-history/bm25.js';
import { buildIndex } from '../../session-history/indexer.js';
```

Or if keeping local BM25, need to implement full `bm25.ts` and `indexer.ts` in goal-constraint module.

**Status**: ❌ Need to fix import paths or implement local BM25

---

### Issue 23: semantic.ts Has No Implementation ⚠️ CRITICAL

**Risk**: `semantic.ts` only shows class interface, no actual implementation provided

**Current State** (line 498-513):
```typescript
export class SemanticAnalyzer {
  extractKeywords(text: string): string[]      // top 20, stopword filtered
  keywordMatchRate(text: string, keywords: string[]): number
  calculateDriftScore(messageTokens: string[], coreGoals: CoreGoal[]): { bm25, keyword, hybrid }
}
```

**Problem**: These methods are not implemented. The `embedding.ts` provides `extractGoalKeywords`, `buildGoalIndex`, `scoreGoalDrift`, but no `keywordMatchRate` function.

**Required Implementation**:
```typescript
// In semantic.ts or embedding.ts
export function keywordMatchRate(messageTokens: string[], goalKeywords: string[]): number {
  if (messageTokens.length === 0 || goalKeywords.length === 0) return 0;
  const matched = messageTokens.filter(t => goalKeywords.includes(t)).length;
  return matched / goalKeywords.length;
}
```

**Status**: ❌ Need to implement keywordMatchRate function

---

### Issue 24: DriftResult Field Naming Inconsistent ⚠️ MEDIUM

**Risk**: `DriftResult` uses `semanticSimilarity` but updated algorithm uses `bm25Score`

**Current types.ts**:
```typescript
export interface DriftResult {
  hasDrifted: boolean;
  semanticSimilarity: number;  // Old name
  keywordMatchRate: number;
  hybridScore: number;
  dominantGoal: CoreGoal | null;
  details: string;
}
```

**Algorithm Update** (line 978):
```
RETURN { has_drift, best_bm25, best_keyword, best_hybrid, dominant_goal }
```

**Decision**: Rename `semanticSimilarity` to `bm25Score` for consistency:
```typescript
export interface DriftResult {
  hasDrifted: boolean;
  bm25Score: number;        // Renamed from semanticSimilarity
  keywordMatchRate: number;
  hybridScore: number;
  dominantGoal: CoreGoal | null;
  details: string;
}
```

**Status**: ⚠️ Should update for consistency

---

## Revised Thresholds

**Original (Conflicts with contextCollapse at 75%)**:
```
25%, 50%, 73%
```

**New (Avoids existing layers)**:
```
25%, 40%, 55%
```

Rationale:
- Existing layers: micro_compact=70%, context_collapse=75%
- New: 25%, 40%, 55% are well below 70%, no conflict
- Fits the "early warning" purpose of goal constraint

---

## File Changes

### NEW: `server/services/goal-constraint/types.ts`

```typescript
export interface CoreGoal {
  id: string;
  text: string;           // goal text from LLM extraction
  keywords: string[];     // extracted keywords (BM25-based)
  priority: number;
  createdAt: number;
}

export interface KeyMetric {
  name: string;           // metric pattern matched
  value: string;          // captured value
  context: string;        // message snippet
}

export interface GoalSummary {
  id: string;
  sessionId: string;
  threshold: number;      // 25 | 40 | 55 (UPDATED)
  coreGoals: CoreGoal[];
  keyMetrics: KeyMetric[];
  userMessages: string[];
  assistantMessages: string[];
  createdAt: number;
}

export interface DriftResult {
  hasDrifted: boolean;
  semanticSimilarity: number;
  keywordMatchRate: number;
  hybridScore: number;
  dominantGoal: CoreGoal | null;
  details: string;
}

/**
 * Session state for tracking threshold hits and correction cooldowns
 */
export interface SessionState {
  thresholdsHit: Set<number>;
  lastCorrectionAt: number;
  correctionCooldownTurns: number;
  messageCount: number;
}

export const GOAL_CONSTRAINT_THRESHOLDS = {
  // UPDATED: Avoid conflict with contextCollapse (75%)
  CHECK_PERCENTAGES: [25, 40, 55] as const,
  DRIFT_SEMANTIC_THRESHOLD: 0.50,
  DRIFT_KEYWORD_THRESHOLD: 0.50,
  DRIFT_HYBRID_THRESHOLD: 0.50,
  SEMANTIC_WEIGHT: 0.4,
  KEYWORD_WEIGHT: 0.6,
  RECENT_MESSAGES_FOR_DRIFT: 20,
  MIN_MESSAGES_BEFORE_DRIFT_CHECK: 3,
  CORRECTION_COOLDOWN_TURNS: 3,
  CORRECTION_MESSAGE_ID: "goal_constraint_correction",
} as const;
```

### NEW: `server/services/goal-constraint/semantic.ts`

核心算法（基于BM25）：
1. **Keyword Extraction**: TF-IDF-like, 过滤stopwords, 取top20（主要信号）
2. **BM25 Scoring**: 使用 Memlight BM25 算法计算消息与目标的相似度
3. **Keyword Match Rate**: `matched / total`
4. **Hybrid Score**: `0.4 * bm25 + 0.6 * keyword` (keyword权重更高)

```typescript
import { extractGoalKeywords, buildGoalIndex, scoreGoalDrift } from "./embedding.js";

export class SemanticAnalyzer {
  extractKeywords(text: string): string[]      // top 20, stopword filtered
  keywordMatchRate(text: string, keywords: string[]): number
  calculateDriftScore(messageTokens: string[], coreGoals: CoreGoal[]): { bm25, keyword, hybrid }
}
```

### NEW: `server/services/goal-constraint/storage.ts`

SQLite表：
- `goal_summaries`: 每次threshold触发的summary
- `token_thresholds`: 记录已触发的threshold (避免重复触发)

```typescript
export class GoalStorage {
  constructor() {
    // Enable WAL mode for better concurrency
    this.db.run("PRAGMA journal_mode = WAL");
  }

  saveGoalSummary(summary: GoalSummary)
  getLatestGoalSummary(sessionId: string): GoalSummary | null
  getGoalSummaryForThreshold(sessionId, threshold): GoalSummary | null
  getAllGoalSummaries(sessionId: string): GoalSummary[]
  markThresholdHit(sessionId: string, threshold: number)
  getThresholdStatus(sessionId: string): { 25: boolean; 40: boolean; 55: boolean }
}
```

### NEW: `server/services/goal-constraint/engine.ts`

```typescript
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { extractGoalsWithLLM } from "./llm.js";
import type { GoalSummary, DriftResult } from "./types.js";

export class GoalConstraintEngine {
  private latestSummary: GoalSummary | null = null;

  constructor(
    private session: AgentSession,
    private sessionId: string,
    private ctx: ExtensionContext  // 添加ctx用于LLM调用
  ) {}

  // 1. Token threshold检测
  checkTokenThresholds(): number | null {
    const usage = this.ctx.getContextUsage();
    if (!usage?.tokens) return null;

    const thresholds = [25, 40, 55];
    for (const threshold of thresholds) {
      const percent = (usage.tokens / usage.contextWindow) * 100;
      if (percent >= threshold) {
        // TODO: 检查是否已触发过（需要持久化状态）
        return threshold;
      }
    }
    return null;
  }

  // 2. 生成goal summary (优先LLM，fallback到heuristics)
  async generateGoalSummary(threshold, messages): Promise<GoalSummary> {
    // 优先使用LLM提取
    const { goals, metrics } = await extractGoalsWithLLM(messages, this.ctx);

    this.latestSummary = {
      id: `gs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: this.sessionId,
      threshold,
      coreGoals: goals,
      keyMetrics: metrics,
      userMessages: this.extractUserMessages(messages),
      assistantMessages: this.extractAssistantMessages(messages),
      createdAt: Date.now()
    };

    return this.latestSummary;
  }

  // 3. 漂移检测 (带cooldown和warmup保护)
  detectDrift(messages, state: { correctionCooldownTurns: number; messageCount: number }): DriftResult {
    // Warmup检查
    if (state.messageCount < 3) {
      return { hasDrifted: false, semanticSimilarity: 1, keywordMatchRate: 1, hybridScore: 1, dominantGoal: null, details: "Warmup" };
    }

    // Cooldown检查
    if (state.correctionCooldownTurns > 0) {
      return { hasDrifted: false, semanticSimilarity: 1, keywordMatchRate: 1, hybridScore: 1, dominantGoal: null, details: "Cooldown" };
    }

    if (!this.latestSummary || this.latestSummary.coreGoals.length === 0) {
      return { hasDrifted: false, semanticSimilarity: 1, keywordMatchRate: 1, hybridScore: 1, dominantGoal: null, details: "No summary" };
    }

    // TODO: 实现实际的漂移检测逻辑
    // 需要使用 semantic.ts 中的 SemanticAnalyzer 计算 hybrid score
    return { hasDrifted: false, semanticSimilarity: 1, keywordMatchRate: 1, hybridScore: 1, dominantGoal: null, details: "Not implemented" };
  }

  // 4. 生成纠正消息
  generateCorrectionMessage(drift: DriftResult, summary: GoalSummary): string {
    const goals = summary.coreGoals.map(g => `- ${g.text}`).join("\n");
    const metrics = summary.keyMetrics.map(m => `- ${m.name}: ${m.value}`).join("\n");

    return `[GOAL CONSTRAINT] Conversation has drifted from core goals.

CORE GOALS:
${goals}

KEY METRICS:
${metrics}

Please re-orient toward these objectives.`;
  }

  // 5. 获取最近的summary
  getLatestSummary(): GoalSummary | null {
    return this.latestSummary;
  }

  // 6. 检查是否可以进行drift检测
  canCheckDrift(): boolean {
    return this.latestSummary !== null && this.latestSummary.coreGoals.length > 0;
  }

  private extractUserMessages(messages): string[] {
    return messages
      .filter(m => m.role === "user")
      .map(m => typeof m.content === "string" ? m.content : "")
      .filter(Boolean);
  }

  private extractAssistantMessages(messages): string[] {
    return messages
      .filter(m => m.role === "assistant")
      .map(m => typeof m.content === "string" ? m.content : "")
      .filter(Boolean);
  }
}
```

### NEW: `server/services/goal-constraint/llm.ts`

```typescript
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { CoreGoal, KeyMetric } from "./types.js";
import { extractGoalKeywords } from "./embedding.js";

const GOAL_EXTRACTION_PROMPT = `从以下对话中提取核心目标和关键指标。

请以JSON格式返回：
{
  "goals": ["目标1", "目标2", ...],
  "metrics": [{"name": "指标名", "value": "指标值"}, ...]
}

要求：
- goals: 识别用户真正想要完成的任务（最多5个）
- metrics: 识别可量化的指标（如文件数、错误数、代码行数等）
- 用中文回答
- 只返回JSON，不要其他内容`;

export async function extractGoalsWithLLM(
  messages: AgentMessage[],
  ctx: ExtensionContext
): Promise<{ goals: CoreGoal[]; metrics: KeyMetric[] }> {
  const model = ctx.model;
  if (!model) {
    console.warn('[GoalConstraint] No model available, using heuristics');
    return extractWithHeuristics(messages);
  }

  const apiKey = await ctx.modelRegistry.getApiKeyForProvider(model.provider);
  if (!apiKey) {
    console.warn('[GoalConstraint] No API key, using heuristics');
    return extractWithHeuristics(messages);
  }

  const userMsgs = messages
    .filter(m => m.role === "user")
    .map(m => typeof m.content === "string" ? m.content : "")
    .filter(Boolean)
    .join("\n---\n");

  try {
    const response = await fetch(`${model.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          { role: 'system', content: GOAL_EXTRACTION_PROMPT },
          { role: 'user', content: `对话内容：\n${userMsgs}` }
        ],
        max_tokens: 500,
        temperature: 0.3  // 低温度保证一致性
      })
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    return parseLLMResponse(content, messages);
  } catch (error) {
    console.warn('[GoalConstraint] LLM call failed, using heuristics:', error);
    return extractWithHeuristics(messages);
  }
}

async function parseLLMResponse(
  content: string,
  originalMessages: AgentMessage[]
): Promise<{ goals: CoreGoal[]; metrics: KeyMetric[] }> {
  try {
    // 尝试提取JSON（可能有markdown代码块）
    const jsonMatch = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/) || [null, content];
    const jsonStr = jsonMatch[1] || content;
    const parsed = JSON.parse(jsonStr);

    // 并行获取所有goal的keywords
    const goalPromises = (parsed.goals || []).slice(0, 5).map(async (text: string, i: number) => {
      const { keywords } = await extractGoalKeywords(text); // 使用BM25-based keyword extraction
      return {
        id: `goal_${Date.now()}_${i}`,
        text: text.substring(0, 200),
        keywords,
        priority: 1,
        createdAt: Date.now()
      };
    });

    const goals = await Promise.all(goalPromises);

    const metrics: KeyMetric[] = (parsed.metrics || []).slice(0, 10).map((m: any) => ({
      name: m.name || '',
      value: m.value || '',
      context: ''
    }));

    return { goals, metrics };
  } catch (error) {
    console.warn('[GoalConstraint] Failed to parse LLM response, using heuristics');
    return extractWithHeuristics(originalMessages);
  }
}

export async function extractWithHeuristics(messages: AgentMessage[]): Promise<{ goals: CoreGoal[]; metrics: KeyMetric[] }> {
  // Fallback: 简单的启发式提取
  const userMsgs = messages.filter(m => m.role === "user");
  const goals: CoreGoal[] = [];
  const seen = new Set<string>();

  for (const msg of userMsgs) {
    const text = typeof msg.content === "string" ? msg.content : "";
    const keywords = extractKeywordsFromText(text);
    const key = keywords.slice(0, 3).join(",");

    if (key && !seen.has(key) && goals.length < 5) {
      seen.add(key);
      goals.push({
        id: `goal_${Date.now()}_${goals.length}`,
        text: text.substring(0, 200),
        keywords,
        priority: 1,
        createdAt: Date.now()
      });
    }
  }

  return { goals, metrics: [] };
}

function extractKeywordsFromText(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
    '我', '你', '他', '她', '它', '们', '的', '了', '在', '是', '和', '与'
  ]);

  const tokens = text.toLowerCase().split(/[\s\p{P}]+/u);
  const freq = new Map<string, number>();

  for (const token of tokens) {
    if (token.length >= 2 && !stopWords.has(token)) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}
```

### NEW: `.pi/extensions/goal-constraint/index.ts`

Hook `context` event（每个LLM调用前触发）：

```typescript
import type { ExtensionAPI, ContextEventResult } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";
import { GoalConstraintEngine } from "../../../server/services/goal-constraint/engine.js";
import { GOAL_CONSTRAINT_THRESHOLDS, type SessionState } from "../../../server/services/goal-constraint/types.js";

const engines = new Map<string, GoalConstraintEngine>();
const sessionStates = new Map<string, SessionState>();

function getOrCreateEngine(sessionId: string, ctx: any): GoalConstraintEngine {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, new GoalConstraintEngine(ctx.session, sessionId, ctx));
  }
  return engines.get(sessionId)!;
}

function getSessionState(sessionId: string): SessionState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      thresholdsHit: new Set(),
      lastCorrectionAt: 0,
      correctionCooldownTurns: 0,
      messageCount: 0,
    });
  }
  return sessionStates.get(sessionId)!;
}

function cleanupEngine(sessionId: string) {
  engines.delete(sessionId);
  sessionStates.delete(sessionId);
}

function isCorrectionMessage(msg: any): boolean {
  if (!msg.content) return false;
  const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  return content.includes("[GOAL CONSTRAINT]");
}

export default function (api: ExtensionAPI) {
  api.on("context", async (event, ctx): Promise<ContextEventResult> => {
    const sessionId = ctx.sessionManager.currentSessionFile || "default";
    const engine = getOrCreateEngine(sessionId, ctx);

    // Skip correction messages in analysis
    const messages = event.messages.filter(m => !isCorrectionMessage(m));

    const state = getSessionState(sessionId);
    state.messageCount++;

    // 1. Token threshold检测 → 触发则生成summary (异步LLM调用)
    const threshold = engine.checkTokenThresholds();
    if (threshold !== null) {
      const summary = await engine.generateGoalSummary(threshold, messages);
      // persist + notify
      ctx.ui?.notify(
        `Goal Summary @ ${threshold}%: ${summary.coreGoals.length} goals extracted`,
        "info"
      );
    }

    // 2. Drift检测 (需要warmup + cooldown保护)
    if (engine.canCheckDrift()) {
      const drift = engine.detectDrift(messages);
      if (drift.hasDrifted) {
        const summary = engine.getLatestSummary();
        const correction = engine.generateCorrectionMessage(drift, summary);

        // 注入消息：prepend带标记以便后续过滤
        event.messages.unshift({
          role: "user",
          content: correction
        } as any);

        engine.recordCorrection();
        state.correctionCooldownTurns = GOAL_CONSTRAINT_THRESHOLDS.CORRECTION_COOLDOWN_TURNS;

        ctx.ui?.notify(
          `Drift detected (score: ${drift.hybridScore.toFixed(2)}), correction injected`,
          "warning"
        );
      }
    }

    // ⚠️ 关键：必须返回 { messages } 让框架使用修改后的消息
    // 返回 {} 会导致框架忽略 event.messages 的修改！
    return { messages: event.messages };
  });

  api.on("session_shutdown", (_, ctx) => {
    const sessionId = ctx.sessionManager.currentSessionFile;
    if (sessionId) {
      cleanupEngine(sessionId);
    }
  });
}
```

**关键发现**：
- `ContextEventResult` 接口定义返回 `{ messages?: AgentMessage[] }`
- 如果返回 `{}`，则 `messages` 是 `undefined`，框架可能不适用修改
- **必须返回 `{ messages: event.messages }`** 让修改生效
- 这与 contextCollapser 的行为一致（总是返回 `{ messages }`）

---

## Integration

### `server/session-service.ts`

在 `createRuntimeFactory` 的 `extensionFactories` 添加：

```typescript
// 注意：goal-constraint 应该在 contextCollapser 之前注册
// 因为 goal-constraint 在较低阈值触发
extensionFactories: [subagents as any, tasks as any, goalConstraintExtension as any],
```

---

## Drift Detection Algorithm (Updated - BM25-based)

```
FUNCTION DETECT_DRIFT(messages, summary):
  // Skip if in warmup period
  IF state.messageCount < MIN_MESSAGES_BEFORE_DRIFT_CHECK:
    RETURN NO_DRIFT

  // Skip if in cooldown period
  IF state.correctionCooldownTurns > 0:
    state.correctionCooldownTurns--
    RETURN NO_DRIFT

  recent_text = JOIN_LAST_N(messages, 20)

  IF recent_text IS_EMPTY OR summary.coreGoals IS_EMPTY:
    RETURN NO_DRIFT

  message_tokens = preprocessForQuery(recent_text)  // Memlight tokenization
  goal_index = buildGoalIndex(summary.coreGoals)     // Build BM25 index from goals

  // BM25 score is primary semantic signal
  bm25_scores = scoreGoalDrift(message_tokens, goal_index, avgGoalTokenCount)

  FOR EACH goal IN summary.coreGoals:
    // Keyword is primary signal
    keyword_rate = keyword_match_rate(message_tokens, goal.keywords)
    bm25_score = bm25_scores.get(goal.id) ?? 0
    hybrid = 0.4 * bm25_score + 0.6 * keyword_rate  // keyword weighted higher

    IF hybrid > best_hybrid:
      best_hybrid = hybrid
      best_keyword = keyword_rate
      best_bm25 = bm25_score
      dominant_goal = goal

  has_drift = (
    best_keyword < 0.50 OR
    best_hybrid < 0.50
  )

  RETURN { has_drift, best_bm25, best_keyword, best_hybrid, dominant_goal }
```

---

## Correction Message Format

```json
{
  "role": "user",
  "content": "[GOAL CONSTRAINT] Conversation has drifted from core goals.\n\nCORE GOALS:\n- goal1 text\n- goal2 text\n\nKEY METRICS:\n- metric1: value1\n- metric2: value2\n\nPlease re-orient toward these objectives.",
  "id": "goal_constraint_correction"
}
```

Key points:
- `id` field allows filtering out correction messages from future drift analysis
- Prevents cascading corrections

---

## State Machine

```
Session Start
    │
    ▼
[WARMUP] messageCount < 3
    │                  No drift check
    ▼
[ACTIVE] messageCount >= 3, no recent correction
    │
    ├─── has drift ───► Inject correction ───► [COOLDOWN] (3 turns)
    │                                        │
    │                                        ▼
    └─── no drift ───► Continue              Back to [ACTIVE]
```

---

## Relationship with Context Collapse

| Feature | Goal Constraint | Context Collapse |
|---------|---------------|------------------|
| Trigger | 25%, 40%, 55% | 75% |
| Action | Inject correction message | Compress context |
| Purpose | Keep agent on target | Reduce token usage |
| Conflict | None (different thresholds) | N/A |

---

## Verification

1. `bun run build` - must pass
2. `bunx tsc --noEmit` - zero errors
3. Runtime test scenarios:
   - [ ] Session with < 3 messages: no drift check triggered
   - [ ] Session at 25% token: goal summary generated
   - [ ] Drift detected: correction message injected with correct id
   - [ ] After correction: 3 turns cooldown before next check
   - [ ] Correction messages excluded from future drift analysis
   - [ ] Multi-session: no state leakage between sessions
   - [ ] Session shutdown: state cleaned up properly
   - [ ] At 40%, 55%: additional summaries generated correctly
   - [ ] No conflict with contextCollapse at 75%

---

## Open Questions

1. ~~Hook `context` event mutability~~ - ✅ Verified by contextCollapser usage
2. ~~Token usage API existence~~ - ✅ Verified `ctx.getContextUsage()` exists
3. ~~Extension execution order~~ - ✅ Verified - executes in extensionFactories array order
4. ~~Session shutdown event name~~ - ✅ Verified - type is "session_shutdown"
5. ~~Threshold calculation basis~~ - ✅ Verified - percent = tokens / contextWindow
6. ~~Message filtering approach~~ - ✅ Solution - use content-based filtering
7. ~~LLM调用能力~~ - ✅ Verified - 可通过ctx.model + ctx.modelRegistry.getApiKeyForProvider()实现
8. ~~Embedding方案~~ - ✅ UPDATED - 使用Memlight (BM25) 替代Ollama embedding
9. ~~Extension返回`{}` vs `{messages}`~~ - ✅ CRITICAL: 必须返回 `{ messages }` 否则修改不生效
10. ~~getSessionState未定义~~ - ✅ 已补充完整定义
11. ~~Engine接口不完整~~ - ✅ 已补充 getLatestSummary, canCheckDrift 等方法
12. ~~Ollama地址硬编码~~ - ✅ RESOLVED - 不再使用Ollama，改用Memlight
13. Threshold状态持久化 - ⚠️ 已添加Issue 19，使用storage检查替代
14. detectDrift未实现 - ❌ Issue 20，漂移检测返回hardcoded false
15. recordCorrection方法缺失 - ❌ Issue 21，Extension调用了不存在的方法
16. embedding.ts导入路径错误 - ❌ Issue 22，应从session-history-rag导入
17. semantic.ts无实现 - ❌ Issue 23，只有接口定义
18. DriftResult字段命名不一致 - ⚠️ Issue 24，semanticSimilarity应改为bm25Score

---

## Changelog

- 2026-06-28: Initial plan with premortem analysis
  - Added SessionState interface for cooldown tracking
  - Lowered drift thresholds (0.65→0.50) due to weak embedding
  - Increased keyword weight (0.4→0.6)
  - Added MIN_MESSAGES_BEFORE_DRIFT_CHECK warmup
  - Added CORRECTION_COOLDOWN_TURNS to prevent cascading
  - Added correction message filtering by id

- 2026-06-28: Second review
  - **CRITICAL**: Discovered threshold conflict with contextCollapse (73% vs 75%)
  - **UPDATED**: Changed thresholds from 25%, 50%, 73% to 25%, 40%, 55%
  - Added Relationship section explaining how goal-constraint and contextCollapse coexist
  - Verified context event mutation is supported (existing code uses it)
  - Verified ctx.getContextUsage() exists (used by contextCollapser)

- 2026-06-28: Third review
  - **VERIFIED**: Extension execution order follows extensionFactories array order
  - **VERIFIED**: SessionShutdownEvent exists with type "session_shutdown"
  - **NEW**: Issue 13 - Message filtering uses unsafe `any` cast, need content-based filtering
  - **NEW**: Issue 14 - SessionShutdown event confirmed to exist
  - **VERIFIED**: Issue 15 - Threshold calculation is tokens/contextWindow
  - **NEW**: Issue 17 - Goal extraction is too simplistic (200 chars), accepted limitation

- 2026-06-28: Fourth review - LLM Goal Extraction
  - **DISCOVERED**: contextCollapser.generateSummary() is a STUB (TODO, returns placeholder)
  - **DISCOVERED**: ExtensionContext has ctx.model + ctx.modelRegistry for LLM calls
  - **UPDATED**: Issue 17 - Now uses LLM for goal extraction with heuristics fallback
  - **NEW**: Added server/services/goal-constraint/llm.ts with full implementation
  - **NEW**: engine.ts now async - generateGoalSummary() awaits LLM response
  - **UPDATED**: Extension passes ctx to engine for LLM access

- 2026-06-28: Fifth review - Ollama Embedding
  - **DISCOVERED**: Ollama has `nomic-embed-text` model running (768-dim embeddings)
  - **UPDATED**: Use Ollama for semantic embeddings instead of token frequency
  - **NEW**: Added Issue 18 - Embedding implementation via Ollama API
  - **NEW**: `embedding.ts` module for Ollama embeddings
  - **REMOVED**: Token frequency embedding (too weak)

- 2026-06-28: Sixth review - Logic Verification
  - **CRITICAL**: Extension返回`{}`会导致消息修改不生效！必须返回`{ messages: event.messages }`
  - **FIXED**: `getSessionState()`函数已补充完整定义
  - **FIXED**: Engine接口已补充 `getLatestSummary()`, `canCheckDrift()` 等缺失方法
  - **NEW**: Issue 19 - Threshold状态持久化问题，使用storage检查解决
  - **UPDATED**: Ollama地址改为环境变量 `OLLAMA_BASE_URL`
  - **UPDATED**: `sessionStates` Map已添加到extension中
  - **VERIFIED**: `ContextEventResult`接口定义确认，返回`{ messages }`是正确的

- 2026-06-29: 第七次审查 - Memlight替换 + 事前验尸
  - **UPDATED**: Issue 18 - Ollama embedding替换为Memlight (BM25)
  - **UPDATED**: Drift Detection Algorithm改用BM25 scoring
  - **UPDATED**: Architecture描述更新，移除Ollama依赖
  - **UPDATED**: Context阈值更新为25%, 40%, 55%
  - **NEW**: 发现engine.ts中detectDrift尚未实现完整逻辑
  - **NEW**: 发现engine.ts调用recordCorrection方法但未定义

- 2026-06-29: 第八次审查 - 继续验尸
  - **FIXED**: Issue 13状态更新为RESOLVED（通过Issue 16解决）
  - **UPDATED**: Issue 12描述修正（50%→40%）
  - **UPDATED**: Issue 17 LLM prompt描述简化，与实际llm.ts代码一致
  - **NEW**: Issue 22 - embedding.ts导入路径错误
  - **NEW**: Issue 23 - semantic.ts只有接口无实现
  - **NEW**: Issue 24 - DriftResult字段semanticSimilarity应改为bm25Score
