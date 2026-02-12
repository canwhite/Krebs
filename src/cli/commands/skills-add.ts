/**
 * Skills Add 命令
 *
 * 添加技能到本地技能目录（Managed/Workspace）
 * 支持从本地目录、.skill.gz 文件或 URL 添加
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import { createDefaultSkillsManager } from "@/agent/skills/index.js";
import { logger } from "@/shared/logger.js";

const execAsync = promisify(exec);

interface AddOptions {
  target?: string; // 目标目录（managed 或 workspace）
  install?: boolean; // 是否自动安装依赖
  force?: boolean; // 是否覆盖已存在的技能
}

/**
 * 解压 .skill.gz 文件到目标目录
 */
async function extractSkillGz(
  gzPath: string,
  targetDir: string
): Promise<boolean> {
  try {
    await fs.mkdir(targetDir, { recursive: true });

    const outputPath = path.join(targetDir, "SKILL.md");

    // 使用 gunzip 解压
    const gunzip = createGzip();
    const input = createReadStream(gzPath);
    const output = await fs.open(outputPath, "w");

    await pipeline(input, gunzip, output.createWriteStream());
    await output.close();

    logger.info(`Extracted ${gzPath} to ${targetDir}`);
    return true;
  } catch (error) {
    logger.error(`Failed to extract ${gzPath}:`, error);
    return false;
  }
}

/**
 * 使用 tar 解压 .tar.gz 或 .tgz 文件
 */
async function extractTarGz(
  archivePath: string,
  targetDir: string
): Promise<boolean> {
  try {
    await fs.mkdir(targetDir, { recursive: true });

    const { stderr } = await execAsync(
      `tar -xzf "${archivePath}" -C "${targetDir}"`
    );

    if (stderr && !stderr.includes("Removing leading")) {
      logger.warn(`Tar extraction warning: ${stderr}`);
    }

    logger.info(`Extracted ${archivePath} to ${targetDir}`);
    return true;
  } catch (error) {
    logger.error(`Failed to extract ${archivePath}:`, error);
    return false;
  }
}

/**
 * 复制技能目录到目标位置
 */
async function copySkillDir(
  sourceDir: string,
  targetDir: string
): Promise<boolean> {
  try {
    // 确保目标父目录存在
    await fs.mkdir(path.dirname(targetDir), { recursive: true });

    // 递归复制目录
    await fs.cp(sourceDir, targetDir, { recursive: true });
    logger.info(`Copied ${sourceDir} to ${targetDir}`);
    return true;
  } catch (error) {
    logger.error(`Failed to copy ${sourceDir}:`, error);
    return false;
  }
}

/**
 * 验证技能目录
 */
