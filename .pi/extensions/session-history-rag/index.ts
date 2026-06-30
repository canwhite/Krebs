/**
 * Session History RAG - Extension Entry
 *
 * Hooks into before_agent_start to inject relevant session history context.
 */

import type { ExtensionAPI, BeforeAgentStartEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SessionIndexEntry } from '../../../server/services/session-history/types.js';
import { bm25Search, preprocessForQuery } from '../../../server/services/session-history/bm25.js';
import { extractAssistantContent } from '../../../server/services/session-history/storage.js';
import { getOrBuildIndex } from '../../../server/services/session-history/indexer.js';

// ================ Constants ================
const TOP_K = 5;           // BM25 初筛数量
const TOP_K_FINAL = 2;     // 最终返回数量
const MAX_CHARS_PER_SESSION = 1000; // 每个 session 提取的最大字符数

// ================ retrievedSessions with TTL cleanup ================
const retrievedSessions = new Map<string, number>(); // sessionId → retrievedAt

function markRetrieved(sessionId: string): boolean {
  const now = Date.now();
  if (retrievedSessions.has(sessionId)) {
    return false; // 已检索过
  }
  retrievedSessions.set(sessionId, now);

  // 每 100 次调用清理一次过期 entry（> 10 分钟前的）
  if (retrievedSessions.size % 100 === 0) {
    const cutoff = now - 10 * 60 * 1000;
    for (const [sid, ts] of retrievedSessions) {
      if (ts < cutoff) retrievedSessions.delete(sid);
    }
  }
  return true;
}

// ================ Helper Functions ================

/** 根据 BM25 score 相似度去重，score 差值 < 0.1 视为重复 */
function deduplicateByScore<T extends { score?: number }>(
  results: T[],
  threshold: number = 0.1
): T[] {
  if (results.length <= 1) return results;
  const sorted = [...results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const kept: T[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const prevScore = kept[kept.length - 1]!.score ?? 0;
    const currScore = sorted[i]!.score ?? 0;
    if (prevScore - currScore >= threshold) {
      kept.push(sorted[i]!);
    }
  }
  return kept;
}

/** 计算允许的最大 RAG 长度：预留 30% headroom */
function calculateMaxRAGLength(
  usage: { percent?: number; tokens?: number },
  _ctx: ExtensionContext
): number {
  const percent = usage.percent ?? 0;
  const maxAllowedPercent = 0.7;
  if (percent > maxAllowedPercent) {
    return 0; // 太接近上限，不注入
  }
  const available = (maxAllowedPercent - percent) * 2000;
  return Math.min(Math.max(available, 0), 2000);
}

/** 从后往前截断，确保不超出 maxLength */
function truncateRAGContent<T extends { content: string; firstQuestion: string }>(
  results: T[],
  maxLength: number
): T[] {
  let remaining = maxLength;
  const truncated: T[] = [];

  for (const r of results) {
    const needed = r.firstQuestion.length + r.content.length + 100;
    if (remaining - needed < 0) {
      const availableForContent = Math.max(0, remaining - r.firstQuestion.length - 100);
      truncated.push({
        ...r,
        content: r.content.slice(0, availableForContent) + (availableForContent > 0 ? '...' : ''),
      } as T);
      remaining = 0;
      break;
    } else {
      truncated.push(r);
      remaining -= needed;
    }
  }
  return truncated;
}

/** 相对时间格式化 */
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  if (mins > 0) return `${mins} 分钟前`;
  return '刚刚';
}

/** 格式化注入的 context */
function formatSessionContext(
  results: { sessionId: string; firstQuestion: string; createdAt: number; content: string }[]
): string {
  if (results.length === 0) return '';

  const lines = ['【相关历史会话】\n参考以下过去会话中的相关内容：\n'];

  for (const r of results) {
    const relativeTime = formatRelativeTime(r.createdAt);
    lines.push(
      `## 会话: ${r.sessionId} | ${relativeTime}`,
      `**问题**: ${r.firstQuestion}`,
      ``,
      `### 助手回答`,
      `${r.content}`,
      `---`,
      ``,
    );
  }

  return lines.join('\n');
}

/** Timeout wrapper */
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// ================ Extension Entry ================
export default function (api: ExtensionAPI) {
  api.on('before_agent_start', async (event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
    // === P0: All errors caught, never throw ===
    try {
      const currentSid = ctx.sessionManager.getSessionId();

      // === P0: 每 session 只检索一次 ===
      if (!markRetrieved(currentSid)) {
        return {};
      }

      // === P0: Check context length, don't overflow ===
      const usage = (ctx.getContextUsage?.() ?? {}) as { percent?: number; tokens?: number };
      if ((usage.percent ?? 0) > 0.8) {
        return {};
      }

      // === P1: Check user intent: skip if "重新"/"clear" ===
      if (/重新|不管之前|clear\s*context/i.test(event.prompt)) {
        return {};
      }

      // === Build/get index ===
      const index = await withTimeout(getOrBuildIndex(), 3000, null);
      if (!index) return {};

      // === Search ===
      const queryTokens = preprocessForQuery(event.prompt);
      const candidates = bm25Search(index, queryTokens, currentSid, TOP_K);

      if (candidates.length === 0) return {};

      // === Extract content from top candidates (top-2) ===
      const results: (SessionIndexEntry & { content: string })[] = [];
      for (const candidate of candidates.slice(0, TOP_K_FINAL)) {
        try {
          const content = await extractAssistantContent(candidate.filePath, MAX_CHARS_PER_SESSION);
          results.push({ ...candidate, content });
        } catch {
          // Skip failed extractions
        }
      }

      if (results.length === 0) return {};

      // === P1: De-duplicate similar sessions ===
      const deduped = deduplicateByScore(results);

      // === P1: Calculate total length, truncate if needed ===
      const maxLength = calculateMaxRAGLength(usage, ctx);
      if (maxLength <= 0) return {};

      const truncated = truncateRAGContent(deduped as { content: string; firstQuestion: string }[], maxLength);

      // === Format context ===
      const context = formatSessionContext(truncated as any);

      // === P1: DEBUG logging ===
      console.log(`[SessionRAG] Retrieved ${results.length} sessions, context ${context.length} chars`);

      // === Return systemPrompt modification ===
      return { systemPrompt: context };

    } catch (err) {
      // === P0: All errors caught, return empty ===
      console.error('[SessionRAG] Error:', err);
      return {};
    }
  });
}
