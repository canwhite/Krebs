/**
 * Skills Create 命令
 *
 * 创建新的技能目录结构（类似 openclaw-cn-ds 的 init_skill.py）
 */

import path from "path";
import fs from "fs";

interface CreateOptions {
  path?: string;
  resources?: string;
  examples?: boolean;
}

const SKILL_TEMPLATE = `---
name: {skillName}
description: [TODO: 完整描述技能的功能和使用场景。说明何时应该使用此技能。]
metadata: '{{"krebs":{{"emoji":"🔧","category":"Category","tags":["tag1","tag2"]}}}
---

# {skillTitle}

## 概述

[TODO: 1-2 句话说明此技能的功能]

## 使用指南

[TODO: 添加使用说明、示例代码和最佳实践]

### 示例

\`\`\`bash
# 示例命令
example-command --option
\`\`\`

## 资源（可选）

仅在需要时创建资源目录。如果不需要，删除此部分。

### scripts/
可执行代码（Python/Bash/Node.js 等），可直接运行。

**适用场景**：
- 需要确定性执行的重复操作
- 需要代码而非文字说明的自动化任务

**示例**：
- PDF skill: \`scripts/rotate_pdf.py\` - 旋转 PDF
- 图像 skill: \`scripts/resize_image.sh\` - 调整图片大小

### references/
详细的参考文档，LLM 需要时会加载。

**适用场景**：
- 文档过长不适合放在 SKILL.md
- API 文档、数据库 schema、详细指南

**示例**：
- BigQuery skill: \`references/schema.md\` - 表结构
- API skill: \`references/api_docs.md\` - API 文档

### assets/
输出中使用的文件（模板、图片等），不加载到上下文。

**适用场景**：
- 模板文件、品牌资源、启动器模板

**示例**：
- 前端 skill: \`assets/hello-world/\` - HTML 模板
- 品牌 skill: \`assets/logo.png\`、\`assets/template.pptx\` - 品牌资源
`;

const EXAMPLE_SCRIPT = `#!/usr/bin/env node
/**
 * 示例脚本 for {skillName}
 *
 * 这是一个占位符脚本，可以替换为实际实现或删除（如果不需要）。
 */

function main() {
  console.log("This is an example script for {skillName}");
  // TODO: 添加实际的脚本逻辑
  // 这里可以是：数据处理、文件转换、API 调用等
}

main();
`;

const EXAMPLE_REFERENCE = `# {skillTitle} 参考文档

这是详细的参考文档占位符。
替换为实际的参考内容或删除（如果不需要）。

## 参考文档适用场景

参考文档适用于：
- 完整的 API 文档
- 详细的操作指南
- 复杂的多步骤流程
- 过长不适合 SKILL.md 的信息
- 仅在特定用例下需要的内容

## 结构建议

### API 参考示例
- 概述
- 认证
- 端点和示例
- 错误码
- 速率限制

### 工作流指南示例
- 前提条件
- 分步说明
- 常见模式
- 故障排除
- 最佳实践
`;

/**
 * 规范化技能名称为小写连字符格式
 */
function normalizeSkillName(skillName: string): string {
  const normalized = skillName.trim().toLowerCase();
  const hyphenated = normalized.replace(/[^a-z0-9]+/g, "-");
  const deduplicated = hyphenated.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return deduplicated;
}

/**
 * 将连字符名称转换为标题格式
 */
function titleCaseSkillName(skillName: string): string {
  return skillName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * 解析资源参数
 */
function parseResources(rawResources?: string): string[] {
  if (!rawResources) return [];

  const ALLOWED_RESOURCES = ["scripts", "references", "assets"];
  const resources = rawResources
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  const invalid = resources.filter((r) => !ALLOWED_RESOURCES.includes(r));
  if (invalid.length > 0) {
    const allowed = ALLOWED_RESOURCES.join(", ");
    console.error(`[错误] 未知的资源类型: ${invalid.join(", ")}`);
    console.error(`   允许的类型: ${allowed}`);
    process.exit(1);
  }

  // 去重
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const resource of resources) {
    if (!seen.has(resource)) {
      deduped.push(resource);
      seen.add(resource);
    }
  }

  return deduped;
}

/**
 * 创建资源目录和示例文件
 */