async function validateSkillDir(skillDir: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    const skillMdPath = path.join(skillDir, "SKILL.md");
    await fs.access(skillMdPath);

    // 读取并解析 frontmatter
    const content = await fs.readFile(skillMdPath, "utf-8");
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      errors.push("Missing YAML frontmatter");
    } else {
      const frontmatter = frontmatterMatch[1];

      if (!frontmatter.includes("name:")) {
        errors.push("Missing 'name' field in frontmatter");
      }

      if (!frontmatter.includes("description:")) {
        errors.push("Missing 'description' field in frontmatter");
      }
    }
  } catch (error) {
    errors.push(`Validation error: ${error}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 获取技能名称
 */
async function getSkillName(skillDir: string): Promise<string | null> {
  try {
    const skillMdPath = path.join(skillDir, "SKILL.md");
    const content = await fs.readFile(skillMdPath, "utf-8");
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    return nameMatch ? nameMatch[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * 从 URL 下载技能
 */
async function downloadSkill(
  url: string,
  targetDir: string
): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // 确定文件名
    let filename = "skill";
    const contentDisposition = response.headers.get("content-disposition");
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match) filename = match[1];
    } else {
      try {
        const urlPath = new URL(url).pathname;
        filename = path.basename(urlPath) || "skill";
      } catch {
        filename = "skill";
      }
    }

    // 下载到临时文件
    await fs.mkdir(targetDir, { recursive: true });
    const tempPath = path.join(targetDir, filename);

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(tempPath, buffer);

    return { success: true, path: tempPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 添加技能
 */
export async function handleAddCommand(args: string[]): Promise<boolean> {
  if (args.length === 0) {
    console.log(`
用法: krebs skills add <source> [选项]

从本地目录、.skill 文件或 URL 添加技能。

参数:
  source              技能来源（目录路径、.skill.gz 文件或 URL）

选项:
  --target=<dir>      目标目录（managed 或 workspace，默认: managed）
  --install           自动安装依赖
  --force             覆盖已存在的技能

示例:
  # 从本地目录添加
  krebs skills add ./my-skill

  # 从 .skill.gz 文件添加
  krebs skills add ./my-skill.skill.gz

  # 从 URL 下载并添加
  krebs skills add https://example.com/skills/my-skill.skill.gz

  # 添加到 workspace 而非 managed
  krebs skills add ./my-skill --target=workspace

  # 添加并自动安装依赖
  krebs skills add ./my-skill --install
`);
    return false;
  }

  const source = args[0];

  // 解析选项
  const options: AddOptions = {
    target: "managed",
    install: false,
    force: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--target=")) {
      options.target = arg.split("=")[1] as any;
    } else if (arg === "--install") {
      options.install = true;
    } else if (arg === "--force") {
      options.force = true;
    }
  }

  // 验证目标选项
  if (options.target !== "managed" && options.target !== "workspace") {
    logger.error(`Invalid target: ${options.target}`);
    logger.error('Target must be "managed" or "workspace"');
    return false;
  }

  try {
    // 确定目标目录
    const targetBaseDir =
      options.target === "workspace"
        ? path.join(process.cwd(), "workspace", "skills")
        : path.join(process.cwd(), "skills", "managed");

    let tempDir: string | null = null;
    let skillName: string | null = null;

    // 处理不同类型的来源
    if (source.startsWith("http://") || source.startsWith("https://")) {
      // URL 下载
      console.log(`📥 下载技能从: ${source}`);
      const result = await downloadSkill(source, targetBaseDir);

      if (!result.success) {
        logger.error(`下载失败: ${result.error}`);
        return false;
      }

      tempDir = result.path!;

      // 判断是否为归档文件
      if (tempDir.endsWith(".tar.gz") || tempDir.endsWith(".tgz")) {
        const extractDir = path.join(targetBaseDir, "temp_extract");
        const success = await extractTarGz(tempDir, extractDir);

        if (!success) {
          return false;
        }

        // 查找 SKILL.md
        const files = await fs.readdir(extractDir);
        let skillDir: string | undefined;

        for (const f of files) {
          const filePath = path.join(extractDir, f);
          const stat = await fs.stat(filePath);
          if (stat.isDirectory()) {
            skillDir = f;
            break;
          }
        }

        if (skillDir) {
          tempDir = path.join(extractDir, skillDir);
        } else {
          tempDir = extractDir;
        }
      } else if (tempDir.endsWith(".gz")) {
        // .gz 文件（简单 gzip）
        const extractDir = path.join(targetBaseDir, "temp_extract");
        await fs.mkdir(extractDir, { recursive: true });
        const success = await extractSkillGz(tempDir, extractDir);

        if (!success) {
          return false;
        }

        tempDir = extractDir;
      } else {
        // 单文件，直接当作目录
        tempDir = path.dirname(tempDir);
      }
    } else if (source.endsWith(".skill.gz") || source.endsWith(".tar.gz") || source.endsWith(".tgz")) {
      // 本地归档文件
      const resolvedPath = path.resolve(source);

      if (!(await fs.access(resolvedPath).then(() => true).catch(() => false))) {
        logger.error(`文件不存在: ${resolvedPath}`);
        return false;
      }

      console.log(`📦 解压技能: ${resolvedPath}`);

      const extractDir = path.join(targetBaseDir, "temp_extract");
      const success = await extractTarGz(resolvedPath, extractDir);

      if (!success) {
        return false;
      }

      // 查找技能目录
      const files = await fs.readdir(extractDir);
      let skillDir: string | undefined;

      for (const f of files) {
        const filePath = path.join(extractDir, f);
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          skillDir = f;
          break;
        }
      }

      tempDir = skillDir ? path.join(extractDir, skillDir) : extractDir;
    } else {
      // 本地目录
      const resolvedPath = path.resolve(source);

      if (!(await fs.stat(resolvedPath).then((s) => s.isDirectory()).catch(() => false))) {
        logger.error(`目录不存在: ${resolvedPath}`);
        return false;
      }

      console.log(`📂 添加技能从目录: ${resolvedPath}`);
      tempDir = resolvedPath;
    }

    // 获取技能名称
    skillName = await getSkillName(tempDir);
    if (!skillName) {
      logger.error("无法确定技能名称（缺少 SKILL.md 或 name 字段）");
      return false;
    }

    console.log(`✓ 技能名称: ${skillName}`);

    // 确定最终目标路径
    const finalTargetDir = path.join(targetBaseDir, skillName);

    // 检查是否已存在
    const exists = await fs
      .access(finalTargetDir)
      .then(() => true)
      .catch(() => false);

    if (exists && !options.force) {
      logger.error(`技能已存在: ${finalTargetDir}`);
      logger.error('使用 --force 覆盖或手动删除现有技能');
      return false;
    }

    // 删除现有目录（如果 --force）
    if (exists && options.force) {
      console.log(`🗑️  删除现有技能目录...`);
      await fs.rm(finalTargetDir, { recursive: true, force: true });
    }

    // 复制/移动技能到目标位置
    console.log(`📋 安装技能到: ${finalTargetDir}`);

    // 如果 tempDir 在 targetBaseDir 内（刚解压的），移动；否则复制
    const isInTargetBase = tempDir.startsWith(targetBaseDir);

    if (isInTargetBase) {
      await fs.rename(tempDir, finalTargetDir);
    } else {
      await copySkillDir(tempDir, finalTargetDir);
    }

    // 清理临时目录
    const tempExtractDir = path.join(targetBaseDir, "temp_extract");
    await fs.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});

    // 验证技能
    console.log(`🔍 验证技能...`);
    const validation = await validateSkillDir(finalTargetDir);

    if (!validation.valid) {
      logger.error("技能验证失败:");
      for (const error of validation.errors) {
        console.log(`  - ${error}`);
      }
      return false;
    }

    console.log(`✅ 技能 '${skillName}' 添加成功！`);

    // 自动安装依赖
    if (options.install) {
      console.log(`\n📦 安装依赖...`);
      const skillsManager = createDefaultSkillsManager();
      await skillsManager.loadSkills();

      try {
        const results = await skillsManager.installSkillDeps(skillName);
        console.log(`\n📦 ${skillName}:`);

        for (const result of results) {
          if (result.ok) {
            console.log(`  ✅ ${result.installId}: ${result.message}`);
          } else {
            console.log(`  ❌ ${result.installId}: ${result.message}`);
          }
        }

        await skillsManager.cleanup();
      } catch (error) {
        logger.error("依赖安装失败:", error);
        await skillsManager.cleanup();
      }
    } else {
      console.log(`\n下一步:`);
      console.log(`1. 查看技能: krebs skills status ${skillName}`);
      console.log(`2. 安装依赖: krebs skills install ${skillName}`);
      console.log(`3. 或添加时自动安装: krebs skills add <source> --install`);
    }

    return true;
  } catch (error) {
    logger.error("添加技能失败:", error);
    return false;
  }
}
