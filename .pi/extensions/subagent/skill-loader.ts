/**
 * Skill Loader
 * 优化 skill 加载，避免 BFS 遍历
 */

import { readFile, readdir, stat } from "fs/promises";
import { join, extname, basename } from "path";

const SKILL_EXTENSIONS = [".ts", ".js", ".md"];
const MAX_DEPTH = 3;
const MAX_FILE_SIZE = 64 * 1024; // 64KB per skill file

export interface SkillDefinition {
  name: string;
  description: string;
  path: string;
  type: "command" | "context";
}

interface SkillCache {
  skills: SkillDefinition[];
  timestamp: number;
}

const cache = new Map<string, SkillCache>();
const CACHE_TTL = 60_000; // 1 minute

/**
 * Load skills from a directory
 * Optimized to avoid BFS by using direct file scanning
 */
export async function loadSkills(
  agentDir: string,
  cwd: string,
  force?: boolean
): Promise<SkillDefinition[]> {
  const cacheKey = `${agentDir}:${cwd}`;

  // Check cache
  if (!force) {
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.skills;
    }
  }

  const skills: SkillDefinition[] = [];
  const skillDirs = getSkillDirs(agentDir);

  // Scan each skill directory
  for (const dir of skillDirs) {
    try {
      const dirSkills = await scanSkillDir(dir, cwd, 0);
      skills.push(...dirSkills);
    } catch {
      // Skip dirs that don't exist or can't be read
    }
  }

  // Cache result
  cache.set(cacheKey, {
    skills,
    timestamp: Date.now(),
  });

  return skills;
}

/**
 * Get skill directories to scan
 */
function getSkillDirs(agentDir: string): string[] {
  return [
    join(agentDir, "skills"),
    join(agentDir, "extensions", "skills"),
  ];
}

/**
 * Recursively scan a skill directory
 */
async function scanSkillDir(
  dir: string,
  cwd: string,
  depth: number
): Promise<SkillDefinition[]> {
  if (depth > MAX_DEPTH) return [];

  const skills: SkillDefinition[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      const subSkills = await scanSkillDir(fullPath, cwd, depth + 1);
      skills.push(...subSkills);
    } else if (entry.isFile()) {
      const skill = await parseSkillFile(fullPath, cwd);
      if (skill) {
        skills.push(skill);
      }
    }
  }

  return skills;
}

/**
 * Parse a skill file
 */
async function parseSkillFile(
  filePath: string,
  cwd: string
): Promise<SkillDefinition | null> {
  const ext = extname(filePath).toLowerCase();

  if (!SKILL_EXTENSIONS.includes(ext)) {
    return null;
  }

  // Check file size
  try {
    const fileStat = await stat(filePath);
    if (fileStat.size > MAX_FILE_SIZE) {
      return null;
    }
  } catch {
    return null;
  }

  const name = basename(filePath, ext);

  if (ext === ".md") {
    // Markdown skill - extract description from first line
    try {
      const content = await safeReadFile(filePath);
      if (!content) return null;

      const lines = content.split("\n");
      const firstLine = lines[0]?.trim() ?? "";
      const description = firstLine.replace(/^#\s*/, "").slice(0, 100);

      return {
        name,
        description: description || `Skill: ${name}`,
        path: filePath,
        type: "context",
      };
    } catch {
      return null;
    }
  }

  // TypeScript/JavaScript skill
  return {
    name,
    description: `Skill: ${name}`,
    path: filePath,
    type: "command",
  };
}

/**
 * Safe file read
 */
async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Get skill by name
 */
export async function getSkillByName(
  agentDir: string,
  cwd: string,
  name: string
): Promise<SkillDefinition | null> {
  const skills = await loadSkills(agentDir, cwd);
  return skills.find((s) => s.name === name) ?? null;
}

/**
 * Search skills by name/description
 */
export async function searchSkills(
  agentDir: string,
  cwd: string,
  query: string
): Promise<SkillDefinition[]> {
  const skills = await loadSkills(agentDir, cwd);
  const lower = query.toLowerCase();

  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower)
  );
}

/**
 * Clear skill cache
 */
export function clearSkillCache(): void {
  cache.clear();
}

/**
 * Clear cache for specific agent dir
 */
export function clearSkillCacheForDir(agentDir: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(agentDir)) {
      cache.delete(key);
    }
  }
}
