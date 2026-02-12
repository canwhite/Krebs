/**
 * Skills CLI 命令处理
 */

import { createDefaultSkillsManager } from "@/agent/skills/index.js";
import { logger } from "@/shared/logger.js";
import { handleAddCommand } from "./skills-add.js";
import { handleRemoveCommand } from "./skills-remove.js";

/**
 * 处理 skills 命令
 */
export async function handleSkillsCommand(args: string[]): Promise<boolean> {
  const [subCommand, ...subArgs] = args;

  switch (subCommand) {
    case "add":
      return await handleAddCommand(subArgs);

    case "remove":
      return await handleRemoveCommand(subArgs);

    case "install":
      return await handleInstallCommand(subArgs);

    case "list":
      return await handleListCommand(subArgs);

    case "status":
      return await handleStatusCommand(subArgs);

    case "create":
      // create 命令需要特殊处理（不是通过 skills.ts 路由）
      const { handleCreateCommand } = await import("./skills-create.js");
      return await handleCreateCommand(subArgs);

    case "package":
      // package 命令需要特殊处理
      const { handlePackageCommand } = await import("./skills-package.js");
      return await handlePackageCommand(subArgs);

    default:
      logger.error(`未知命令: skills ${subCommand}`);
      printSkillsHelp();
      return false;
  }
}

/**
 * 处理 install 命令
 */
async function handleInstallCommand(args: string[]): Promise<boolean> {
  const skillName = args[0];
  const options = parseOptions(args);

  try {
    const skillsManager = createDefaultSkillsManager();
    await skillsManager.loadSkills();

    // --all 标志：安装所有技能的依赖
    if (options.all) {
      logger.info("安装所有技能的依赖...");
      const results = await skillsManager.installAllSkillDeps({
        dryRun: options.dryRun,
      });

      let successCount = 0;
      let failCount = 0;

      for (const [skillName, skillResults] of results.entries()) {
        console.log(`\n📦 ${skillName}:`);
        for (const result of skillResults) {
          if (result.ok) {
            console.log(`  ✅ ${result.installId}: ${result.message}`);
            successCount++;
          } else {
            console.log(`  ❌ ${result.installId}: ${result.message}`);
            failCount++;
          }
        }
      }

      console.log(`\n总计: ${successCount} 成功, ${failCount} 失败`);

      await skillsManager.cleanup();
      return failCount === 0;
    }

    // 安装单个技能
    if (!skillName) {
      logger.error("请指定技能名称或使用 --all");
      printInstallHelp();
      return false;
    }

    if (options.check) {
      // 仅检查状态
      const status = await skillsManager.getInstallStatus(skillName);
      if (!status) {
        logger.error(`技能未找到: ${skillName}`);
        return false;
      }

      console.log(`📦 ${skillName} 安装状态:`);
      console.log(`   全部已安装: ${status.allInstalled ? "✅" : "❌"}`);
      console.log(`   检查时间: ${new Date(status.lastCheck).toLocaleString()}`);
      console.log("\n   安装项:");
      for (const item of status.items) {
        console.log(`   - ${item.installId} (${item.kind}): ${item.installed ? "✅" : "❌"} ${item.message || ""}`);
      }

      await skillsManager.cleanup();
      return true;
    }

    // 执行安装
    logger.info(`安装 ${skillName} 的依赖...`);
    const results = await skillsManager.installSkillDeps(skillName, {
      dryRun: options.dryRun,
    });

    console.log(`\n📦 ${skillName}:`);
    for (const result of results) {
      if (result.ok) {
        console.log(`  ✅ ${result.installId}: ${result.message}`);
      } else {
        console.log(`  ❌ ${result.installId}: ${result.message}`);
      }
    }

    await skillsManager.cleanup();
    return results.every((r) => r.ok);
  } catch (error) {
    logger.error("安装失败:", error);
    return false;
  }
}

/**
 * 处理 list 命令
 */
