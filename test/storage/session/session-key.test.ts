/**
 * Session Key 工具测试
 */

import { describe, it, expect } from "vitest";
import {
  parseSessionKey,
  buildSessionKey,
  normalizeAgentId,
  isMultiAgentSessionKey,
  isSpecialSessionKey,
  resolveAgentId,
  canonicalizeSessionKey,
} from "@/storage/session/index.js";

describe("session-key", () => {
  describe("parseSessionKey", () => {
    it("应该解析简单的 session key", () => {
      const result = parseSessionKey("user123");
      expect(result).toEqual({
        agentId: undefined,
        key: "user123",
        raw: "user123",
      });
    });

    it("应该解析多 agent 的 session key", () => {
      const result = parseSessionKey("agent:my-agent:user123");
      expect(result).toEqual({
        agentId: "my-agent",
        key: "user123",
        raw: "agent:my-agent:user123",
      });
    });

    it("应该解析 global 特殊 key", () => {
      const result = parseSessionKey("global");
      expect(result).toEqual({
        agentId: undefined,
        key: "global",
        raw: "global",
      });
    });

    it("应该解析 unknown 特殊 key", () => {
      const result = parseSessionKey("unknown");
      expect(result).toEqual({
        agentId: undefined,
        key: "unknown",
        raw: "unknown",
      });
    });

    it("应该处理包含多个冒号的 key", () => {
      const result = parseSessionKey("agent:my-agent:channel:group:123");
      expect(result).toEqual({
        agentId: "my-agent",
        key: "channel:group:123",
        raw: "agent:my-agent:channel:group:123",
      });
    });

    it("应该拒绝无效的多 agent 格式", () => {
      expect(parseSessionKey("agent:only-two")).toBeNull();
      expect(parseSessionKey("agent:")).toBeNull();
    });

    it("应该拒绝空字符串", () => {
      expect(parseSessionKey("")).toBeNull();
      expect(parseSessionKey("   ")).toBeNull();
      expect(parseSessionKey(null)).toBeNull();
      expect(parseSessionKey(undefined)).toBeNull();
    });
  });

  describe("buildSessionKey", () => {
    it("应该构建简单的 session key", () => {
      const result = buildSessionKey(undefined, "user123");
      expect(result).toBe("user123");
    });

    it("应该构建多 agent 的 session key", () => {
      const result = buildSessionKey("my-agent", "user123");
      expect(result).toBe("agent:my-agent:user123");
    });

    it("应该保留 global 和 unchanged", () => {
      expect(buildSessionKey(undefined, "global")).toBe("global");
      expect(buildSessionKey("my-agent", "global")).toBe("global");
    });

    it("应该抛出错误对于空 key", () => {
      expect(() => buildSessionKey(undefined, "")).toThrow();
      expect(() => buildSessionKey(undefined, "   ")).toThrow();
    });

    it("应该抛出错误对于空的 agent ID", () => {
      expect(() => buildSessionKey("", "user123")).toThrow();
      expect(() => buildSessionKey("   ", "user123")).toThrow();
    });
  });

  describe("normalizeAgentId", () => {
    it("应该规范化 agent ID", () => {
      expect(normalizeAgentId("My Agent")).toBe("my-agent");
      expect(normalizeAgentId("My_Agent")).toBe("my_agent");
      expect(normalizeAgentId("  My  Agent  ")).toBe("my-agent");
    });

    it("应该处理已经是规范化的 ID", () => {
      expect(normalizeAgentId("my-agent")).toBe("my-agent");
      expect(normalizeAgentId("my_agent")).toBe("my_agent");
    });
  });

  describe("isMultiAgentSessionKey", () => {
    it("应该识别多 agent key", () => {
      expect(isMultiAgentSessionKey("agent:my-agent:user123")).toBe(true);
    });

    it("应该识别非多 agent key", () => {
      expect(isMultiAgentSessionKey("user123")).toBe(false);
      expect(isMultiAgentSessionKey("global")).toBe(false);
      expect(isMultiAgentSessionKey("")).toBe(false);
      expect(isMultiAgentSessionKey(null)).toBe(false);
    });
  });

  describe("isSpecialSessionKey", () => {
    it("应该识别特殊 key", () => {
      expect(isSpecialSessionKey("global")).toBe(true);
      expect(isSpecialSessionKey("unknown")).toBe(true);
    });

    it("应该识别非特殊 key", () => {
      expect(isSpecialSessionKey("user123")).toBe(false);
      expect(isSpecialSessionKey("agent:my-agent:user123")).toBe(false);
      expect(isSpecialSessionKey("")).toBe(false);
      expect(isSpecialSessionKey(null)).toBe(false);
    });
  });

  describe("resolveAgentId", () => {
    it("应该从多 agent key 提取 agent ID", () => {
      expect(resolveAgentId("agent:my-agent:user123", "default")).toBe("my-agent");
    });

    it("应该返回默认 agent ID 对于简单 key", () => {
      expect(resolveAgentId("user123", "default")).toBe("default");
    });

    it("应该返回默认 agent ID 对于特殊 key", () => {
      expect(resolveAgentId("global", "default")).toBe("default");
      expect(resolveAgentId("unknown", "default")).toBe("default");
    });
  });

  describe("canonicalizeSessionKey", () => {
    it("应该规范化简单的 key", () => {
      expect(canonicalizeSessionKey("user123")).toBe("user123");
    });

    it("应该规范化多 agent key", () => {
      expect(canonicalizeSessionKey("agent:My-Agent:user123")).toBe("agent:my-agent:user123");
    });

    it("应该保留特殊 key unchanged", () => {
      expect(canonicalizeSessionKey("global")).toBe("global");
      expect(canonicalizeSessionKey("unknown")).toBe("unknown");
    });

    it("应该添加默认 agent ID", () => {
      expect(canonicalizeSessionKey("user123", "default")).toBe("agent:default:user123");
    });

    it("应该抛出错误对于无效的 key", () => {
      expect(() => canonicalizeSessionKey("")).toThrow();
    });
  });
});
