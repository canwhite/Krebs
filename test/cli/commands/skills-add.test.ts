/**
 * Skills Add 命令测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const TEST_DIR = path.join(process.cwd(), "test-temp", "skills-add");

describe("Skills Add Command", () => {
  beforeEach(async () => {
    // 创建测试目录
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.mkdir(path.join(TEST_DIR, "skills", "managed"), { recursive: true });
    await fs.mkdir(path.join(TEST_DIR, "workspace", "skills"), { recursive: true });
  });

  afterEach(async () => {
    // 清理测试目录
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("应该显示帮助信息", () => {
    const result = execSync(
      `node ${path.join(process.cwd(), "dist", "index.js")} skills add`,
      { encoding: "utf-8" }
    );

    expect(result).toContain("用法:");
    expect(result).toContain("krebs skills add <source>");
  });

  it("应该从本地目录添加技能", async () => {
    // 创建测试技能
    const skillDir = path.join(TEST_DIR, "test-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: test-skill
description: Test skill
---

# Test Skill
This is a test skill.
`
    );

    // 运行 add 命令
    const result = execSync(
      `node ${path.join(process.cwd(), "dist", "index.js")} skills add ${skillDir} --force`,
      { cwd: TEST_DIR, encoding: "utf-8" }
    );

    expect(result).toContain("技能 'test-skill' 添加成功");

    // 验证文件已复制
    const targetDir = path.join(TEST_DIR, "skills", "managed", "test-skill");
    expect(existsSync(targetDir)).toBe(true);
    expect(existsSync(path.join(targetDir, "SKILL.md"))).toBe(true);
  });

  it("应该拒绝无效的技能目录", async () => {
    const result = execSync(
      `node ${path.join(process.cwd(), "dist", "index.js")} skills add /non-existent`,
      { cwd: TEST_DIR, encoding: "utf-8" }
    );

    expect(result).toContain("不存在");
  });
});
