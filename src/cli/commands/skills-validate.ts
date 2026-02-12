/**
 * Skills 验证 CLI 命令
 *
 * 用法: npm run validate:skills
 *       或: krebs validate:skills
 */

import path from "node:path";
import { validateSkillsDir, printValidationResults } from "@/agent/skills/validator.js";

/**
 * 执行验证命令
 */
export async function executeSkillsValidateCommand(args: string[]): Promise<boolean> {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                 Skills 格式验证工具                              ║
╚═══════════════════════════════════════════════════════╝
`);

  // 确定要验证的目录
  let skillsDir = path.join(process.cwd(), "skills", "bundled");

  // 支持命令行参数指定目录
  if (args.length > 0) {
    const customDir = args[0];
    if (customDir.startsWith("/")) {
      skillsDir = customDir;
    } else {
      skillsDir = path.join(process.cwd(), customDir);
    }
  }

  console.log(`验证目录: ${skillsDir}`);
  console.log();

  // 执行验证
  const results = validateSkillsDir(skillsDir);

  // 打印结果
  printValidationResults(results);

  return true;
}
