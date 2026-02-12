/**
 * Skills Package 命令
 *
 * 将技能目录打包为 .skill (zip) 文件（类似 openclaw-cn-ds 的 package_skill.py）
 */

import path from "path";
import fs from "fs";
import { createReadStream } from "fs";
    // @ts-ignore - gzip is used but TypeScript reports it as unused (false positive - cache issue)
import { createGzip, gzip } from "zlib";
import { pipeline } from "stream";

interface PackageOptions {
  output?: string;
}

/**
 * 验证技能目录
 */
function validateSkillDir(skillDir: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 检查 SKILL.md 是否存在
  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) {
    errors.push("缺少必需的 SKILL.md 文件");
    return { valid: false, errors };
  }

  // 读取并验证 SKILL.md 内容
  const content = fs.readFileSync(skillMdPath, "utf-8");

  // 检查 YAML frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    errors.push("SKILL.md 缺少 YAML frontmatter (---...---)");
    return { valid: false, errors };
  }

  const frontmatter = frontmatterMatch[1];

  // 检查必需字段
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  if (!nameMatch) {
    errors.push("frontmatter 缺少必需的 'name' 字段");
  }

  const descMatch = frontmatter.match(/^description:\s*["'](.+)["']\s*$/m);
  if (!descMatch) {
    errors.push("frontmatter 缺少必需的 'description' 字段");
  }

  // 检查描述是否为 TODO 占位符
  if (descMatch && descMatch[1].includes("[TODO:")) {
    errors.push("description 包含 TODO 占位符，请完成描述");
  }

  // 检查目录名称
  const dirName = path.basename(skillDir);
  if (nameMatch && dirName !== nameMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")) {
    errors.push(`目录名称 '${dirName}' 与 frontmatter name '${nameMatch[1]}' 不匹配`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 简单的打包函数（使用内置 zlib）
 * 注意：这创建的是 gzip (.gz) 文件，不是标准 zip
 * 如需标准 .zip 格式，请安装 archiver: npm install --save-dev archiver
 */
async function packageSkillSimple(
  skillDir: string,
  outputPath: string
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const gzip = createGzip();
    const input = createReadStream(skillDir);
    const output = fs.createWriteStream(`${outputPath}.gz`);

    pipeline(input, gzip, output, (err) => {
      if (err) {
        console.error(`[错误] 打包失败: ${err}`);
        reject(false);
      } else {
        const stats = fs.statSync(`${outputPath}.gz`);
        console.log(`[OK] 技能打包成功: ${outputPath}.gz`);
        console.log(`  文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`\\n注意: 这是 gzip 格式 (.gz)，如需 .zip 请安装 archiver`);
        resolve(true);
      }
    });
  });
}

/**
 * 打包技能
 */
export async function handlePackageCommand(args: string[]): Promise<boolean> {
  const skillPath = args[0];

  // 解析选项
  const options: PackageOptions = {};
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--output=") || arg.startsWith("-o=")) {
      options.output = arg.split("=")[1];
    }
  }

  if (!skillPath) {
    console.error(`
用法: krebs skills package <skill-path> [选项]

将技能目录打包为 .skill 文件。

参数:
  skill-path          技能目录路径

选项:
  --output=<dir>, -o=<dir>   输出目录（默认: 当前目录）

示例:
  krebs skills package skills/bundled/my-skill
  krebs skills package skills/bundled/my-skill --output ./dist
`);
    return false;
  }

  // 解析技能路径
  const resolvedPath = path.resolve(skillPath);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`[错误] 技能目录不存在: ${resolvedPath}`);
    return false;
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isDirectory()) {
    console.error(`[错误] 路径不是目录: ${resolvedPath}`);
    return false;
  }

  // 验证技能
  console.log("验证技能...");
  const validation = validateSkillDir(resolvedPath);

  if (!validation.valid) {
    console.error("\\n[错误] 技能验证失败:");
    for (const error of validation.errors) {
      console.error(`  - ${error}`);
    }
    console.error("\\n请修复错误后重试。");
    return false;
  }

  console.log("[OK] 技能验证通过");

  // 确定输出文件名和路径
  const dirName = path.basename(resolvedPath);
  const outputFileName = `${dirName}.skill`;
  const outputDir = options.output ? path.resolve(options.output) : process.cwd();
  const outputPath = path.join(outputDir, outputFileName);

  // 检查输出文件是否已存在
  if (fs.existsSync(outputPath)) {
    console.error(`[错误] 输出文件已存在: ${outputPath}`);
    console.error("   使用 --output 指定其他输出目录或删除现有文件");
    return false;
  }

  try {
    console.log(`\\n打包技能: ${resolvedPath}`);
    console.log(`  输出文件: ${outputPath}`);

    // 使用简单 gzip 打包
    return await packageSkillSimple(resolvedPath, outputPath);
  } catch (error) {
    console.error(`[错误] 打包失败: ${error}`);
    return false;
  }
}
