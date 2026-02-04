/**
 * Memory Storage 数据库架构单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ensureMemoryIndexSchema, saveIndexMeta, loadIndexMeta } from "@/storage/memory/schema.js";
import type { MemoryIndexMeta } from "@/storage/memory/types.js";
import Database from "better-sqlite3";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Memory Storage - Database Schema", () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "krebs-test-"));
    dbPath = path.join(tempDir, "test.db");
    db = new Database(dbPath);
  });

  afterEach(async () => {
    db.close();
    await fs.unlink(dbPath);
  });

  describe("ensureMemoryIndexSchema()", () => {
    it("应该创建所有必需的表", () => {
      const result = ensureMemoryIndexSchema({
        db,
        embeddingCacheTable: "embedding_cache",
        ftsTable: "chunks_fts",
        ftsEnabled: false,
      });

      // 检查表是否存在
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain("meta");
      expect(tableNames).toContain("files");
      expect(tableNames).toContain("chunks");
      expect(tableNames).toContain("embedding_cache");
    });

    it("应该创建 FTS 表（如果启用）", () => {
      const result = ensureMemoryIndexSchema({
        db,
        embeddingCacheTable: "embedding_cache",
        ftsTable: "chunks_fts",
        ftsEnabled: true,
      });

      // 检查是否成功
      if (result.ftsAvailable) {
        const tables = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all() as Array<{ name: string }>;

        const tableNames = tables.map((t) => t.name);
        expect(tableNames).toContain("chunks_fts");
      }
    });

    it("meta 表应该有正确的结构", () => {
      ensureMemoryIndexSchema({
        db,
        embeddingCacheTable: "embedding_cache",
        ftsTable: "chunks_fts",
        ftsEnabled: false,
      });

      const info = db.pragma("table_info(meta)");
      const columns = info.map((row: any) => row.name);

      expect(columns).toContain("key");
      expect(columns).toContain("value");
    });

    it("files 表应该有正确的结构", () => {
      ensureMemoryIndexSchema({
        db,
        embeddingCacheTable: "embedding_cache",
        ftsTable: "chunks_fts",
        ftsEnabled: false,
      });

      const info = db.pragma("table_info(files)");
      const columns = info.map((row: any) => row.name);

      expect(columns).toContain("path");
      expect(columns).toContain("source");
      expect(columns).toContain("hash");
      expect(columns).toContain("mtime");
      expect(columns).toContain("size");
    });

    it("chunks 表应该有正确的结构", () => {
      ensureMemoryIndexSchema({
        db,
        embeddingCacheTable: "embedding_cache",
        ftsTable: "chunks_fts",
        ftsEnabled: false,
      });

      const info = db.pragma("table_info(chunks)");
      const columns = info.map((row: any) => row.name);

      expect(columns).toContain("id");
      expect(columns).toContain("path");
      expect(columns).toContain("source");
      expect(columns).toContain("start_line");
      expect(columns).toContain("end_line");
      expect(columns).toContain("hash");
      expect(columns).toContain("model");
      expect(columns).toContain("text");
      expect(columns).toContain("embedding");
      expect(columns).toContain("updated_at");
    });

    it("embedding_cache 表应该有正确的结构", () => {
      ensureMemoryIndexSchema({
        db,
        embeddingCacheTable: "embedding_cache",
        ftsTable: "chunks_fts",
        ftsEnabled: false,
      });

      const info = db.pragma("table_info(embedding_cache)");
      const columns = info.map((row: any) => row.name);

      expect(columns).toContain("provider");
      expect(columns).toContain("model");
      expect(columns).toContain("provider_key");
      expect(columns).toContain("hash");
      expect(columns).toContain("embedding");
      expect(columns).toContain("dims");
      expect(columns).toContain("updated_at");
    });

    it("应该创建必要的索引", () => {
      ensureMemoryIndexSchema({
        db,
        embeddingCacheTable: "embedding_cache",
        ftsTable: "chunks_fts",
        ftsEnabled: false,
      });

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index'")
        .all() as Array<{ name: string }>;

      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain("idx_embedding_cache_updated_at");
      expect(indexNames).toContain("idx_chunks_path");
      expect(indexNames).toContain("idx_chunks_source");
    });

    it("应该支持多次调用（幂等性）", () => {
      ensureMemoryIndexSchema({
        db,
        embeddingCacheTable: "embedding_cache",
        ftsTable: "chunks_fts",
        ftsEnabled: false,
      });

      // 第二次调用不应该出错
      expect(() => {
        ensureMemoryIndexSchema({
          db,
          embeddingCacheTable: "embedding_cache",
          ftsTable: "chunks_fts",
          ftsEnabled: false,
        });
      }).not.toThrow();
    });

    it("应该向后兼容（添加缺失的列）", () => {
      // 手动创建没有 source 列的旧表
      db.exec(`
        CREATE TABLE files (
          path TEXT PRIMARY KEY,
          hash TEXT NOT NULL,
          mtime INTEGER NOT NULL,
          size INTEGER NOT NULL
        );
      `);

      ensureMemoryIndexSchema({
        db,
        embeddingCacheTable: "embedding_cache",
        ftsTable: "chunks_fts",
        ftsEnabled: false,
      });

      // 检查 source 列是否被添加
      const info = db.pragma("table_info(files)");
      const columns = info.map((row: any) => row.name);

      expect(columns).toContain("source");
    });
  });

  describe("saveIndexMeta() 和 loadIndexMeta()", () => {
    beforeEach(() => {
      // 确保数据库架构已创建
      ensureMemoryIndexSchema({
        db,
        embeddingCacheTable: "embedding_cache",
        ftsTable: "chunks_fts",
        ftsEnabled: false,
      });
    });

    it("应该保存和加载索引元信息", () => {
      const meta: MemoryIndexMeta = {
        model: "nomic-embed-text",
        provider: "ollama",
        chunkTokens: 500,
        chunkOverlap: 50,
        vectorDims: 768,
      };

      saveIndexMeta(db, meta);

      const loaded = loadIndexMeta(db);
      expect(loaded).toEqual(meta);
    });

    it("应该覆盖已有的元信息", () => {
      const meta1: MemoryIndexMeta = {
        model: "model-1",
        provider: "ollama",
        chunkTokens: 100,
        chunkOverlap: 10,
      };

      const meta2: MemoryIndexMeta = {
        model: "model-2",
        provider: "openai",
        chunkTokens: 200,
        chunkOverlap: 20,
        vectorDims: 1536,
      };

      saveIndexMeta(db, meta1);
      saveIndexMeta(db, meta2);

      const loaded = loadIndexMeta(db);
      expect(loaded).toEqual(meta2);
    });

    it("应该处理不存在的元信息", () => {
      const loaded = loadIndexMeta(db);
      expect(loaded).toBeNull();
    });

    it("应该处理包含可选字段的元信息", () => {
      const meta: MemoryIndexMeta = {
        model: "nomic-embed-text",
        provider: "ollama",
        providerKey: "custom-key",
        chunkTokens: 500,
        chunkOverlap: 50,
        vectorDims: 768,
      };

      saveIndexMeta(db, meta);

      const loaded = loadIndexMeta(db);
      expect(loaded).toEqual(meta);
      expect(loaded?.providerKey).toBe("custom-key");
    });

    it("应该处理 JSON 解析错误", () => {
      // 手动插入无效的 JSON
      db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run(
        "memory_index_meta_v1",
        "invalid json"
      );

      const loaded = loadIndexMeta(db);
      expect(loaded).toBeNull();
    });
  });

  describe("数据库操作", () => {
    beforeEach(() => {
      ensureMemoryIndexSchema({
        db,
        embeddingCacheTable: "embedding_cache",
        ftsTable: "chunks_fts",
        ftsEnabled: false,
      });
    });

    it("应该能够插入和查询 files 记录", () => {
      const stmt = db.prepare(`
        INSERT INTO files (path, source, hash, mtime, size)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run("test.md", "memory", "abc123", 1000, 100);

      const row = db
        .prepare("SELECT * FROM files WHERE path = ?")
        .get("test.md") as any;

      expect(row).toBeDefined();
      expect(row.path).toBe("test.md");
      expect(row.source).toBe("memory");
      expect(row.hash).toBe("abc123");
    });

    it("应该能够插入和查询 chunks 记录", () => {
      const stmt = db.prepare(`
        INSERT INTO chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        "chunk-1",
        "test.md",
        "memory",
        1,
        10,
        "hash-1",
        "model-1",
        "chunk text",
        "[0.1, 0.2, 0.3]",
        1000
      );

      const row = db
        .prepare("SELECT * FROM chunks WHERE id = ?")
        .get("chunk-1") as any;

      expect(row).toBeDefined();
      expect(row.id).toBe("chunk-1");
      expect(row.path).toBe("test.md");
      expect(row.start_line).toBe(1);
      expect(row.end_line).toBe(10);
    });

    it("应该能够更新已有记录", () => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO files (path, source, hash, mtime, size)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run("test.md", "memory", "hash-1", 1000, 100);

      // 更新
      stmt.run("test.md", "memory", "hash-2", 2000, 200);

      const row = db
        .prepare("SELECT * FROM files WHERE path = ?")
        .get("test.md") as any;

      expect(row.hash).toBe("hash-2");
      expect(row.mtime).toBe(2000);
      expect(row.size).toBe(200);
    });

    it("应该能够删除记录", () => {
      const stmt = db.prepare(`
        INSERT INTO files (path, source, hash, mtime, size)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run("test.md", "memory", "hash-1", 1000, 100);

      // 删除
      db.prepare("DELETE FROM files WHERE path = ?").run("test.md");

      const row = db
        .prepare("SELECT * FROM files WHERE path = ?")
        .get("test.md");

      expect(row).toBeUndefined();
    });
  });
});
