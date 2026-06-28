# Goal Constraint System - Implementation Plan

## Context

用户在25%、50%、73% token阈值时，希望系统自动：
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
├── llm.ts               # Goal extraction via Ollama chat
├── embedding.ts          # Semantic embeddings via Ollama nomic-embed-text
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
**Mitigation**: Use keyword presence/absence as primary signal; keep embedding as secondary; tune threshold lower (0.5)
**Status**: ⚠️ Acknowledged - embedding is辅助信号

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
**Risk**: If goal-constraint at 50% and contextCollapse at 75% both modify context, state may diverge
**Mitigation**: Both read from same `ctx.getContextUsage()` and append to same session
**Status**: ✅ Should be OK - they operate at different thresholds

### Issue 13: Message Filtering Uses Unsafe Any Cast
**Risk**: Using `(m as any).id` to filter correction messages is type-unsafe
**Problem**: Standard `Message` type (UserMessage | AssistantMessage | ToolResultMessage) has no `id` field
**Mitigation**: 
- Use content-based filtering: check if `content.includes("[GOAL CONSTRAINT]")`
- Or extend the Message type via declaration merging
**Status**: ⚠️ Need to decide filtering approach

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
export async function extractGoalsWithLLM(
  messages: AgentMessage[],
  ctx: ExtensionContext
): Promise<{ goals: CoreGoal[]; metrics: KeyMetric[] }> {
  const model = ctx.model;
  if (!model) return extractWithHeuristics(messages);

  const apiKey = await ctx.modelRegistry.getApiKeyForProvider(model.provider);
  if (!apiKey) return extractWithHeuristics(messages);

  const prompt = buildGoalExtractionPrompt(messages);

  try {
    const response = await fetch(`${model.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      })
    });

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    return parseLLMResponse(content);
  } catch (error) {
    console.warn('[GoalConstraint] LLM call failed, falling back to heuristics');
    return extractWithHeuristics(messages);
  }
}

function buildGoalExtractionPrompt(messages: AgentMessage[]): string {
  const userMsgs = messages.filter(m => m.role === 'user')
    .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
    .join('\n---\n');

  return `从以下用户消息中提取核心目标和关键指标。

用户消息：
${userMsgs}

请以JSON格式返回：
{
  "goals": ["目标1", "目标2", ...],
  "metrics": [{"name": "指标名", "value": "指标值"}, ...]
}

要求：
- goals: 识别用户真正想要完成的任务（最多5个）
- metrics: 识别可量化的指标（如文件数、错误数、完成度等）
- 用中文回答`;
}
```

**Trade-off**: LLM调用有延迟和成本，但提高了goal提取质量。fallback到heuristics保证最终可用性。

---

### Issue 18: Embedding Implementation - Ollama ⚠️ NEW

**Decision**: Use Ollama `nomic-embed-text` for semantic embeddings

**Why Ollama**:
- Local, no API cost
- `nomic-embed-text` is high quality (137M params, F16)
- Same 768-dim space for both goal embedding and drift comparison

**Ollama Discovery**:
```
Model: nomic-embed-text:latest
Embedding length: 768
Endpoint: POST http://localhost:11434/api/embeddings
```

**Implementation**:
```typescript
// server/services/goal-constraint/embedding.ts
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const EMBEDDING_MODEL = "nomic-embed-text";

export async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: text
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding; // 768-dim vector
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**Note**: Ollama URL now configurable via `OLLAMA_BASE_URL` environment variable.

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
  keywords: string[];     // extracted keywords
  embedding: number[];     // 768-dim Ollama nomic-embed-text vector
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

核心算法：
1. **Embedding**: Ollama nomic-embed-text → 768维向量
2. **Keyword Extraction**: TF-IDF-like, 过滤stopwords, 取top20（主要信号）
3. **Keyword Match Rate**: `matched / total`
4. **Hybrid Score**: `0.4 * semantic + 0.6 * keyword` (keyword权重更高)

```typescript
// Now delegates to embedding.ts for Ollama embeddings
import { getEmbedding, cosineSimilarity } from "./embedding.js";

export class SemanticAnalyzer {
  extractKeywords(text: string): string[]      // top 20, stopword filtered
  keywordMatchRate(text: string, keywords: string[]): number
  calculateHybridSimilarity(text, coreGoal): { semantic, keyword, hybrid }
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
import { getEmbedding } from "./embedding.js";

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

    // 并行获取所有goal的embedding
    const goalPromises = (parsed.goals || []).slice(0, 5).map(async (text: string, i: number) => {
      const embedding = await getEmbedding(text); // 使用Ollama获取embedding
      return {
        id: `goal_${Date.now()}_${i}`,
        text: text.substring(0, 200),
        keywords: extractKeywordsFromText(text),
        embedding,
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
      // Fallback: 使用zero vector作为embedding
      const embedding = new Array(768).fill(0);
      goals.push({
        id: `goal_${Date.now()}_${goals.length}`,
        text: text.substring(0, 200),
        keywords,
        embedding,
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

## Drift Detection Algorithm (Updated)

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

  FOR EACH goal IN summary.coreGoals:
    // Keyword is primary signal (semantic embedding is weak)
    keyword_rate = keyword_match_rate(recent_text, goal.keywords)
    semantic = cosine_similarity(embed(recent_text), goal.embedding)
    hybrid = 0.4 * semantic + 0.6 * keyword_rate  // keyword weighted higher

    IF hybrid > best_hybrid:
      best_hybrid = hybrid
      best_keyword = keyword_rate
      best_semantic = semantic
      dominant_goal = goal

  has_drift = (
    best_keyword < 0.50 OR
    best_hybrid < 0.50
  )

  RETURN { has_drift, best_semantic, best_keyword, best_hybrid, dominant_goal }
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
8. ~~Embedding方案~~ - ✅ Verified - 使用Ollama nomic-embed-text (768-dim)
9. ~~Extension返回`{}` vs `{messages}`~~ - ✅ CRITICAL: 必须返回 `{ messages }` 否则修改不生效
10. ~~getSessionState未定义~~ - ✅ 已补充完整定义
11. ~~Engine接口不完整~~ - ✅ 已补充 getLatestSummary, canCheckDrift 等方法
12. Ollama地址硬编码 - ✅ 已改为环境变量
13. Threshold状态持久化 - ⚠️ 已添加Issue 19，使用storage检查替代

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
