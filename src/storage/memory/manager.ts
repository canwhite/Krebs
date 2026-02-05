/**
 * Memory Index Manager
 *
 * 核心功能：
 * - 文件索引（分块 + embedding）
 * - 向量搜索
 * - 实时监听（chokidar）
 *
 * 参考：openclaw-cn-ds/src/memory/manager.ts
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import chokidar from "chokidar";
import { load as loadSqliteVec } from "sqlite-vec";

import type {
  IEmbeddingProvider,
  MemoryFileEntry,
  MemorySearchResult,
  ChunkConfig,
  IndexProgressCallback,
  MemoryStorageConfig,
} from "./types.js";
import {
  chunkMarkdown,
  listMemoryFiles,
  buildFileEntry,
} from "./internal.js";
import { ensureMemoryIndexSchema } from "./schema.js";

const FTS_TABLE = "chunks_fts";
const EMBEDDING_CACHE_TABLE = "embedding_cache";

/**
 * Memory Index Manager
 */
export class MemoryIndexManager {
  private readonly dbPath: string;
  private readonly workspaceDir: string;
  private readonly embeddingProvider: IEmbeddingProvider;
  private readonly chunkConfig: ChunkConfig;
  private db: Database.Database;
  private watcher: ReturnType<typeof chokidar.watch> | null = null;
  private watchDebounceTimer: NodeJS.Timeout | null = null;
  private closed = false;

  /**
   * 配置选项
   */
  private readonly options: MemoryStorageConfig = {};

  /**
   * 内部状态
   */
  private dirty = false; // 文件是否变化，需要同步
  private sessionsDirty = false; // 会话是否变化
  private syncInProgress = false; // 同步是否正在进行
  private sessionWarm = new Set<string>(); // 已预热的会话
  private intervalSyncTimer?: NodeJS.Timeout; // 定期同步定时器

  constructor(params: {
    dbPath: string;
    workspaceDir: string;
    embeddingProvider: IEmbeddingProvider;
    chunkConfig?: ChunkConfig;
    config?: MemoryStorageConfig;
  }) {
    this.dbPath = params.dbPath;
    this.workspaceDir = params.workspaceDir;
    this.embeddingProvider = params.embeddingProvider;
    this.chunkConfig = params.chunkConfig || {
      tokens: 500,
      overlap: 50,
    };
    this.options = params.config || {};

    // 初始化数据库
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    // 加载 sqlite-vec 扩展
    loadSqliteVec(this.db);

    // 确保数据库架构
    const schemaResult = ensureMemoryIndexSchema({
      db: this.db,
      embeddingCacheTable: EMBEDDING_CACHE_TABLE,
      ftsTable: FTS_TABLE,
      ftsEnabled: true, // FTS 默认启用
    });

    if (!schemaResult.ftsAvailable) {
      console.warn(`FTS not available: ${schemaResult.ftsError}`);
    }
  }

  /**
   * 启动管理器
   */
  async start(): Promise<void> {
    if (this.closed) {
      throw new Error("Manager has been closed");
    }

    // 初始同步
    await this.sync({ reason: "startup" });

    // 启动文件监听
    const watchEnabled = this.options.sync?.watch ?? true;
    if (watchEnabled) {
      this.enableWatch();
    }

    // 启动定期同步
    const intervalMinutes = this.options.sync?.intervalMinutes;
    if (intervalMinutes && intervalMinutes > 0) {
      this.startIntervalSync(intervalMinutes);
    }
  }

  /**
   * 停止管理器
   */
  async stop(): Promise<void> {
    this.closed = true;

    // 停止监听
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // 清除定时器
    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
      this.watchDebounceTimer = null;
    }

    // 清除定期同步定时器
    if (this.intervalSyncTimer) {
      clearInterval(this.intervalSyncTimer);
      this.intervalSyncTimer = undefined;
    }

