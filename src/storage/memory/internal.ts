/**
 * Memory Storage 内部工具函数
 *
 * 参考：openclaw-cn-ds/src/memory/internal.ts
 */

import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  ChunkConfig,
  MemoryChunk,
  MemoryFileEntry,
} from "./types.js";

/**
 * 计算文本的 SHA256 哈希
 *
 * @param text - 输入文本
 * @returns 十六进制哈希字符串
 */
export function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * 规范化相对路径
 *
 * @param value - 原始路径
 * @returns 规范化后的路径
 */
export function normalizeRelPath(value: string): string {
  const trimmed = value.trim();
  // 移除前导的 /、./ 和 ../，保留 .../ 等
  let result = trimmed.replace(/^\//, "").replace(/^\.\//, "").replace(/^\.\.\//, "");
  // 转换反斜杠为正斜杠
  return result.replace(/\\/g, "/");
}

/**
 * 判断路径是否为记忆文件
 *
 * @param relPath - 相对路径
 * @returns 是否为记忆文件
 */
export function isMemoryPath(relPath: string): boolean {
  const normalized = normalizeRelPath(relPath);
  if (!normalized) return false;
  if (normalized === "MEMORY.md" || normalized === "memory.md") return true;
  return normalized.startsWith("memory/");
}

/**
 * 确保目录存在
 *
 * @param dir - 目录路径
 * @returns 目录路径
 */
export function ensureDir(dir: string): string {
  try {
    fsSync.mkdirSync(dir, { recursive: true });
  } catch {
    // 忽略已存在的错误
  }
  return dir;
}

/**
 * 检查文件/目录是否存在
 *
 * @param filePath - 文件路径
 * @returns 是否存在
 */
async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 递归遍历目录，收集所有 Markdown 文件
 *
 * @param dir - 目录路径
 * @param files - 文件列表（输出参数）
 */
async function walkDir(dir: string, files: string[]) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(full, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".md")) continue;
    files.push(full);
  }
}

/**
 * 列出所有记忆文件
 *
 * 扫描 workspace 目录下的：
 * - MEMORY.md
 * - memory.md
 * - memory/ 目录（递归）
 *
 * @param workspaceDir - workspace 目录路径
 * @returns 绝对路径列表
 */
export async function listMemoryFiles(workspaceDir: string): Promise<string[]> {
  const result: string[] = [];

  // 检查 MEMORY.md 和 memory.md
  const memoryFile = path.join(workspaceDir, "MEMORY.md");
  const altMemoryFile = path.join(workspaceDir, "memory.md");

  const hasMemoryFile = await exists(memoryFile);
  const hasAltMemoryFile = await exists(altMemoryFile);

  if (hasMemoryFile) result.push(memoryFile);

  // 添加 memory.md（如果存在且不同于 MEMORY.md）
  if (hasAltMemoryFile) {
    // 在大小写不敏感的文件系统上，memory.md 和 MEMORY.md 可能指向同一个文件
    // 使用 realpath 检查
    try {
      if (hasMemoryFile) {
        const realMemory = await fs.realpath(memoryFile);
        const realAlt = await fs.realpath(altMemoryFile);
        if (realMemory !== realAlt) {
          result.push(altMemoryFile);
        }
      } else {
        // MEMORY.md 不存在，直接添加 memory.md
        result.push(altMemoryFile);
      }
    } catch {
      // 如果 realpath 失败，添加文件（保险起见）
      result.push(altMemoryFile);
    }
  }

  // 检查 memory/ 目录
  const memoryDir = path.join(workspaceDir, "memory");
  if (await exists(memoryDir)) {
    await walkDir(memoryDir, result);
  }

  // 去重（处理符号链接等情况）
  if (result.length <= 1) return result;

  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const entry of result) {
    let key = entry;
    try {
      key = await fs.realpath(entry);
    } catch {
      // 忽略错误
    }
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

/**
 * 构建文件元信息
 *
 * @param absPath - 文件绝对路径
 * @param workspaceDir - workspace 目录路径
 * @returns 文件元信息
 */
export async function buildFileEntry(
  absPath: string,
  workspaceDir: string,
): Promise<MemoryFileEntry> {
  const stat = await fs.stat(absPath);
  const content = await fs.readFile(absPath, "utf-8");
  const hash = hashText(content);

  return {
    path: path.relative(workspaceDir, absPath).replace(/\\/g, "/"),
    absPath,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    hash,
  };
}

/**
 * 将 Markdown 内容分块
 *
 * 分块策略：
 * - 按行分割，保持语义完整性
 * - 每个 chunk 约 chunkTokens * 4 字符
 * - chunk 之间有 overlap（overlap * 4 字符）
 *
 * @param content - Markdown 内容
 * @param chunking - 分块配置
 * @returns 分块列表
 */
export function chunkMarkdown(
  content: string,
  chunking: ChunkConfig,
): MemoryChunk[] {
  const lines = content.split("\n");
  if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) return [];

  // token 近似为字符数 / 4（英文）
  const maxChars = Math.max(32, chunking.tokens * 4);
  const overlapChars = Math.max(0, chunking.overlap * 4);

  const chunks: MemoryChunk[] = [];

  let current: Array<{ line: string; lineNo: number }> = [];
  let currentChars = 0;

  /**
   * 将当前缓冲区刷新为一个 chunk
   */
  const flush = () => {
    if (current.length === 0) return;

    const firstEntry = current[0];
    const lastEntry = current[current.length - 1];
    if (!firstEntry || !lastEntry) return;

    const text = current.map((entry) => entry.line).join("\n");
    const startLine = firstEntry.lineNo;
    const endLine = lastEntry.lineNo;

    chunks.push({
      startLine,
      endLine,
      text,
      hash: hashText(text),
    });
  };

  /**
   * 保留 overlap 部分的行
   */
  const carryOverlap = () => {
    if (overlapChars <= 0 || current.length === 0) {
      current = [];
      currentChars = 0;
      return;
    }

    let acc = 0;
    const kept: Array<{ line: string; lineNo: number }> = [];

    // 从后向前保留行，直到达到 overlapChars
    for (let i = current.length - 1; i >= 0; i -= 1) {
      const entry = current[i];
      if (!entry) continue;

      acc += entry.line.length + 1; // +1 for newline
      kept.unshift(entry);

      if (acc >= overlapChars) break;
    }

    current = kept;
    currentChars = acc;
  };

  // 逐行添加到缓冲区
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineLen = line.length + 1; // +1 for newline

    // 如果单行超过 maxChars，直接作为一个 chunk
    if (lineLen > maxChars && current.length === 0) {
      chunks.push({
        startLine: i + 1,
        endLine: i + 1,
        text: line,
        hash: hashText(line),
      });
      continue;
    }

    // 如果添加该行会超出限制，先刷新当前 chunk
    if (currentChars + lineLen > maxChars && current.length > 0) {
      flush();
      carryOverlap();
    }

    current.push({ line, lineNo: i + 1 });
    currentChars += lineLen;
  }

  // 刷新剩余内容
  flush();

  return chunks;
}
