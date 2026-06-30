/**
 * Session History RAG - Index Builder & Cache
 */

import { getAllSessions } from '../../../db/index.js';
import type { SearchIndex, SessionIndexEntry, SessionMeta } from './types.js';
import { preprocessForIndex } from './bm25.js';

const INDEX_VERSION = 1;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ================ Cache ================
let indexCache: SearchIndex | null = null;
let indexBuildPromise: Promise<SearchIndex | null> | null = null;

/**
 * Check if index cache is valid
 */
function isCacheValid(index: SearchIndex | null): boolean {
  if (!index) return false;
  if (index.version !== INDEX_VERSION) return false;

  const metas = getAllSessions();
  if (index.sessionCount !== metas.length) return false;

  if (Date.now() - index.builtAt > CACHE_TTL_MS) return false;

  return true;
}

/**
 * Build the search index from session metadata
 */
async function buildIndex(): Promise<SearchIndex> {
  const metas = getAllSessions();
  const entries = new Map<string, SessionIndexEntry>();

  let totalTokens = 0;

  for (const meta of metas) {
    try {
      // Skip non-.jsonl files
      if (!meta.file_path.endsWith('.jsonl')) continue;

      // first_question: truncate to 500 chars max
      const truncatedQuestion = meta.first_question.slice(0, 500);
      const tokens = await preprocessForIndex(truncatedQuestion);

      entries.set(meta.session_id, {
        sessionId: meta.session_id,
        filePath: meta.file_path,
        firstQuestion: truncatedQuestion,
        firstQuestionTokens: tokens,
        tokenCount: tokens.length,
        createdAt: meta.created_at,
      });

      totalTokens += tokens.length;
    } catch {
      // Skip failed entries silently
    }
  }

  const sessionCount = entries.size;
  const avgTokenCount = sessionCount > 0 ? totalTokens / sessionCount : 0;

  return {
    version: INDEX_VERSION,
    builtAt: Date.now(),
    sessionCount,
    avgTokenCount,
    entries,
  };
}

/**
 * Get or build index (with concurrency guard)
 */
export async function getOrBuildIndex(): Promise<SearchIndex | null> {
  // Fast path: no sessions
  const metas = getAllSessions();
  if (metas.length === 0) {
    return null;
  }

  // Check cache validity
  if (isCacheValid(indexCache)) {
    return indexCache;
  }

  // Concurrent protection: reuse in-flight build promise
  if (indexBuildPromise) {
    return indexBuildPromise;
  }

  indexBuildPromise = buildIndex().then(index => {
    indexCache = index;
    indexBuildPromise = null;
    return index;
  });

  return indexBuildPromise;
}

/**
 * Force rebuild index (for manual refresh)
 */
export async function rebuildIndex(): Promise<SearchIndex | null> {
  indexCache = null;
  indexBuildPromise = null;
  return getOrBuildIndex();
}
