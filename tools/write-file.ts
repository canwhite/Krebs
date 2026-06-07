import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * 写入文件工具
 *
 * 将内容写入到 output/ 目录下的文件，支持创建新文件或覆盖现有文件
 * 所有写入操作都被约束到 output/ 文件夹，确保项目文件安全
 */
export const writeFileTool: ToolDefinition = {
  name: "write_file",
  label: "Write File",
  description: "将内容写入到 output/ 目录下的文件。可以创建新文件或覆盖现有文件。",
  parameters: Type.Object({
      path: Type.String({ description: "文件路径（例如: resume.txt, subfolder/file.txt, output/file.txt 均可）" }),
    content: Type.String({ description: "要写入的文件内容" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    const { path, content } = params as { path: string; content: string };

    try {
      const fs = await import("node:fs");
      const pathModule = await import("node:path");

      // 安全检查：确保路径不包含 .. 或绝对路径
      if (path.includes("..") || pathModule.isAbsolute(path)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: "路径不安全：不允许使用 .. 或绝对路径。请提供相对于 output/ 目录的路径。",
                  path,
                },
                null,
                2,
              ),
            },
          ],
          details: {},
        };
      }

      // 兼容处理：如果用户传入了 output/ 前缀，则去除
      let normalizedPath = path;
      if (path.startsWith("output/")) {
        normalizedPath = path.slice(7);
      }

      // 所有文件都写入到 output/ 目录
      const outputDir = pathModule.resolve(process.cwd(), "output");
      const resolvedPath = pathModule.resolve(outputDir, normalizedPath);

      // 验证解析后的路径仍然在 output/ 目录内
      if (!resolvedPath.startsWith(outputDir)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: "安全限制：文件只能写入到 output/ 目录内",
                  path,
                },
                null,
                2,
              ),
            },
          ],
          details: {},
        };
      }

      // 确保目录存在
      const dir = pathModule.dirname(resolvedPath);
      await fs.promises.mkdir(dir, { recursive: true });

      // 写入文件
      await fs.promises.writeFile(resolvedPath, content, "utf-8");

      // 计算相对路径用于显示
      const relativePath = pathModule.relative(process.cwd(), resolvedPath);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                message: `文件已成功写入: ${relativePath}`,
                path: relativePath,
                fullPath: resolvedPath,
                bytes: Buffer.byteLength(content, "utf-8"),
              },
              null,
              2,
            ),
          },
        ],
        details: {},
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
                path,
              },
              null,
              2,
            ),
          },
        ],
        details: {},
      };
    }
  },
};
