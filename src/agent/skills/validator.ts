/**
 * Skills Validator
 *
 * 验证 SKILL.md 文件格式是否正确
 * 防止格式错误的 skill 被加载到系统中
 */

import { readFileSync, existsSync } from "node:fs";
import { parse } from "yaml";
import { createLogger } from "@/shared/logger.js";

const logger = createLogger("SkillsValidator");

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  filePath: string;
}

export interface ValidationRule {
  name: string;
  validate: (content: string, frontmatter: any) => string | null;
}

/**
 * 验证规则集合
 */
const validationRules: ValidationRule[] = [
  {
    name: "description-quotes",
    validate: (_content, frontmatter) => {
      const desc = frontmatter.description;
      if (!desc) {
        return "description 字段缺失";
      }
      // description 必须是字符串（不能是数组）
      if (Array.isArray(desc)) {
        return "description 不能是数组格式，请用双引号包围";
      }
      // 如果包含特殊字符（如 [ ]），必须用引号
      if (typeof desc === "string" && !desc.startsWith('"') && /[\[\]]/.test(desc)) {
        return "description 包含方括号必须用双引号包围";
      }
      return null;
    },
  },
  {
    name: "name-format",
    validate: (_content, frontmatter) => {
      const name = frontmatter.name;
      if (!name) {
        return "name 字段缺失";
      }
      // name 必须是小写字母、数字、连字符
      if (!/^[a-z0-9-]+$/.test(name)) {
        return `name "${name}" 格式错误：只能包含小写字母 a-z、数字 0-9 和连字符 -`;
      }
      return null;
    },
  },
  {
    name: "metadata-json",
    validate: (_content, frontmatter) => {
      const metadata = frontmatter.metadata;
      if (!metadata) {
        return null; // metadata 是可选的
      }
      if (typeof metadata !== "string") {
        return "metadata 必须是 JSON 字符串";
      }
      try {
        JSON.parse(metadata);
      } catch (error) {
        return `metadata JSON 格式错误: ${error instanceof Error ? error.message : String(error)}`;
      }
      return null;
    },
  },
  {
    name: "required-fields",
    validate: (_content, frontmatter) => {
      const required = ["name", "description"];
      const missing = required.filter((field) => !frontmatter[field]);
      if (missing.length > 0) {
        return `缺少必需字段: ${missing.join(", ")}`;
      }
      return null;
    },
  },
];

/**
 * 验证单个 SKILL.md 文件
 */
export function validateSkillFile(filePath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    filePath,
  };

  if (!existsSync(filePath)) {
    result.valid = false;
    result.errors.push(`文件不存在: ${filePath}`);
    return result;
  }

  try {
    const content = readFileSync(filePath, "utf-8");

    // 提取 frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      result.errors.push("缺少 YAML frontmatter (必须用 --- 包围)");
      result.valid = false;
      return result;
    }

    const yamlText = frontmatterMatch[1];
    let frontmatter: any;
    try {
      frontmatter = parse(yamlText);
    } catch (error) {
      result.errors.push(`YAML 解析失败: ${error instanceof Error ? error.message : String(error)}`);
      result.valid = false;
      return result;
    }

    // 执行所有验证规则
    for (const rule of validationRules) {
      const error = rule.validate(content, frontmatter);
      if (error) {
        result.errors.push(`[${rule.name}] ${error}`);
        result.valid = false;
      }
    }

    // 检查是否有内容（除了 frontmatter）
    const bodyContent = content.replace(frontmatterMatch[0], "").trim();
    if (bodyContent.length === 0) {
      result.warnings.push("文件没有内容（只有 frontmatter）");
    }
  } catch (error) {
    result.errors.push(`验证过程出错: ${error instanceof Error ? error.message : String(error)}`);
    result.valid = false;
  }

  return result;
}

/**
 * 验证目录中的所有 skills
 */
export function validateSkillsDir(dir: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  try {
    const { readdirSync } = require("node:fs");
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const skillPath = `${dir}/${entry.name}/SKILL.md`;
      const result = validateSkillFile(skillPath);
      results.push(result);
    }
  } catch (error) {
    logger.error(`验证目录失败: ${dir}`, error);
  }

  return results;
}

/**
 * 打印验证结果（用于 CLI）
 */
export function printValidationResults(results: ValidationResult[]): void {
  const validCount = results.filter((r) => r.valid).length;
  const totalCount = results.length;

  for (const result of results) {
    const fileName = result.filePath.split("/").pop();

    if (result.valid) {
      if (result.warnings.length > 0) {
        console.log(`⚠️  ${fileName}`);
        for (const warning of result.warnings) {
          console.log(`   ${warning}`);
        }
      } else {
        console.log(`✅ ${fileName}`);
      }
    } else {
      console.log(`❌ ${fileName}`);
      for (const error of result.errors) {
        console.log(`   ${error}`);
      }
    }
  }

  console.log();
  console.log(`总计: ${validCount}/${totalCount} 个 skills 通过验证`);

  if (validCount < totalCount) {
    process.exit(1);
  }
}
