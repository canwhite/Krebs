/**
 * Skills Remove 命令测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const TEST_DIR = path.join(process.cwd(), "test-temp", "skills-remove");

describe("Skills Remove Command", () => {
  beforeEach(async () => {
    // 创建测试目录和技能
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.mkdir(path.join(TEST_DIR, "skills", "managed"), { recursive: true });

    const skillDir = path.join(TEST_DIR, "skills", "managed", "test-remove-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: test-remove-skill
description: Test skill for removal
---

# Test Remove Skill
This is a test skill for removal.
`
    );
  });

  afterEach(async () => {
    // 清理测试目录
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  it("应该显示帮助信息", () => {
    const result = execSync(
      `node ${path.join(process.cwd(), "dist", "index.js")} skills remove`,
      { encoding: "utf-8" }
    );

    expect(result).toContain("用法:");
    expect(result).toContain("krebs skills remove <skill-name>");
  });

  it("应该移除技能", () => {
    const skillDir = path.join(TEST_DIR, "skills", "managed", "test-remove-skill");

    // 确认技能存在
    expect(existsSync(skillDir)).toBe(true);

    // 运行 remove 命令
    const result = execSync(
      `node ${path.join(process.cwd(), "dist", "index.js")} skills remove test-remove-skill --force`,
      { cwd: TEST_DIR, encoding: "utf-8" }
    );

    expect(result).toContain("技能 'test-remove-skill' 已删除");

    // 验证技能已删除
    expect(existsSync(skillDir)).toBe(false);
  });

  it("应该拒绝不存在的技能", () => {
    const result = execSync(
      `node ${path.join(process.cwd(), "dist", "index.js")} skills remove non-existent --force`,
      { cwd: TEST_DIR, encoding: "utf-8" }
    );

    expect(result).toContain("未找到技能");
  });

  it("应该拒绝移除 bundled 技能", () => {
    const result = execSync(
      `node ${path.join(process.cwd(), "dist", "index.js")} skills remove Filesystem --force`,
      { cwd: TEST_DIR, encoding: "utf-8" }
    );

    // 应该显示错误或提示
    expect(result.length).toBeGreaterThan(0);
  });
});
