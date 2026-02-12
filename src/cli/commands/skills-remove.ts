/**
 * Skills Remove 命令
 *
 * 从 Managed/Workspace 移除技能
 */

import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

import { createDefaultSkillsManager } from "@/agent/skills/index.js";
import { logger } from "@/shared/logger.js";

interface RemoveOptions {
  target?: string; // 目标目录（managed 或 workspace）
  force?: boolean; // 跳过确认
}

/**
 * 查找技能在哪个目录
 */
async function findSkillLocation(
  skillName: string
): Promise<{ found: boolean; path?: string; target?: string }> {
  // 检查顺序：managed > workspace
  const targets = [
    { name: "managed", dir: path.join(process.cwd(), "skills", "managed") },
    { name: "workspace", dir: path.join(process.cwd(), "workspace", "skills") },
  ];

  for (const target of targets) {
    const skillPath = path.join(target.dir, skillName);
    if (existsSync(skillPath)) {
      const stat = await fs.stat(skillPath);
      if (stat.isDirectory()) {
        return { found: true, path: skillPath, target: target.name };
      }
    }
  }

  return { found: false };
}

/**
 * 移除技能
 */
export async function handleRemoveCommand(args: string[]): Promise<boolean> {
  if (args.length === 0) {
    console.log(`
用法: krebs skills remove <skill-name> [选项]

从本地技能目录移除技能。

参数:
  skill-name         技能名称

选项:
  --target=<dir>     目标目录（managed 或 workspace，默认: 自动检测）
  --force            跳过确认提示

示例:
  # 移除技能（自动检测位置）
  krebs skills remove my-skill

  # 从特定目录移除
  krebs skills remove my-skill --target=managed

  # 跳过确认
  krebs skills remove my-skill --force

注意:
  - 只能从 managed 或 workspace 目录移除技能
  - 不能移除 bundled（内置）技能
`);
    return false;
  }

  const skillName = args[0];

  // 解析选项
  const options: RemoveOptions = {
    target: undefined,
    force: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--target=")) {
      options.target = arg.split("=")[1];
    } else if (arg === "--force") {
      options.force = true;
    }
  }

  try {
    let targetDir: string;
    let targetName: string;
    let skillPath: string;

    // 如果指定了目标
    if (options.target) {
      if (options.target !== "managed" && options.target !== "workspace") {
        logger.error(`Invalid target: ${options.target}`);
        logger.error('Target must be "managed" or "workspace"');
        return false;
      }

      targetName = options.target;
      targetDir =
        options.target === "workspace"
          ? path.join(process.cwd(), "workspace", "skills")
          : path.join(process.cwd(), "skills", "managed");

      skillPath = path.join(targetDir, skillName);

      if (!existsSync(skillPath)) {
        logger.error(`技能不存在: ${skillPath}`);
        return false;
      }
    } else {
      // 自动查找技能位置
      const location = await findSkillLocation(skillName);

      if (!location.found) {
        logger.error(`未找到技能: ${skillName}`);
        logger.error("提示:");
        logger.error("  1. 使用 'krebs skills list' 查看所有技能");
        logger.error("  2. 确认技能名称正确");
        logger.error("  3. 只能从 managed 或 workspace 目录移除技能");
        logger.error("     （不能移除 bundled 内置技能）");
        return false;
      }

      skillPath = location.path!;
      targetName = location.target!;
      targetDir = path.dirname(skillPath);
    }

    // 显示技能信息
    const skillsManager = createDefaultSkillsManager();
    await skillsManager.loadSkills();

    const skill = skillsManager.getSkillByName(skillName);
    await skillsManager.cleanup();

    if (skill) {
      console.log(`\n技能信息:`);
      console.log(`  名称: ${skill.skill.name}`);
      console.log(`  描述: ${skill.frontmatter.description || "无"}`);
      if (skill.metadata?.emoji) {
        console.log(`  图标: ${skill.metadata.emoji}`);
      }
      if (skill.metadata?.category) {
        console.log(`  分类: ${skill.metadata.category}`);
      }
      console.log(`  位置: ${targetName}`);
      console.log(`  路径: ${skillPath}`);
    }

    // 确认
    if (!options.force) {
      console.log(`\n⚠️  警告: 此操作将永久删除技能目录`);
      console.log(`   目录: ${skillPath}`);
      console.log();

      // 使用 readline 获取用户输入
      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(`确认删除? (yes/no): `, (ans) => {
          rl.close();
          resolve(ans.trim().toLowerCase());
        });
      });

      if (answer !== "yes" && answer !== "y") {
        console.log("操作已取消");
        return false;
      }
    }

    // 删除技能
    console.log(`\n🗑️  删除技能: ${skillName}`);
    await fs.rm(skillPath, { recursive: true, force: true });

    console.log(`✅ 技能 '${skillName}' 已删除`);

    // 提示重新加载
    console.log(`\n提示:`);
    console.log(`  如果 krebs 服务正在运行，技能可能仍在内存中`);
    console.log(`  重启服务或触发热加载以应用更改`);

    return true;
  } catch (error) {
    logger.error("移除技能失败:", error);
    return false;
  }
}