async function handleListCommand(args: string[]): Promise<boolean> {
  try {
    const skillsManager = createDefaultSkillsManager();
    await skillsManager.loadSkills();

    const options = parseOptions(args);
    const allSkills = skillsManager.getAllSkills();

    if (options.install) {
      // 仅列出有安装规范的技能
      const skillsWithInstall = skillsManager.listSkillsWithInstallSpecs();
      console.log(`📦 有安装规范的技能 (${skillsWithInstall.length}个):\n`);
      for (const name of skillsWithInstall) {
        const status = await skillsManager.getInstallStatus(name);
        console.log(`  ${name}: ${status?.allInstalled ? "✅" : "❌"}`);
      }
    } else {
      // 列出所有技能
      console.log(`📋 所有技能 (${allSkills.length}个):\n`);
      for (const entry of allSkills) {
        console.log(`  - ${entry.skill.name}${entry.frontmatter.description ? ": " + entry.frontmatter.description : ""}`);
      }
    }

    await skillsManager.cleanup();
    return true;
  } catch (error) {
    logger.error("列表获取失败:", error);
    return false;
  }
}

/**
 * 处理 status 命令
 */
async function handleStatusCommand(args: string[]): Promise<boolean> {
  const skillName = args[0];

  if (!skillName) {
    logger.error("请指定技能名称");
    return false;
  }

  try {
    const skillsManager = createDefaultSkillsManager();
    await skillsManager.loadSkills();

    const status = await skillsManager.getInstallStatus(skillName);
    await skillsManager.cleanup();

    if (!status) {
      logger.error(`技能未找到: ${skillName}`);
      return false;
    }

    console.log(`📦 ${status.skillName} 安装状态:\n`);
    console.log(`   全部已安装: ${status.allInstalled ? "✅ 是" : "❌ 否"}`);
    console.log(`   检查时间: ${new Date(status.lastCheck).toLocaleString()}\n`);
    console.log(`   安装项:`);
    for (const item of status.items) {
      const icon = item.installed ? "✅" : "❌";
      console.log(`   ${icon} ${item.installId} (${item.kind})`);
      if (item.message) {
        console.log(`      ${item.message}`);
      }
    }

    return true;
  } catch (error) {
    logger.error("状态获取失败:", error);
    return false;
  }
}

/**
 * 解析命令行选项
 */
function parseOptions(args: string[]): Record<string, boolean> {
  const options: Record<string, boolean> = {
    all: false,
    check: false,
    dryRun: false,
    force: false,
    install: false,
  };

  for (const arg of args) {
    if (arg === "--all") options.all = true;
    if (arg === "--check") options.check = true;
    if (arg === "--dry-run") options.dryRun = true;
    if (arg === "--force") options.force = true;
    if (arg === "--install") options.install = true;
  }

  return options;
}

/**
 * 打印 skills 命令帮助
 */
function printSkillsHelp() {
  console.log(`
用法: krebs skills <命令> [选项]

命令:
  add <source>       添加技能（目录、.skill.gz 或 URL）
  remove <skill-name> 移除技能
  install <skill>     安装技能依赖
  list               列出所有技能
  status <skill>      查看技能安装状态
  create <name>       创建新技能目录结构
  package <path>      打包技能为 .skill.gz

选项:
  --all             安装所有技能的依赖（仅用于install）
  --check           仅检查安装状态，不实际安装
  --dry-run         预览将要执行的操作
  --force           强制执行（覆盖或跳过确认）
  --install         仅列出有安装规范的技能（仅用于list）
  --target=<dir>    目标目录：managed 或 workspace（用于add/remove）

示例:
  # 添加技能
  krebs skills add ./my-skill
  krebs skills add https://example.com/skill.skill.gz
  krebs skills add ./my-skill --target=workspace --install

  # 移除技能
  krebs skills remove my-skill
  krebs skills remove my-skill --force

  # 安装依赖
  krebs skills install test-install
  krebs skills install --all

  # 列出技能
  krebs skills list
  krebs skills list --install

  # 查看状态
  krebs skills status test-install

  # 创建和打包
  krebs skills create my-new-skill
  krebs skills package skills/bundled/my-skill
`);
}

/**
 * 打印 install 命令帮助
 */
function printInstallHelp() {
  console.log(`
用法: krebs skills install <技能名 | --all> [选项]

选项:
  --all             安装所有技能的依赖
  --check           仅检查安装状态
  --dry-run         预览将要执行的操作
  --force           强制重新安装

示例:
  krebs skills install test-install
  krebs skills install --all
  krebs skills install --dry-run
  krebs skills install --check
`);
}
