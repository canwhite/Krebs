/**
 * Session History RAG - Types
 */

export interface SessionMeta {
  id: string;
  session_id: string;
  first_question: string;
  file_path: string;
  created_at: number;
}

export interface SessionIndexEntry {
  sessionId: string;
  filePath: string;
  firstQuestion: string;
  firstQuestionTokens: string[];
  tokenCount: number;
  createdAt: number;
  score?: number; // BM25 score，附加用于去重
}

export interface SearchIndex {
  version: number;
  builtAt: number;
  sessionCount: number;
  avgTokenCount: number;
  entries: Map<string, SessionIndexEntry>;
}

export interface RAGResult {
  sessionId: string;
  firstQuestion: string;
  createdAt: number;
  content: string;
}
