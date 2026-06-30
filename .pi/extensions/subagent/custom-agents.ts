/**
 * Custom Agents
 * 从 .pi/agents/*.md 加载自定义 agent 定义
 */

import { readFile, readdir } from "fs/promises";
import { join } from "path";
import type { AgentDefinition } from "./types.js";

const AGENTS_DIR = ".pi/agents";
const MAX_FILE_SIZE = 64 * 1024; // 64KB max per agent file

interface YamlFrontmatter {
  name?: string;
  description?: string;
  displayName?: string;
  tools?: string[];
  model?: string;
  thinking?: string;
  maxTurns?: number;
  systemPrompt?: string;
}

/**
 * Load all custom agents from .pi/agents/*.md
 */
export async function loadCustomAgents(cwd: string): Promise<AgentDefinition[]> {
  const agentsDir = join(cwd, AGENTS_DIR);
  const agents: AgentDefinition[] = [];

  try {
    const files = await readdir(agentsDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    for (const file of mdFiles) {
      try {
        const agent = await loadAgentFile(join(agentsDir, file));
        if (agent) {
          agents.push(agent);
        }
      } catch (err) {
        console.warn(`[CustomAgents] Failed to load ${file}:`, err);
      }
    }
  } catch (err) {
    // Agents dir doesn't exist - that's fine
  }

  return agents;
}

/**
 * Load a single agent file
 */
async function loadAgentFile(filePath: string): Promise<AgentDefinition | null> {
  const content = await safeReadFile(filePath);
  if (!content) return null;

  const frontmatter = parseYamlFrontmatter(content);
  if (!frontmatter || !frontmatter.name || !frontmatter.systemPrompt) {
    return null;
  }

  // Extract markdown body as description if not provided
  const body = extractBody(content);
  const description = frontmatter.description ?? body.slice(0, 200) ?? "";

  return {
    name: frontmatter.name,
    description,
    displayName: frontmatter.displayName,
    tools: frontmatter.tools ?? ["read", "bash", "edit"],
    model: frontmatter.model,
    thinking: frontmatter.thinking,
    maxTurns: frontmatter.maxTurns,
    systemPrompt: frontmatter.systemPrompt,
  };
}

/**
 * Parse YAML frontmatter from markdown
 */
function parseYamlFrontmatter(content: string): YamlFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match || !match[1]) return null;

  const yaml = match[1];
  const result: YamlFrontmatter = {};

  for (const line of yaml.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    switch (key) {
      case "name":
        result.name = value;
        break;
      case "description":
        result.description = value;
        break;
      case "displayName":
      case "display_name":
        result.displayName = value;
        break;
      case "tools":
        result.tools = value ? value.split(",").map((t) => t.trim()) : [];
        break;
      case "model":
        result.model = value;
        break;
      case "thinking":
        result.thinking = value;
        break;
      case "maxTurns":
      case "max_turns":
        result.maxTurns = parseInt(value, 10) || undefined;
        break;
      case "systemPrompt":
      case "system_prompt":
      case "system":
        result.systemPrompt = value;
        break;
    }
  }

  return result;
}

/**
 * Extract body content after frontmatter
 */
function extractBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? content.slice(match[0].length).trim() : content;
}

/**
 * Safe file read with size limit
 */
async function safeReadFile(path: string): Promise<string | null> {
  const { open } = await import("fs/promises");

  let fd: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fd = await open(path, "r");
    const fileStat = await fd.stat();

    if (fileStat.size > MAX_FILE_SIZE) {
      console.warn(`[CustomAgents] File too large: ${path}`);
      return null;
    }

    const buffer = Buffer.alloc(fileStat.size);
    await fd.read(buffer, 0, fileStat.size, 0);
    return buffer.toString("utf-8");
  } catch {
    return null;
  } finally {
    if (fd) await fd.close();
  }
}

/**
 * Get agent by name
 */
export async function getAgentByName(
  cwd: string,
  name: string
): Promise<AgentDefinition | null> {
  const agents = await loadCustomAgents(cwd);
  return agents.find((a) => a.name === name) ?? null;
}

/**
 * Validate agent definition
 */
export function validateAgentDefinition(agent: Partial<AgentDefinition>): string[] {
  const errors: string[] = [];

  if (!agent.name) {
    errors.push("name is required");
  } else if (!/^[a-zA-Z0-9_-]+$/.test(agent.name)) {
    errors.push("name must contain only alphanumeric, underscore, and hyphen");
  }

  if (!agent.systemPrompt) {
    errors.push("systemPrompt is required");
  }

  if (agent.tools && !Array.isArray(agent.tools)) {
    errors.push("tools must be an array");
  }

  if (agent.maxTurns !== undefined && (typeof agent.maxTurns !== "number" || agent.maxTurns < 1)) {
    errors.push("maxTurns must be a positive number");
  }

  return errors;
}
