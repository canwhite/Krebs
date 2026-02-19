/**
 * System Prompt 构建器测试
 *
 * 测试 Phase 1 + Phase 2 改进：
 * - 工具系统增强（排序、摘要、大小写解析）
 * - Tool Call Style Section
 * - Memory Recall Section
 * - 上下文文件支持（SOUL.md）
 * - findGitRoot 函数
 * - 增强 Runtime 信息
 */

import { describe, it, expect } from "vitest";
import {
  buildAgentSystemPrompt,
  type SystemPromptConfig,
  type Tool,
  PromptMode,
  findGitRoot,
  type ContextFile,
} from "../../src/agent/core/system-prompt";

describe("System Prompt Builder - Phase 1 Tests", () => {
  describe("Tool System Enhancement", () => {
    it("should sort tools by priority order", () => {
      const tools: Tool[] = [
        { name: "memory_save", description: "Save to memory" },
        { name: "read", description: "Read files" },
        { name: "grep", description: "Search files" },
        { name: "write", description: "Write files" },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        tools,
      };

      const prompt = buildAgentSystemPrompt(config);

      // 验证工具按优先级排序：read -> write -> grep -> memory_save
      const readIndex = prompt.indexOf("read");
      const writeIndex = prompt.indexOf("write");
      const grepIndex = prompt.indexOf("grep");
      const memoryIndex = prompt.indexOf("memory_save");

      expect(readIndex).toBeLessThan(writeIndex);
      expect(writeIndex).toBeLessThan(grepIndex);
      expect(grepIndex).toBeLessThan(memoryIndex);
    });

    it("should use core tool summaries for known tools", () => {
      const tools: Tool[] = [
        { name: "read", description: "Custom description" },
        { name: "write", description: "Another custom" },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        tools,
      };

      const prompt = buildAgentSystemPrompt(config);

      // 核心工具摘要应该优先于自定义描述
      expect(prompt).toContain("`read`: Read file contents");
      expect(prompt).toContain("`write`: Create or overwrite files");
    });

    it("should use custom descriptions for unknown tools", () => {
      const tools: Tool[] = [
        { name: "custom_tool", description: "This is a custom tool" },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        tools,
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("`custom_tool`: This is a custom tool");
    });

    it("should handle case-insensitive tool names", () => {
      const tools: Tool[] = [
        { name: "Read", description: "Read files" },
        { name: "WRITE", description: "Write files" },
        { name: "GreP", description: "Search files" },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        tools,
      };

      const prompt = buildAgentSystemPrompt(config);

      // 应该保留原始大小写，但按规范化名称去重和排序
      expect(prompt).toContain("`Read`: Read file contents");
      expect(prompt).toContain("`WRITE`: Create or overwrite files");
      expect(prompt).toContain("`GreP`: Search file contents for patterns");
    });

    it("should deduplicate tools case-insensitively", () => {
      const tools: Tool[] = [
        { name: "read", description: "First" },
        { name: "READ", description: "Second" },
        { name: "Read", description: "Third" },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        tools,
      };

      const prompt = buildAgentSystemPrompt(config);

      // 应该只有一个 read 工具（统计 `- \`read\`` 的出现次数）
      const readMatches = prompt.match(/- `read`/gi);
      expect(readMatches).toHaveLength(1);
    });

    it("should include extra tools not in TOOL_ORDER", () => {
      const tools: Tool[] = [
        { name: "read", description: "Read files" },
        { name: "zzz_last_tool", description: "Should be last" },
        { name: "aaa_first_tool", description: "Should be before zzz" },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        tools,
      };

      const prompt = buildAgentSystemPrompt(config);

      // extra tools 应该按字母排序
      const aaaIndex = prompt.indexOf("aaa_first_tool");
      const zzzIndex = prompt.indexOf("zzz_last_tool");
      expect(aaaIndex).toBeLessThan(zzzIndex);
    });
  });

  describe("Tool Call Style Section", () => {
    it("should include tool call style section in full mode", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        tools: [{ name: "read", description: "Read files" }],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("## Tool Call Style");
      expect(prompt).toContain("do not narrate routine, low-risk tool calls");
      expect(prompt).toContain("Narrate only when it helps");
    });

    it("should NOT include tool call style section in minimal mode", () => {
      const config: SystemPromptConfig = {
        promptMode: "minimal",
        tools: [{ name: "read", description: "Read files" }],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).not.toContain("## Tool Call Style");
    });

    it("should include specific narration guidelines", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        tools: [{ name: "read", description: "Read files" }],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("Multi-step work");
      expect(prompt).toContain("Complex/challenging problems");
      expect(prompt).toContain("Sensitive actions");
      expect(prompt).toContain("brief and value-dense");
    });
  });

  describe("Memory Recall Section", () => {
    it("should include memory section when memory_search is available", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        tools: [
          { name: "read", description: "Read files" },
          { name: "memory_search", description: "Search memory" },
        ],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("## Memory Recall");
      expect(prompt).toContain("memory_search on MEMORY.md");
    });

    it("should include memory section when memory_get is available", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        tools: [
          { name: "read", description: "Read files" },
          { name: "memory_get", description: "Get memory" },
        ],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("## Memory Recall");
      expect(prompt).toContain("memory_get");
    });

    it("should NOT include memory section when no memory tools", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        tools: [
          { name: "read", description: "Read files" },
          { name: "write", description: "Write files" },
        ],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).not.toContain("## Memory Recall");
    });

    it("should include step-by-step memory guidance", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        tools: [
          { name: "memory_search", description: "Search memory" },
          { name: "memory_get", description: "Get memory" },
        ],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("1. Run memory_search");
      expect(prompt).toContain("2. Use memory_get");
      expect(prompt).toContain("3. If low confidence");
    });
  });

  describe("Prompt Mode: none", () => {
    it("should return only base prompt in none mode", () => {
      const config: SystemPromptConfig = {
        promptMode: "none",
        basePrompt: "Custom base prompt",
        tools: [{ name: "read", description: "Read files" }],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toBe("Custom base prompt");
      expect(prompt).not.toContain("## Tooling");
    });

    it("should return default prompt in none mode without basePrompt", () => {
      const config: SystemPromptConfig = {
        promptMode: "none",
        tools: [{ name: "read", description: "Read files" }],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toBe("You are a helpful AI assistant.");
    });
  });

  describe("Prompt Mode: minimal", () => {
    it("should include tools in minimal mode", () => {
      const config: SystemPromptConfig = {
        promptMode: "minimal",
        tools: [{ name: "read", description: "Read files" }],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("## Tooling");
      expect(prompt).toContain("read");
    });

    it("should NOT include workspace info in minimal mode", () => {
      const config: SystemPromptConfig = {
        promptMode: "minimal",
        tools: [{ name: "read", description: "Read files" }],
        workspaceDir: "/path/to/workspace",
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).not.toContain("## Workspace");
    });

    it("should NOT include tool call style in minimal mode", () => {
      const config: SystemPromptConfig = {
        promptMode: "minimal",
        tools: [{ name: "read", description: "Read files" }],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).not.toContain("## Tool Call Style");
    });
  });

  describe("Prompt Mode: full", () => {
    it("should include all sections in full mode", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        tools: [
          { name: "read", description: "Read files" },
          { name: "memory_search", description: "Search memory" },
        ],
        workspaceDir: "/workspace",
        timezone: "UTC",
        runtime: {
          agentId: "test-agent",
          host: "localhost",
          os: "linux",
          arch: "x64",
          node: "v22",
        },
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("## Tooling");
      expect(prompt).toContain("## Tool Call Style");
      expect(prompt).toContain("## Memory Recall");
      expect(prompt).toContain("## Workspace");
      expect(prompt).toContain("## Current Date & Time");
      expect(prompt).toContain("## Runtime");
    });
  });

  describe("Runtime Information", () => {
    it("should include detailed runtime info", () => {
      const runtime = {
        agentId: "test-agent",
        host: "localhost",
        os: "linux",
        arch: "x64",
        node: "v22",
        model: "claude-sonnet-4",
        defaultModel: "claude-haiku-4",
        repoRoot: "/path/to/repo",
      };

      const config: SystemPromptConfig = {
        promptMode: "full",
        runtime,
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("agent=test-agent");
      expect(prompt).toContain("host=localhost");
      expect(prompt).toContain("os=linux (x64)");
      expect(prompt).toContain("node=v22");
      expect(prompt).toContain("model=claude-sonnet-4");
      expect(prompt).toContain("default_model=claude-haiku-4");
      expect(prompt).toContain("repo=/path/to/repo");
    });

    it("should handle partial runtime info", () => {
      const runtime = {
        agentId: "test-agent",
        os: "darwin",
      };

      const config: SystemPromptConfig = {
        promptMode: "full",
        runtime,
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("agent=test-agent");
      expect(prompt).toContain("os=darwin");
    });

    it("should include environment field", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        runtime: {
          environment: "production",
        },
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("env=production");
    });
  });
});

describe("System Prompt Builder - Phase 2 Tests", () => {
  describe("Context Files Support", () => {
    it("should include context files section", () => {
      const contextFiles: ContextFile[] = [
        {
          path: "SOUL.md",
          content: "# Persona\nYou are a helpful assistant.",
        },
        {
          path: "AGENTS.md",
          content: "# Agents\nThis is a multi-agent system.",
        },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        contextFiles,
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("# Project Context");
      expect(prompt).toContain("## SOUL.md");
      expect(prompt).toContain("## AGENTS.md");
      expect(prompt).toContain("You are a helpful assistant.");
      expect(prompt).toContain("This is a multi-agent system.");
    });

    it("should include SOUL.md persona guidance", () => {
      const contextFiles: ContextFile[] = [
        {
          path: "SOUL.md",
          content: "# Persona\nBe friendly and casual.",
        },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        contextFiles,
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain(
        "If SOUL.md is present, embody its persona and tone."
      );
      expect(prompt).toContain(
        "Avoid stiff, generic replies; follow its guidance"
      );
    });

    it("should NOT include context section when no files", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        contextFiles: [],
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).not.toContain("# Project Context");
    });

    it("should detect SOUL.md case-insensitively", () => {
      const contextFiles: ContextFile[] = [
        {
          path: "soul.md",
          content: "Be friendly.",
        },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        contextFiles,
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain(
        "If SOUL.md is present, embody its persona and tone."
      );
    });

    it("should include context files in minimal mode", () => {
      const contextFiles: ContextFile[] = [
        {
          path: "README.md",
          content: "# My Project",
        },
      ];

      const config: SystemPromptConfig = {
        promptMode: "minimal",
        contextFiles,
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("# Project Context");
      expect(prompt).toContain("## README.md");
    });
  });

  describe("findGitRoot Function", () => {
    it("should find git root in current directory", () => {
      const result = findGitRoot("/Users/zack/Desktop/Krebs");
      // 应该能找到 .git 目录
      expect(result).not.toBeNull();
      expect(result).toContain("Krebs");
    });

    it("should return null when no git repository", () => {
      const result = findGitRoot("/tmp/nonexistent");
      expect(result).toBeNull();
    });

    it("should handle subdirectories correctly", () => {
      const result = findGitRoot("/Users/zack/Desktop/Krebs/src/agent");
      // 应该能找到项目根目录
      expect(result).not.toBeNull();
      if (result) {
        expect(result).not.toContain("/src/agent");
      }
    });
  });

  describe("Enhanced Runtime Information", () => {
    it("should include channel in runtime", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        runtime: {
          channel: "discord",
        },
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("channel=discord");
    });

    it("should include capabilities in runtime", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        runtime: {
          capabilities: ["inlineButtons", "reactions", "threads"],
        },
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("capabilities=inlineButtons,reactions,threads");
    });

    it("should include all runtime fields together", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        runtime: {
          agentId: "krebs-bot",
          host: "server01",
          os: "linux",
          arch: "x64",
          node: "v22",
          model: "claude-sonnet-4",
          defaultModel: "claude-haiku-4",
          environment: "production",
          channel: "discord",
          capabilities: ["inlineButtons", "reactions"],
          repoRoot: "/workspace",
        },
      };

      const prompt = buildAgentSystemPrompt(config);

      expect(prompt).toContain("agent=krebs-bot");
      expect(prompt).toContain("host=server01");
      expect(prompt).toContain("os=linux (x64)");
      expect(prompt).toContain("node=v22");
      expect(prompt).toContain("model=claude-sonnet-4");
      expect(prompt).toContain("default_model=claude-haiku-4");
      expect(prompt).toContain("env=production");
      expect(prompt).toContain("channel=discord");
      expect(prompt).toContain("capabilities=inlineButtons,reactions");
      expect(prompt).toContain("repo=/workspace");
    });
  });

  describe("Integration Tests - Phase 2", () => {
    it("should generate complete prompt with all Phase 2 features", () => {
      const contextFiles: ContextFile[] = [
        {
          path: "SOUL.md",
          content: "# Persona\nYou are a friendly, helpful assistant who loves to code.",
        },
        {
          path: "TOOLS.md",
          content: "# Available Tools\nCustom tool definitions here.",
        },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        basePrompt: "You are Krebs AI.",
        tools: [
          { name: "read", description: "Read files" },
          { name: "memory_search", description: "Search memory" },
        ],
        contextFiles,
        runtime: {
          agentId: "krebs-main",
          channel: "discord",
          capabilities: ["inlineButtons"],
          os: "linux",
          node: "v22",
        },
        workspaceDir: "/workspace",
      };

      const prompt = buildAgentSystemPrompt(config);

      // Phase 1 功能
      expect(prompt).toContain("## Tooling");
      expect(prompt).toContain("## Tool Call Style");
      expect(prompt).toContain("## Memory Recall");
      expect(prompt).toContain("## Workspace");

      // Phase 2 新增功能
      expect(prompt).toContain("# Project Context");
      expect(prompt).toContain("## SOUL.md");
      expect(prompt).toContain("You are a friendly, helpful assistant");
      expect(prompt).toContain("## TOOLS.md");
      expect(prompt).toContain("embody its persona and tone");

      // 增强的 Runtime 信息
      expect(prompt).toContain("channel=discord");
      expect(prompt).toContain("capabilities=inlineButtons");
    });
  });
});
