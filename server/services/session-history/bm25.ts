/**
 * Session History RAG - BM25 + Tokenizer
 */

import type { SearchIndex, SessionIndexEntry } from './types.js';

export const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去',
  '你', '会', '着', '没有', '看', '好', '自己', '这', '怎么',
  '什么', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
]);

export const K1 = 1.5;
export const B = 0.75;

// ================ Tokenizer ================

/** 检测是否包含中文字符 */
export function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/** 尝试使用 nodejieba，中文分词，失败返回 undefined */
export async function tryJieba(text: string): Promise<string[] | undefined> {
  try {
    const jieba = (await import('nodejieba')).default;
    return jieba.cut(text, true).filter((t: string) => t.trim().length > 0);
  } catch {
    return undefined;
  }
}

/** 字符级 n-gram 分词（jieba 不可用时的 fallback） */
export function charNgram(text: string, min: number = 2, max: number = 4): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < text.length; i++) {
    for (let len = min; len <= max && i + len <= text.length; len++) {
      tokens.push(text.slice(i, i + len));
    }
  }
  return [...new Set(tokens)];
}

/** 主分词函数（async，用于 index 构建） */
export async function tokenizeForIndex(text: string): Promise<string[]> {
  if (hasChinese(text)) {
    const jiebaResult = await tryJieba(text);
    return (jiebaResult ?? charNgram(text, 2, 4))
      .filter(t => !STOP_WORDS.has(t) && t.length > 1);
  }
  return text.split(/\s+/).filter(t => !STOP_WORDS.has(t) && t.length > 1);
}

/** Fast sync tokenize for query-time (uses char n-gram fallback) */
export function tokenizeForQuery(text: string): string[] {
  if (hasChinese(text)) {
    return charNgram(text, 2, 4)
      .filter(t => !STOP_WORDS.has(t) && t.length > 1);
  }
  return text.split(/\s+/).filter(t => !STOP_WORDS.has(t) && t.length > 1);
}

// ================ Preprocessing ================

/** Sync preprocessing: NFC → filter → case fold (no tokenization) */
export function preprocessSync(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase();
}

/** Full pipeline for index building (async tokenization) */
export async function preprocessForIndex(text: string): Promise<string[]> {
  const normalized = preprocessSync(text);
  return tokenizeForIndex(normalized);
}

/** Full pipeline for query (sync tokenization) */
export function preprocessForQuery(text: string): string[] {
  const normalized = preprocessSync(text);
  return tokenizeForQuery(normalized);
}

// ================ BM25 Retrieval ================

export function bm25Search(
  index: SearchIndex,
  queryTokens: string[],
  excludeSessionId: string,
  topK: number = 5
): SessionIndexEntry[] {
  // Short query fallback: < 2 meaningful tokens
  if (queryTokens.length < 2) {
    return [...index.entries.values()]
      .filter(e => e.sessionId !== excludeSessionId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 2);
  }

  const N = index.sessionCount;
  if (N === 0) return [];

  // Compute document frequency for each query term
  const df = new Map<string, number>();
  for (const qt of queryTokens) {
    let count = 0;
    for (const entry of index.entries.values()) {
      if (entry.firstQuestionTokens.includes(qt)) count++;
    }
    df.set(qt, count);
  }

  const scores = new Map<string, number>();

  for (const [sessionId, entry] of index.entries) {
    if (sessionId === excludeSessionId) continue;

    let score = 0;

    for (const qt of queryTokens) {
      const tf = entry.firstQuestionTokens.filter(t => t === qt).length;
      if (tf === 0) continue;

      // IDF: log((N - df + 0.5) / (df + 0.5))
      const d = df.get(qt) ?? 0;
      const idf = Math.log((N - d + 0.5) / (d + 0.5) + 1);

      // TF normalization by document length
      const docLen = entry.tokenCount;
      const avgDocLen = index.avgTokenCount || 1;
      const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * docLen / avgDocLen));

      score += idf * tfNorm;
    }

    // Tiebreaker: createdAt descending (small weight to avoid instability)
    scores.set(sessionId, score + entry.createdAt / 1e15);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([sid, score]) => {
      const entry = index.entries.get(sid)!;
      entry.score = score;
      return entry;
    });
}
