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
  private readonly options = {
    ftsEnabled: true, // 全文搜索
    watchEnabled: true, // 实时监听
    watchDebounceMs: 5000, // 监听去抖（5秒）
    embeddingCache: true, // Embedding 缓存
  };

  constructor(params: {
    dbPath: string;
    workspaceDir: string;
    embeddingProvider: IEmbeddingProvider;
    chunkConfig?: ChunkConfig;
  }) {
    this.dbPath = params.dbPath;
    this.workspaceDir = params.workspaceDir;
    this.embeddingProvider = params.embeddingProvider;
    this.chunkConfig = params.chunkConfig || {
      tokens: 500,
      overlap: 50,
    };

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
      ftsEnabled: this.options.ftsEnabled,
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
    await this.sync();

    // 启动文件监听
    if (this.options.watchEnabled) {
      this.enableWatch();
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

    this.watcher = chokidar.watch(pathsToWatch, {
      ignoreInitial: true,
      persistent: true,
    });

    this.watcher
      .on("add", () => this.scheduleSync())
      .on("change", () => this.scheduleSync())
      .on("unlink", () => this.scheduleSync());
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

    this.watchDebounceTimer = setTimeout(() => {
      this.sync().catch((err) => {
        console.error("Sync failed:", err);
      });
    }, this.options.watchDebounceMs);
  }

  /**
   * 同步文件（增量更新）
   */
  async sync(progress?: IndexProgressCallback): Promise<void> {
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
   * 向量搜索
   */
  async search(query: string, topK: number = 5): Promise<MemorySearchResult[]> {
    // 1. 检查向量表是否存在
    const vecTableExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_vec'"
    ).get() as { name: string } | undefined;

    if (!vecTableExists) {
      // 向量表不可用，返回空结果
      console.warn("Vector table not available, returning empty results");
      return [];
    }

    // 2. 生成查询的 embedding
    const queryEmbedding = await this.embeddingProvider.embed(query);
    const queryVector = JSON.stringify(queryEmbedding.embedding);

    // 3. 使用 sqlite-vec 进行相似度搜索
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
      `).all(queryVector, topK) as Array<{
        path: string;
        start_line: number;
        end_line: number;
        text: string;
        source: string;
        distance: number;
      }>;

      // 4. 转换距离为相似度分数
      // sqlite-vec 返回的是 L2 距离，距离越小越相似
      // 转换为 0-1 的分数：1 / (1 + distance)
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
