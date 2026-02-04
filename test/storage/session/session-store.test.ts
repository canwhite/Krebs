/**
 * Session Store 测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rm, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { SessionStore } from "@/storage/session/index.js";
import type { Message } from "@/types/index.js";

describe("SessionStore", () => {
  const testDir = path.resolve("/tmp/krebs-test-session-store");
  let store: SessionStore;

  beforeEach(async () => {
    // 清理测试目录
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
    await mkdir(testDir, { recursive: true });

    // 创建 store
    store = new SessionStore({
      baseDir: testDir,
      enableCache: true,
      cacheTtl: 1000, // 1 秒
    });
  });

  afterEach(async () => {
    // 清理测试目录
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe("saveSession & loadSession", () => {
    it("应该保存和加载简单的会话", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      await store.saveSession("test-session", messages);

      const loaded = await store.loadSession("test-session");
      expect(loaded).not.toBeNull();
      expect(loaded?.messages).toEqual(messages);
      expect(loaded?.entry.sessionId).toBeDefined();
      expect(loaded?.entry.updatedAt).toBeDefined();
    });

    it("应该保存和加载包含元数据的会话", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
      ];

      await store.saveSession("test-session", messages, {
        model: "gpt-4",
        modelProvider: "openai",
        inputTokens: 10,
        outputTokens: 20,
      });

      const loaded = await store.loadSession("test-session");
      expect(loaded?.entry.model).toBe("gpt-4");
      expect(loaded?.entry.modelProvider).toBe("openai");
      expect(loaded?.entry.inputTokens).toBe(10);
      expect(loaded?.entry.outputTokens).toBe(20);
    });

    it("应该返回 null 对于不存在的会话", async () => {
      const loaded = await store.loadSession("non-existent");
      expect(loaded).toBeNull();
    });

    it("应该更新现有会话", async () => {
      const messages1: Message[] = [
        { role: "user", content: "Hello" },
      ];

      await store.saveSession("test-session", messages1, {
        model: "gpt-3.5",
      });

      const messages2: Message[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ];

      await store.saveSession("test-session", messages2, {
        model: "gpt-4",
        inputTokens: 100,
      });

      const loaded = await store.loadSession("test-session");
      expect(loaded?.messages).toEqual(messages2);
      expect(loaded?.entry.model).toBe("gpt-4");
      expect(loaded?.entry.inputTokens).toBe(100);
      expect(loaded?.entry.createdAt).toBeDefined(); // 创建时间应该保留
    });
  });

  describe("deleteSession", () => {
    it("应该删除会话", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
      ];

      await store.saveSession("test-session", messages);
      expect(await store.loadSession("test-session")).not.toBeNull();

      await store.deleteSession("test-session");
      expect(await store.loadSession("test-session")).toBeNull();
    });

    it("应该不报错删除不存在的会话", async () => {
      await expect(store.deleteSession("non-existent")).resolves.toBeUndefined();
    });
  });

  describe("listSessions", () => {
    it("应该列出所有会话", async () => {
      await store.saveSession("session1", [{ role: "user", content: "Hello 1" }]);
      await store.saveSession("session2", [{ role: "user", content: "Hello 2" }]);
      await store.saveSession("session3", [{ role: "user", content: "Hello 3" }]);

      const sessions = await store.listSessions();
      expect(sessions).toHaveLength(3);
      expect(sessions.map((s) => s.sessionKey)).toEqual(
        expect.arrayContaining(["session1", "session2", "session3"]),
      );
    });

    it("应该按更新时间降序排列", async () => {
      await store.saveSession("session1", [{ role: "user", content: "Hello 1" }]);

      // 添加延迟以确保时间戳不同
      await new Promise((resolve) => setTimeout(resolve, 10));
      await store.saveSession("session2", [{ role: "user", content: "Hello 2" }]);

      await new Promise((resolve) => setTimeout(resolve, 10));
      await store.saveSession("session3", [{ role: "user", content: "Hello 3" }]);

      // 更新 session1，使其成为最新的
      await new Promise((resolve) => setTimeout(resolve, 10));
      await store.saveSession("session1", [
        { role: "user", content: "Hello 1" },
        { role: "assistant", content: "Updated" },
      ]);

      // 等待一下，确保文件系统同步
      await new Promise((resolve) => setTimeout(resolve, 10));

      const sessions = await store.listSessions();

      // 验证 session1 的 updatedAt 是最新的
      const session1 = sessions.find((s) => s.sessionKey === "session1");
      const session2 = sessions.find((s) => s.sessionKey === "session2");
      const session3 = sessions.find((s) => s.sessionKey === "session3");

      expect(session1).toBeDefined();
      expect(session2).toBeDefined();
      expect(session3).toBeDefined();

      // session1 的 updatedAt 应该是最大的
      expect(session1!.entry.updatedAt).toBeGreaterThan(session2!.entry.updatedAt);
      expect(session1!.entry.updatedAt).toBeGreaterThan(session3!.entry.updatedAt);

      // 验证排序
      expect(sessions[0].sessionKey).toBe("session1"); // 最新的
    });

    it("应该返回空数组如果没有会话", async () => {
      const sessions = await store.listSessions();
      expect(sessions).toEqual([]);
    });
  });

  describe("updateSessionMetadata", () => {
    it("应该更新会话元数据", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
      ];

      await store.saveSession("test-session", messages, {
        model: "gpt-3.5",
      });

      const updated = await store.updateSessionMetadata("test-session", {
        model: "gpt-4",
        inputTokens: 100,
      });

      expect(updated?.model).toBe("gpt-4");
      expect(updated?.inputTokens).toBe(100);

      const loaded = await store.loadSession("test-session");
      expect(loaded?.entry.model).toBe("gpt-4");
      expect(loaded?.entry.inputTokens).toBe(100);
    });

    it("应该返回 null 对于不存在的会话", async () => {
      const updated = await store.updateSessionMetadata("non-existent", {
        model: "gpt-4",
      });
      expect(updated).toBeNull();
    });
  });

  describe("缓存", () => {
    it("应该使用缓存", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
      ];

      await store.saveSession("cached-session", messages);

      // 第一次加载
      const loaded1 = await store.loadSession("cached-session");
      expect(loaded1).not.toBeNull();

      // 第二次加载（应该从缓存读取）
      const loaded2 = await store.loadSession("cached-session");
      expect(loaded2).not.toBeNull();
      expect(loaded2?.entry.sessionId).toBe(loaded1?.entry.sessionId);
    });

    it("应该清除缓存", async () => {
      const messages: Message[] = [
        { role: "user", content: "Hello" },
      ];

      await store.saveSession("cached-session", messages);
      await store.loadSession("cached-session");

      store.clearCache();

      // 缓存已清除，但仍可从文件加载
      const loaded = await store.loadSession("cached-session");
      expect(loaded).not.toBeNull();
    });
  });

  describe("并发控制", () => {
    it("应该处理并发的保存操作", async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        store.saveSession("concurrent-session", [
          { role: "user", content: `Message ${i}` },
        ]),
      );

      await expect(Promise.all(promises)).resolves.toBeDefined();
      expect(await store.loadSession("concurrent-session")).not.toBeNull();
    });
  });
});
