/**
 * System Prompt 构建模块单元测试
 */

import { describe, it, expect } from "vitest";
import {
  buildAgentSystemPrompt,
  type SystemPromptConfig,
} from "@/agent/core/system-prompt.js";

describe("system-prompt", () => {
  describe("buildAgentSystemPrompt", () => {
    it("should return base prompt when mode is none", () => {
      const config: SystemPromptConfig = {
        promptMode: "none",
        basePrompt: "You are a helpful assistant.",
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).toBe("You are a helpful assistant.");
    });

    it("should return default base prompt when mode is none and no basePrompt", () => {
      const config: SystemPromptConfig = {
        promptMode: "none",
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).toContain("helpful AI assistant");
    });

    it("should include tools list in minimal mode", () => {
      const mockTools = [
        {
          name: "read",
          description: "Read file contents",
          parameters: { type: "object" },
          execute: async () => ({}),
        },
        {
          name: "write",
          description: "Write content to file",
          parameters: { type: "object" },
          execute: async () => ({}),
        },
      ];

      const config: SystemPromptConfig = {
        promptMode: "minimal",
        basePrompt: "You are an assistant.",
        tools: mockTools,
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).toContain("You are an assistant.");
      expect(result).toContain("## Available Tools");
      expect(result).toContain("`read`");
      expect(result).toContain("Read file contents");
      expect(result).toContain("`write`");
      expect(result).toContain("Write content to file");
    });

    it("should include full information in full mode", () => {
      const mockTools = [
        {
          name: "bash",
          description: "Execute bash commands",
          parameters: { type: "object" },
          execute: async () => ({}),
        },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        basePrompt: "You are Krebs assistant.",
        tools: mockTools,
        workspaceDir: "/Users/zack/Desktop/Krebs",
        timezone: "Asia/Shanghai",
        userIdentity: "Developer working on AI project",
        runtime: {
          version: "1.0.0",
          environment: "development",
        },
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).toContain("You are Krebs assistant.");
      expect(result).toContain("## Available Tools");
      expect(result).toContain("`bash`");
      expect(result).toContain("## Workspace");
      expect(result).toContain("/Users/zack/Desktop/Krebs");
      expect(result).toContain("## Current Date & Time");
      expect(result).toContain("Asia/Shanghai");
      expect(result).toContain("## User Identity");
      expect(result).toContain("Developer working on AI project");
      expect(result).toContain("## Runtime Information");
      expect(result).toContain("1.0.0");
      expect(result).toContain("development");
    });

    it("should include skills information", () => {
      const mockSkills = [
        {
          name: "coding",
          description: "Expert in programming and debugging",
          prompt: "Focus on clean, maintainable code",
        },
        {
          name: "analysis",
          description: "Data analysis and visualization",
        },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        skills: mockSkills,
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).toContain("## Skills");
      expect(result).toContain("`coding`");
      expect(result).toContain("Expert in programming and debugging");
      expect(result).toContain("Focus on clean, maintainable code");
      expect(result).toContain("`analysis`");
      expect(result).toContain("Data analysis and visualization");
    });

    it("should include sandbox information", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        sandboxInfo: {
          enabled: true,
          type: "docker",
          limits: {
            cpu: "2",
            memory: "4GB",
            disk: "20GB",
          },
        },
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).toContain("## Sandbox Environment");
      expect(result).toContain("docker");
      expect(result).toContain("CPU: 2");
      expect(result).toContain("Memory: 4GB");
      expect(result).toContain("Disk: 20GB");
    });

    it("should include tool calling guidelines", () => {
      const mockTools = [
        {
          name: "test-tool",
          description: "A test tool",
          parameters: { type: "object" },
          execute: async () => ({}),
        },
      ];

      const config: SystemPromptConfig = {
        promptMode: "minimal",
        tools: mockTools,
        toolConfig: {
          maxIterations: 15,
        },
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).toContain("## Tool Calling Guidelines");
      expect(result).toContain("You can make up to 15 tool calls");
      expect(result).toContain("Choose the right tool");
      expect(result).toContain("Provide accurate parameters");
    });

    it("should support custom sections", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        basePrompt: "Base prompt",
        extraSections: [
          {
            title: "Custom Instructions",
            content: "These are custom instructions for the agent",
          },
        ],
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).toContain("## Custom Instructions");
      expect(result).toContain("These are custom instructions for the agent");
    });

    it("should not include workspace/time/runtime in minimal mode", () => {
      const config: SystemPromptConfig = {
        promptMode: "minimal",
        workspaceDir: "/some/path",
        timezone: "UTC",
        runtime: {
          environment: "production",
        },
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).not.toContain("## Workspace");
      expect(result).not.toContain("## Current Date & Time");
      expect(result).not.toContain("## Runtime Information");
    });

    it("should handle empty arrays", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
        tools: [],
        skills: [],
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).not.toContain("## Available Tools");
      expect(result).not.toContain("## Skills");
    });

    it("should handle undefined and optional fields", () => {
      const config: SystemPromptConfig = {
        promptMode: "full",
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    it("should correctly handle special characters", () => {
      const mockTools = [
        {
          name: "special:tool",
          description: "Tool with special chars",
          parameters: { type: "object" },
          execute: async () => ({}),
        },
      ];

      const config: SystemPromptConfig = {
        promptMode: "full",
        tools: mockTools,
      };

      const result = buildAgentSystemPrompt(config);

      expect(result).toContain("special:tool");
      expect(result).toContain("Tool with special chars");
    });
  });
});
