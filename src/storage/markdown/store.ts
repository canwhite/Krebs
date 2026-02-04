/**
 * Markdown 文件存储
 * 参考 krebs-ds 的会话存储设计
 */

import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface MarkdownMetadata {
  title?: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  [key: string]: unknown;
}

export interface MarkdownDocument {
  path: string;
  content: string;
  metadata: MarkdownMetadata;
}

export interface MarkdownFile {
  path: string;
  content: string;
  metadata: MarkdownMetadata;
}

/**
 * Markdown 存储管理器
 */
export class MarkdownStore {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dir: string): Promise<void> {
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * 解析 Markdown 文件（包含 frontmatter）
   */
  private parseMarkdown(content: string): {
    metadata: MarkdownMetadata;
    content: string;
  } {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (match) {
      const metadata = parseYaml(match[1]) as MarkdownMetadata;
      const body = match[2];
      return { metadata, content: body };
    }

    return {
      metadata: { createdAt: Date.now(), updatedAt: Date.now() },
      content,
    };
  }

  /**
   * 序列化为 Markdown 文件（包含 frontmatter）
   */
  private serializeMarkdown(
    metadata: MarkdownMetadata,
    content: string,
  ): string {
    return `---\n${stringifyYaml(metadata).trim()}\n---\n${content}`;
  }

  /**
   * 读取文件
   */
  async read(relPath: string): Promise<MarkdownFile> {
    const fullPath = path.join(this.baseDir, relPath);
    const content = await fs.readFile(fullPath, "utf-8");
    const { metadata, content: body } = this.parseMarkdown(content);

    return {
      path: relPath,
      content: body,
      metadata,
    };
  }

  /**
   * 写入文件
   */
  async write(
    relPath: string,
    content: string,
    metadata?: Partial<MarkdownMetadata>,
  ): Promise<void> {
    const fullPath = path.join(this.baseDir, relPath);
    const dir = path.dirname(fullPath);
    await this.ensureDir(dir);

    const existing = existsSync(fullPath);
    let existingMetadata: MarkdownMetadata = {
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (existing) {
      try {
        const existingContent = await fs.readFile(fullPath, "utf-8");
        const parsed = this.parseMarkdown(existingContent);
        existingMetadata = parsed.metadata;
      } catch {
        // 忽略解析错误，使用默认 metadata
      }
    }

    const newMetadata: MarkdownMetadata = {
      ...existingMetadata,
      ...metadata,
      updatedAt: Date.now(),
      createdAt: existing ? existingMetadata.createdAt : Date.now(),
    };

    const markdown = this.serializeMarkdown(newMetadata, content);
    await fs.writeFile(fullPath, markdown, "utf-8");
  }

  /**
   * 删除文件
   */
  async delete(relPath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, relPath);
    if (existsSync(fullPath)) {
      await fs.unlink(fullPath);
    }
  }

  /**
   * 列出目录下的文件
   */
  async list(dir: string = ""): Promise<string[]> {
    const fullPath = path.join(this.baseDir, dir);
    if (!existsSync(fullPath)) {
      return [];
    }

    const entries = await fs.readdir(fullPath, { recursive: true });
    return entries
      .filter((e) => e.endsWith(".md"))
      .map((e) => path.join(dir, e));
  }

  /**
   * 搜索文件（基于路径模式）
   */
  async search(pattern: string): Promise<string[]> {
    const allFiles = await this.list("");
    const regex = new RegExp(pattern, "i");
    return allFiles.filter((f) => regex.test(f));
  }

  /**
   * 检查文件是否存在
   */
  exists(relPath: string): boolean {
    const fullPath = path.join(this.baseDir, relPath);
    return existsSync(fullPath);
  }

  /**
   * 获取文件统计信息
   */
  async stats(relPath: string): Promise<{
    size: number;
    created: number;
    modified: number;
  } | null> {
    const fullPath = path.join(this.baseDir, relPath);
    if (!existsSync(fullPath)) {
      return null;
    }

    const stats = await fs.stat(fullPath);
    return {
      size: stats.size,
      created: stats.birthtimeMs,
      modified: stats.mtimeMs,
    };
  }
}

/**
 * 会话存储（继承自 MarkdownStore）
 */
export class SessionStore extends MarkdownStore {
  constructor(baseDir: string) {
    super(path.join(baseDir, "sessions"));
  }

  /**
   * 保存会话
   */
  async saveSession(
    sessionId: string,
    messages: Array<{ role: string; content: string }>,
    metadata?: Partial<MarkdownMetadata>,
  ): Promise<void> {
    const content = messages
      .map((m) => `## ${m.role}\n\n${m.content}`)
      .join("\n\n");

    await this.write(`${sessionId}.md`, content, {
      ...metadata,
      title: sessionId,
    });
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<{
    messages: Array<{ role: string; content: string }>;
    metadata: MarkdownMetadata;
  } | null> {
    if (!this.exists(`${sessionId}.md`)) {
      return null;
    }

    const file = await this.read(`${sessionId}.md`);
    const messages: Array<{ role: string; content: string }> = [];

    const roleRegex = /## (\w+)\n\n([\s\S]*?)(?=\n## |\n*$)/g;
    let match;
    while ((match = roleRegex.exec(file.content)) !== null) {
      messages.push({
        role: match[1],
        content: match[2].trim(),
      });
    }

    return {
      messages,
      metadata: file.metadata,
    };
  }

  /**
   * 列出所有会话
   */
  async listSessions(): Promise<
    Array<{ sessionId: string; metadata: MarkdownMetadata }>
  > {
    const files = await this.list();
    const sessions = [];

    for (const file of files) {
      const sessionId = path.basename(file, ".md");
      const metadata = (await this.read(file)).metadata;
      sessions.push({ sessionId, metadata });
    }

    return sessions.sort((a, b) => b.metadata.updatedAt - a.metadata.updatedAt);
  }
}
