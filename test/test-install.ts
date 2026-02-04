/**
 * 测试Skills依赖安装功能
 */

import { createDefaultSkillsManager } from "../src/agent/skills/index.js";

async function testInstall() {
  console.log("=== Skills依赖安装测试 ===\n");

  // 1. 创建SkillsManager
  const skillsManager = createDefaultSkillsManager();
  await skillsManager.loadSkills();

  console.log(`✅ 已加载 ${skillsManager.getSnapshot().count} 个技能\n`);

  // 2. 列出有安装规范的技能
  const allSkills = skillsManager.getAllSkills();
  console.log(`📋 所有技能列表:`);
  allSkills.forEach((entry) => {
    console.log(`   - ${entry.skill.name}`);
    const installSpecs = entry.frontmatter.install;
    if (installSpecs && installSpecs.length > 0) {
      console.log(`     install: ${JSON.stringify(installSpecs, null, 2)}`);
    }
  });
  console.log();

  const skillsWithInstall = skillsManager.listSkillsWithInstallSpecs();
  console.log(`📦 有安装规范的技能 (${skillsWithInstall.length}个):`);
  skillsWithInstall.forEach((name) => {
    console.log(`   - ${name}`);
  });
  console.log();

  // 3. 检查TestInstall技能的安装状态
  if (skillsWithInstall.includes("TestInstall")) {
    console.log("🔍 检查 TestInstall 技能的安装状态...");
    const status = await skillsManager.getInstallStatus("TestInstall");

    if (status) {
      console.log(`   技能名: ${status.skillName}`);
      console.log(`   全部已安装: ${status.allInstalled ? "✅" : "❌"}`);
      console.log("   安装项:");
      status.items.forEach((item) => {
        console.log(`     - ${item.installId} (${item.kind}): ${item.installed ? "✅ 已安装" : "❌ 未安装"}`);
        if (item.message) {
          console.log(`       ${item.message}`);
        }
      });
    }
    console.log();

    // 4. Dry-run测试
    console.log("🧪 测试Dry-run模式（不实际安装）...");
    const dryRunResults = await skillsManager.installSkillDeps("TestInstall", { dryRun: true });
    dryRunResults.forEach((result) => {
      console.log(`   ${result.ok ? "✅" : "❌"} ${result.installId} (${result.kind})`);
      console.log(`      ${result.message}`);
    });
    console.log();

    // 5. 询问是否真的安装
    console.log("⚠️  要执行实际安装吗？");
    console.log("   这将运行 npm install -g prettyping");
    console.log("   如果已安装，会跳过。");
  } else {
    console.log("❌ 未找到 TestInstall 技能");
  }

  // 清理
  await skillsManager.cleanup();
  console.log("\n✨ 测试完成");
}

// 运行测试
testInstall().catch((error) => {
  console.error("❌ 测试失败:", error);
  process.exit(1);
});
