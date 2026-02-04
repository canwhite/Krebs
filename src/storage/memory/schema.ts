/**
 * Memory Storage 数据库架构
 *
 * 参考：openclaw-cn-ds/src/memory/memory-schema.ts
 *
 * 数据库结构：
 * - meta: 存储元信息（如索引配置）
 * - files: 文件元信息（path, hash, mtime, size）
 * - chunks: 文本分块（包含 embedding）
 * - chunks_vec: 向量搜索表（sqlite-vec）
 * - chunks_fts: 全文搜索表（FTS5，可选）
 * - embedding_cache: Embedding 缓存
 */

import type Database from "better-sqlite3";

import type { MemoryIndexMeta } from "./types.js";

/**
 * 确保数据库索引架构已创建
 *
 * @param db - better-sqlite3 Database 实例
 * @param options - 配置选项
 * @returns FTS 可用性状态
 */
export function ensureMemoryIndexSchema(params: {
  db: Database.Database;
  embeddingCacheTable: string;
  ftsTable: string;
  ftsEnabled: boolean;
}): { ftsAvailable: boolean; ftsError?: string } {
  const { db, embeddingCacheTable, ftsTable, ftsEnabled } = params;

  // ========== meta 表 ==========
  // 存储索引元信息
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // ========== files 表 ==========
  // 记录文件元信息
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'memory',
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL
    );
  `);

  // ========== chunks 表 ==========
  // 记录文本分块
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'memory',
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      hash TEXT NOT NULL,
      model TEXT NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // ========== embedding_cache 表 ==========
  // 缓存 embedding 结果，避免重复计算
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${embeddingCacheTable} (
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      provider_key TEXT,
      hash TEXT NOT NULL,
      embedding TEXT NOT NULL,
      dims INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (provider, model, provider_key, hash)
    );
  `);

  // 创建索引：embedding_cache 按更新时间
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_embedding_cache_updated_at ON ${embeddingCacheTable}(updated_at);`,
  );

  // ========== chunks_fts 表（可选）==========
  // 全文搜索表（FTS5）
  let ftsAvailable = false;
  let ftsError: string | undefined;

  if (ftsEnabled) {
    try {
      db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS ${ftsTable} USING fts5(\n` +
          `  text,\n` +
          `  id UNINDEXED,\n` +
          `  path UNINDEXED,\n` +
          `  source UNINDEXED,\n` +
          `  model UNINDEXED,\n` +
          `  start_line UNINDEXED,\n` +
          `  end_line UNINDEXED\n` +
          `);`,
      );
      ftsAvailable = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ftsAvailable = false;
      ftsError = message;
    }
  }

  // ========== chunks_vec 表（向量搜索）==========
  // 使用 sqlite-vec 创建向量索引表
  try {
    // 先检查 vec0 是否可用
    const testRow = db.prepare("SELECT name FROM pragma_function_list WHERE name = 'vec_distance'").get() as { name: string } | undefined;

    if (testRow) {
      // vec0 扩展已加载，创建表
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
          embedding float vector(768),
          chunk_id TEXT
        );
      `);

      // 创建索引以提高查询性能
      db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_vec_chunk_id ON chunks_vec(chunk_id);`);
    } else {
      console.warn("Vector search not available: vec0 extension not loaded");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to create vec0 table: ${message}`);
  }

  // ========== 确保列存在（向后兼容） ==========
  ensureColumn(db, "files", "source", "TEXT NOT NULL DEFAULT 'memory'");
  ensureColumn(db, "chunks", "source", "TEXT NOT NULL DEFAULT 'memory'");

  // ========== 创建索引 ==========
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source);`);

  return { ftsAvailable, ...(ftsError ? { ftsError } : {}) };
}

/**
 * 确保表的列存在（用于数据库迁移）
 *
 * @param db - 数据库实例
 * @param table - 表名
 * @param column - 列名
 * @param definition - 列定义
 */
function ensureColumn(
  db: Database.Database,
  table: "files" | "chunks",
  column: string,
  definition: string,
): void {
  const rows = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;

  if (rows.some((row) => row.name === column)) return;

  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * 保存索引元信息
 *
 * @param db - 数据库实例
 * @param meta - 元信息
 */
export function saveIndexMeta(
  db: Database.Database,
  meta: MemoryIndexMeta,
): void {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`,
  );
  stmt.run("memory_index_meta_v1", JSON.stringify(meta));
}

/**
 * 加载索引元信息
 *
 * @param db - 数据库实例
 * @returns 元信息，如果不存在返回 null
 */
export function loadIndexMeta(
  db: Database.Database,
): MemoryIndexMeta | null {
  const row = db
    .prepare(`SELECT value FROM meta WHERE key = ?`)
    .get("memory_index_meta_v1") as { value: string } | undefined;

  if (!row) return null;

  try {
    return JSON.parse(row.value) as MemoryIndexMeta;
  } catch {
    return null;
  }
}