function createResourceDirs(
  skillDir: string,
  skillName: string,
  skillTitle: string,
  resources: string[],
  includeExamples: boolean,
): void {
  for (const resource of resources) {
    const resourceDir = path.join(skillDir, resource);

    if (!fs.existsSync(resourceDir)) {
      fs.mkdirSync(resourceDir, { recursive: true });
    }

    if (resource === "scripts") {
      if (includeExamples) {
        const exampleScript = path.join(resourceDir, "example.js");
        fs.writeFileSync(
          exampleScript,
          EXAMPLE_SCRIPT.replace(/\{skillName\}/g, skillName),
        );
        console.log("[OK] 创建 scripts/example.js");
        // 设置可执行权限（Unix）
        try {
          fs.chmodSync(exampleScript, 0o755);
        } catch (_err) {
          // 忽略 Windows 或无权限的情况
        }
      } else {
        console.log("[OK] 创建 scripts/");
      }
    } else if (resource === "references") {
      if (includeExamples) {
        const exampleRef = path.join(resourceDir, "reference.md");
        fs.writeFileSync(
          exampleRef,
          EXAMPLE_REFERENCE.replace(/\{skillTitle\}/g, skillTitle),
        );
        console.log("[OK] 创建 references/reference.md");
      } else {
        console.log("[OK] 创建 references/");
      }
    } else if (resource === "assets") {
      if (includeExamples) {
        const exampleAsset = path.join(resourceDir, "example_asset.txt");
        fs.writeFileSync(
          exampleAsset,
          "# 示例资源文件\\n\\n此占位符表示资源文件的存储位置。",
        );
        console.log("[OK] 创建 assets/example_asset.txt");
      } else {
        console.log("[OK] 创建 assets/");
      }
    }
  }
}

/**
 * 创建技能
 */
export async function handleCreateCommand(args: string[]): Promise<boolean> {
  const skillName = args[0];

  // 解析选项
  const options: CreateOptions = {
    path: undefined,
    resources: undefined,
    examples: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--examples") {
      options.examples = true;
    } else if (arg.startsWith("--path=")) {
      options.path = arg.split("=")[1];
    } else if (arg.startsWith("--resources=")) {
      options.resources = arg.split("=")[1];
    }
  }

  if (!skillName) {
    console.error(`
用法: krebs skills create <skill-name> [选项]

创建新的技能目录结构。

参数:
  skill-name          技能名称（将规范化为连字符格式）

选项:
  --path=<dir>        输出目录（默认: skills/bundled/）
  --resources=<list>    逗号分隔的资源列表: scripts,references,assets
  --examples           在资源目录中创建示例文件

示例:
  krebs skills create my-skill
  krebs skills create my-skill --path skills/bundled
  krebs skills create my-skill --resources scripts,references
  krebs skills create my-skill --resources scripts --examples
`);
    return false;
  }

  // 规范化技能名称
  const normalizedSkillName = normalizeSkillName(skillName);
  if (normalizedSkillName !== skillName) {
    console.log(
      `注意: 技能名称从 '${skillName}' 规范化为 '${normalizedSkillName}'`,
    );
  }

  if (normalizedSkillName.length > 64) {
    console.error(
      `[错误] 技能名称 '${normalizedSkillName}' 过长 (${normalizedSkillName.length} 字符)`,
    );
    console.error(`   最大长度: 64 字符`);
    return false;
  }

  // 确定输出路径
  const defaultPath = path.join(process.cwd(), "skills", "bundled");
  const outputPath = options.path ? path.resolve(options.path) : defaultPath;

  const skillDir = path.join(outputPath, normalizedSkillName);

  // 检查目录是否已存在
  if (fs.existsSync(skillDir)) {
    console.error(`[错误] 技能目录已存在: ${skillDir}`);
    return false;
  }

  try {
    // 创建技能目录
    fs.mkdirSync(skillDir, { recursive: true });
    console.log(`[OK] 创建技能目录: ${skillDir}`);

    // 创建 SKILL.md
    const skillTitle = titleCaseSkillName(normalizedSkillName);
    const skillContent = SKILL_TEMPLATE.replace(
      /\{skillName\}/g,
      normalizedSkillName,
    ).replace(/\{skillTitle\}/g, skillTitle);

    const skillMdPath = path.join(skillDir, "SKILL.md");
    fs.writeFileSync(skillMdPath, skillContent);
    console.log("[OK] 创建 SKILL.md");

    // 创建资源目录
    if (options.resources) {
      const resources = parseResources(options.resources);
      if (resources.length > 0) {
        createResourceDirs(
          skillDir,
          normalizedSkillName,
          skillTitle,
          resources,
          !!options.examples,
        );
      }
    }

    // 打印下一步
    console.log(`\\n[OK] 技能 '${normalizedSkillName}' 创建成功！`);
    console.log("\\n下一步:");
    console.log("1. 编辑 SKILL.md 完成 TODO 项并更新 description");
    if (options.resources) {
      if (options.examples) {
        console.log(
          "2. 自定义或删除 scripts/、references/ 和 assets/ 中的示例文件",
        );
      } else {
        console.log("2. 根据需要添加资源到 scripts/、references/ 和 assets/");
      }
    } else {
      console.log(
        "2. 仅在需要时创建资源目录（scripts/、references/、assets/）",
      );
    }
    console.log("3. 运行 'krebs skills list' 查看技能是否加载");

    return true;
  } catch (error) {
    console.error(`[错误] 创建技能失败: ${error}`);
    return false;
  }
}
