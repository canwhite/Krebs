/**
 * CLI 命令入口
 *
 * 处理所有 krebs 命令行命令
 */

import { logger } from "@/shared/logger.js";

import { handleSkillsCommand } from "./commands/skills.js";

/**
 * 执行CLI命令
 *
 * @param args 命令行参数（不含node和脚本名）
 * @returns 是否成功
 */
export async function executeCliCommand(args: string[]): Promise<boolean> {
  try {
    const [command, ...subArgs] = args;

    switch (command) {
      case "skills":
        return await handleSkillsCommand(subArgs);

      case "help":
      case "--help":
      case "-h":
        printHelp();
        return true;

      case "version":
      case "--version":
      case "-v":
        printVersion();
        return true;

      default:
        logger.error(`未知命令: ${command}`);
        logger.info("运行 'krebs help' 查看帮助");
        return false;
    }
  } catch (error) {
    logger.error("命令执行失败:", error);
    return false;
  }
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log(`
krebs CN - 中文版 AI Agent 框架 v1.0.0

用法: krebs <命令> [选项]

命令:
  skills           Skills 管理
    install        安装技能依赖
    list           列出所有技能
    status         查看技能状态

  help, -h         显示帮助信息
  version, -v      显示版本信息

示例:
  krebs skills install test-install    安装单个技能的依赖
  krebs skills install --all          安装所有技能的依赖
  krebs skills install --dry-run      预览将要安装的内容
  krebs skills install --check        仅检查安装状态

更多帮助:
  krebs skills install --help         查看install命令的详细帮助
`);
}

/**
 * 打印版本信息
 */
function printVersion() {
  console.log("krebs CN v1.0.0");
}
