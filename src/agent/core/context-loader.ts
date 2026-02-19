/**
 * 上下文文件加载器
 *
 * 职责：
 * - 加载项目中的上下文文件（SOUL.md, AGENTS.md, TOOLS.md）
 * - 提供 ContextFile 格式的数据
 */

import fs from "node:fs";
import path from "node:path";
import type { ContextFile } from "./system-prompt.js";

/**
 * 默认上下文文件列表
 */
const DEFAULT_CONTEXT_FILES = [
  "SOUL.md",
  "AGENTS.md",
  "TOOLS.md",
  "README.md",
];

/**
 * 加载上下文文件
 *
 * @param workspaceDir - 工作区目录
 * @param files - 要加载的文件列表（可选，默认使用 DEFAULT_CONTEXT_FILES）
 * @returns 上下文文件数组
 */
export function loadContextFiles(
  workspaceDir: string,
  files?: string[]
): ContextFile[] {
  const contextFiles: ContextFile[] = [];
  const fileList = files || DEFAULT_CONTEXT_FILES;

  for (const fileName of fileList) {
    const filePath = path.join(workspaceDir, fileName);

    try {
      // 检查文件是否存在
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) continue;

      // 读取文件内容
      const content = fs.readFileSync(filePath, "utf-8");

      // 添加到上下文文件列表
      contextFiles.push({
        path: fileName,
        content: content.trim(),
      });
    } catch (error) {
      // 文件不存在或无法读取，跳过
      continue;
    }
  }

  return contextFiles;
}

/**
 * 加载单个上下文文件
 *
 * @param workspaceDir - 工作区目录
 * @param fileName - 文件名
 * @returns 上下文文件，如果不存在返回 null
 */
export function loadSingleContextFile(
  workspaceDir: string,
  fileName: string
): ContextFile | null {
  const filePath = path.join(workspaceDir, fileName);

  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;

    const content = fs.readFileSync(filePath, "utf-8");

    return {
      path: fileName,
      content: content.trim(),
    };
  } catch (error) {
    return null;
  }
}

/**
 * 获取可用的上下文文件列表
 *
 * @param workspaceDir - 工作区目录
 * @returns 存在的文件名列表
 */
export function getAvailableContextFiles(
  workspaceDir: string
): string[] {
  const available: string[] = [];

  for (const fileName of DEFAULT_CONTEXT_FILES) {
    const filePath = path.join(workspaceDir, fileName);
    try {
      fs.statSync(filePath);
      available.push(fileName);
    } catch {
      // 文件不存在
    }
  }

  return available;
}