    // 关闭数据库
    this.db.close();
  }

  /**
   * 启用文件监听
   */
  private enableWatch(): void {
    if (this.watcher) return;

    const memoryDir = path.join(this.workspaceDir, "memory");
    const memoryFile = path.join(this.workspaceDir, "MEMORY.md");
    const altMemoryFile = path.join(this.workspaceDir, "memory.md");

    const pathsToWatch = [memoryDir, memoryFile, altMemoryFile];

    const watchDebounceMs = this.options.sync?.watchDebounceMs ?? 5000;

    this.watcher = chokidar.watch(pathsToWatch, {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100, // 文件稳定 100ms 后触发
        pollInterval: 50, // 每 50ms 轮询一次
      },
    });

    const markDirty = () => {
      this.dirty = true;
      this.scheduleSync();
    };

    this.watcher
      .on("add", markDirty)
      .on("change", markDirty)
      .on("unlink", markDirty);
  }

  /**
   * 禁用文件监听
   */
  async disableWatch(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
      this.watchDebounceTimer = null;
    }
  }

  /**
   * 调度同步（带去抖）
   */
  private scheduleSync(): void {
    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
    }

    const watchDebounceMs = this.options.sync?.watchDebounceMs ?? 5000;

    this.watchDebounceTimer = setTimeout(() => {
      this.sync({ reason: "watch" }).catch((err) => {
        console.error("Sync failed (watch):", err);
      });
    }, watchDebounceMs);
  }

  /**
   * 启动定期同步
   */
  private startIntervalSync(intervalMinutes: number): void {
    const intervalMs = intervalMinutes * 60 * 1000;

    this.intervalSyncTimer = setInterval(() => {
      this.sync({ reason: "interval" }).catch((err) => {
        console.error("Sync failed (interval):", err);
      });
    }, intervalMs);
  }

  /**
   * 会话启动预热
   *
   * @param sessionKey - 会话 key
   */
  async warmSession(sessionKey?: string): Promise<void> {
    const onSessionStart = this.options.sync?.onSessionStart ?? true;
    if (!onSessionStart) return;

    const key = sessionKey?.trim() || "";
    if (key && this.sessionWarm.has(key)) return;

    await this.sync({ reason: "session-start" }).catch((err) => {
      console.error("Sync failed (session-start):", err);
    });

    if (key) this.sessionWarm.add(key);
  }

  /**
   * 同步文件（增量更新）
   */
  async sync(
    progressOrReason?: IndexProgressCallback | { reason?: string },
  ): Promise<void> {
    // 避免并发同步
    if (this.syncInProgress) {
      console.debug("Sync already in progress, skipping");
      return;
    }

    this.syncInProgress = true;

    try {
      const progress =
        typeof progressOrReason === "function"
          ? progressOrReason
          : undefined;

      const reason =
        typeof progressOrReason === "object" ? progressOrReason.reason : undefined;

      if (reason) {
        console.debug(`Memory sync triggered by: ${reason}`);
      }

      const files = await listMemoryFiles(this.workspaceDir);
      const fileEntries = await Promise.all(
        files.map(async (file) => buildFileEntry(file, this.workspaceDir)),
      );

    console.debug(`Memory sync: ${fileEntries.length} files`);

    if (progress) {
      progress({
        completed: 0,
        total: fileEntries.length,
        label: "Indexing memory files...",
      });
    }

    const activePaths = new Set(fileEntries.map((e) => e.path));

    // 索引文件
    for (let i = 0; i < fileEntries.length; i++) {
      const entry = fileEntries[i];

      // 检查是否需要更新
      const record = this.db
        .prepare(`SELECT hash FROM files WHERE path = ? AND source = ?`)
        .get(entry.path, "memory") as { hash: string } | undefined;

      if (record?.hash === entry.hash) {
        // 未变更，跳过
        if (progress) {
          progress({
            completed: i + 1,
            total: fileEntries.length,
          });
        }
        continue;
      }

      // 需要更新
      await this.indexFile(entry);

      if (progress) {
        progress({
          completed: i + 1,
          total: fileEntries.length,
        });
      }
    }

    // 删除已移除文件的索引
    const staleRows = this.db
      .prepare(`SELECT path FROM files WHERE source = ?`)
      .all("memory") as Array<{ path: string }>;

    for (const stale of staleRows) {
      if (activePaths.has(stale.path)) continue;

      // 删除 chunks
      this.db.prepare(`DELETE FROM chunks WHERE path = ? AND source = ?`).run(stale.path, "memory");

      // 删除 files 记录
      this.db.prepare(`DELETE FROM files WHERE path = ? AND source = ?`).run(stale.path, "memory");
    }

    // 清除 dirty 标志
    this.dirty = false;
  } finally {
    this.syncInProgress = false;
  }
  }

  /**
   * 索引单个文件
   */
  async indexFile(entry: MemoryFileEntry): Promise<void> {
    const content = await fs.readFile(entry.absPath, "utf-8");
    const chunks = chunkMarkdown(content, this.chunkConfig);

    // 删除旧的 chunks 和向量索引
    this.db.prepare(`DELETE FROM chunks WHERE path = ? AND source = ?`).run(entry.path, "memory");

    // 插入文件记录
    this.db.prepare(`
      INSERT OR REPLACE INTO files (path, source, hash, mtime, size)
      VALUES (?, ?, ?, ?, ?)
    `).run(entry.path, "memory", entry.hash, entry.mtimeMs, entry.size);

    // 生成 embeddings 并插入 chunks
    for (const chunk of chunks) {
      const embeddingResult = await this.embeddingProvider.embed(chunk.text);

      const chunkId = randomUUID();
      const embeddingJson = JSON.stringify(embeddingResult.embedding);

      // 插入到 chunks 表
      this.db.prepare(`
        INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        chunkId,
        entry.path,
        "memory",
        chunk.startLine,
        chunk.endLine,
        chunk.hash,
        embeddingResult.model,
        chunk.text,
        embeddingJson,
        Date.now(),
      );

      // 插入到向量索引表（用于 sqlite-vec 搜索）
      try {
        this.db.prepare(`
          INSERT OR REPLACE INTO chunks_vec (chunk_id, embedding)
          VALUES (?, ?)
        `).run(chunkId, embeddingJson);
      } catch (err) {
        // 如果向量表插入失败（如维度不匹配），记录错误但继续
        console.warn(`Failed to insert vector for chunk ${chunkId}:`, err);
      }
    }
  }

  /**
   * 搜索记忆
   *
   * @param query - 查询文本
   * @param opts - 搜索选项
   * @returns 搜索结果
   */
  async search(
    query: string,
    opts?: {
      maxResults?: number;
      minScore?: number;
      sessionKey?: string;
    },
  ): Promise<MemorySearchResult[]> {
    // 预热会话（如果配置了 onSessionStart）
    await this.warmSession(opts?.sessionKey);

    // 自动同步（如果配置了 onSearch）
    const onSearch = this.options.sync?.onSearch ?? true;
    if (onSearch && (this.dirty || this.sessionsDirty)) {
      await this.sync({ reason: "search" }).catch((err) => {
        console.error("Sync failed (search):", err);
      });
    }

    // 获取配置
    const maxResults = this.options.query?.maxResults ?? opts?.maxResults ?? 5;
    const minScore = this.options.query?.minScore ?? opts?.minScore ?? 0.0;
    const hybrid = this.options.query?.hybrid;

    // 清理查询
    const cleaned = query.trim();
    if (!cleaned) return [];

    // 混合搜索
    const vectorResults = await this.searchVector(cleaned, maxResults);
    const textResults =
      hybrid?.enabled && this.hasFullTextSearch()
        ? await this.searchKeyword(cleaned, maxResults)
        : [];

    // 合并结果
    const merged =
      hybrid?.enabled && textResults.length > 0
        ? this.mergeHybridResults({
            vector: vectorResults,
            keyword: textResults,
            vectorWeight: hybrid.vectorWeight ?? 0.7,
            textWeight: hybrid.textWeight ?? 0.3,
          })
        : vectorResults;

    // 过滤低分结果
    return merged.filter((r) => r.score >= minScore);
  }

  /**
   * 向量搜索
   */
  private async searchVector(
    query: string,
    maxResults: number,
  ): Promise<MemorySearchResult[]> {
    // 检查向量表是否存在
    const vecTableExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_vec'"
    ).get() as { name: string } | undefined;

    if (!vecTableExists) {
      console.warn("Vector table not available");
      return [];
    }

    // 生成查询的 embedding
    const queryEmbedding = await this.embeddingProvider.embed(query);
    const queryVector = JSON.stringify(queryEmbedding.embedding);

    // 使用 sqlite-vec 进行相似度搜索
    try {
      const results = this.db.prepare(`
        SELECT
          c.path,
          c.start_line,
          c.end_line,
          c.text,
          c.source,
          distance
        FROM chunks_vec
        JOIN chunks c ON chunks_vec.chunk_id = c.id
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
      `).all(queryVector, maxResults) as Array<{
        path: string;
        start_line: number;
        end_line: number;
        text: string;
        source: string;
        distance: number;
      }>;

      // 转换距离为相似度分数
      return results.map((r) => ({
        path: r.path,
        startLine: r.start_line,
        endLine: r.end_line,
        score: 1 / (1 + r.distance),
        snippet: r.text,
        source: r.source as "memory" | "sessions",
      }));
    } catch (error) {
      console.error("Vector search failed:", error);
      return [];
    }
  }

  /**
   * 关键词搜索（全文搜索）
   */
  private async searchKeyword(
    query: string,
    maxResults: number,
  ): Promise<MemorySearchResult[]> {
    if (!this.hasFullTextSearch()) {
      return [];
    }

    try {
      const results = this.db.prepare(`
        SELECT
          c.path,
          c.start_line,
          c.end_line,
          c.text,
          c.source,
          bm25(chunks_fts) as score
        FROM chunks_fts
        JOIN chunks c ON chunks_fts.id = c.id
        WHERE chunks_fts MATCH ?
        ORDER BY score
        LIMIT ?
      `).all(query, maxResults) as Array<{
        path: string;
        start_line: number;
        end_line: number;
        text: string;
        source: string;
        score: number;
      }>;

      // BM25 分数转换为 0-1（简化处理）
      const maxScore = Math.max(...results.map((r) => r.score), 1);

      return results.map((r) => ({
        path: r.path,
        startLine: r.start_line,
        endLine: r.end_line,
        score: r.score / maxScore,
        snippet: r.text,
        source: r.source as "memory" | "sessions",
      }));
    } catch (error) {
      console.error("Keyword search failed:", error);
      return [];
    }
  }

  /**
   * 合并混合搜索结果
   */
  private mergeHybridResults(params: {
    vector: MemorySearchResult[];
    keyword: MemorySearchResult[];
    vectorWeight: number;
    textWeight: number;
  }): MemorySearchResult[] {
    const { vector, keyword, vectorWeight, textWeight } = params;

    // 创建结果映射（使用 path+startLine+endLine 作为唯一键）
    const resultMap = new Map<
      string,
      MemorySearchResult & { vectorScore?: number; keywordScore?: number }
    >();

    // 添加向量搜索结果
    for (const result of vector) {
      const key = `${result.path}:${result.startLine}:${result.endLine}`;
      resultMap.set(key, { ...result, vectorScore: result.score });
    }

    // 合并关键词搜索结果
    for (const result of keyword) {
      const key = `${result.path}:${result.startLine}:${result.endLine}`;
      const existing = resultMap.get(key);

      if (existing) {
        // 已存在，合并分数
        existing.keywordScore = result.score;
        existing.score =
          existing.vectorScore! * vectorWeight + result.score * textWeight;
      } else {
        // 不存在，添加新结果
        resultMap.set(key, { ...result, keywordScore: result.score });
      }
    }

    // 转换为数组并排序
    return Array.from(resultMap.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * 检查是否支持全文搜索
   */
  private hasFullTextSearch(): boolean {
    const ftsTableExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts'"
    ).get() as { name: string } | undefined;

    return !!ftsTableExists;
  }

  /**
   * 全量重建索引
   */
  async reindex(progress?: IndexProgressCallback): Promise<void> {
    // 删除所有索引
    this.db.prepare(`DELETE FROM chunks WHERE source = ?`).run("memory");
    this.db.prepare(`DELETE FROM files WHERE source = ?`).run("memory");

    // 重新同步
    await this.sync(progress);
  }

  /**
   * 获取索引统计信息
   */
  getStats(): {
    fileCount: number;
    chunkCount: number;
    totalSize: number;
  } {
    try {
      const fileCount = this.db
        .prepare(`SELECT COUNT(*) as count FROM files WHERE source = ?`)
        .get("memory") as { count: number };

      const chunkCount = this.db
        .prepare(`SELECT COUNT(*) as count FROM chunks WHERE source = ?`)
        .get("memory") as { count: number };

      const totalSize = this.db
        .prepare(`SELECT SUM(size) as total FROM files WHERE source = ?`)
        .get("memory") as { total: number | null };

      return {
        fileCount: fileCount.count,
        chunkCount: chunkCount.count,
        totalSize: totalSize.total || 0,
      };
    } catch {
      // 数据库连接已关闭
      return {
        fileCount: 0,
        chunkCount: 0,
        totalSize: 0,
      };
    }
  }
}
