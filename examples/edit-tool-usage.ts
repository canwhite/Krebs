/**
 * Edit 工具使用示例
 *
 * 演示如何使用 edit_file 工具进行文件编辑
 */

import { getBuiltinTools } from "../src/agent/tools/index.js";
import { ToolRegistry } from "../src/agent/tools/registry.js";

async function main() {
  console.log("=== Edit 工具使用示例 ===\n");

  // 1. 获取所有内置工具
  const tools = getBuiltinTools();
  const editTool = tools.find((t) => t.name === "edit_file");

  if (!editTool) {
    console.error("❌ edit_file 工具未找到");
    return;
  }

  console.log("✅ 找到 edit_file 工具");
  console.log("   描述:", editTool.description);
  console.log("");

  // 2. 创建测试文件
  const testFile = "./examples/test-edit-example.txt";
  const initialContent = `# 编辑示例

这是一个测试文件。

## 功能列表
- 功能 1: 读取文件
- 功能 2: 写入文件
- 功能 3: 执行命令

## 结语
这是一个简单的测试文件。
`;

  await Bun.write(testFile, initialContent);
  console.log("✅ 创建测试文件:", testFile);
  console.log("");

  // 3. 示例 1: 替换第一个匹配项
  console.log("📝 示例 1: 替换第一个匹配项");
  console.log("   操作: 将 '功能 3: 执行命令' 替换为 '功能 3: 编辑文件'");
  const result1 = await editTool.execute({
    path: testFile,
    oldString: "功能 3: 执行命令",
    newString: "功能 3: 编辑文件",
  });
  console.log("   结果:", result1.success ? "✅ 成功" : "❌ 失败");
  if (result1.message) console.log("   消息:", result1.message);
  console.log("");

  // 4. 示例 2: 替换所有匹配项
  console.log("📝 示例 2: 替换所有匹配项");
  console.log("   操作: 将所有 '文件' 替换为 '文档'");
  const result2 = await editTool.execute({
    path: testFile,
    oldString: "文件",
    newString: "文档",
    replaceAll: true,
  });
  console.log("   结果:", result2.success ? "✅ 成功" : "❌ 失败");
  if (result2.message) console.log("   消息:", result2.message);
  console.log("");

  // 5. 示例 3: 删除内容（替换为空字符串）
  console.log("📝 示例 3: 删除内容");
  console.log("   操作: 删除 '## 结语' 部分");
  const result3 = await editTool.execute({
    path: testFile,
    oldString: "## 结语\n这是一个简单的测试文档。\n",
    newString: "",
  });
  console.log("   结果:", result3.success ? "✅ 成功" : "❌ 失败");
  if (result3.message) console.log("   消息:", result3.message);
  console.log("");

  // 6. 显示最终文件内容
  console.log("📄 最终文件内容:");
  console.log("─".repeat(50));
  const finalContent = await Bun.file(testFile).text();
  console.log(finalContent);
  console.log("─".repeat(50));
  console.log("");

  // 7. 清理
  await Bun.write(testFile, ""); // 清空文件
  console.log("✅ 清理完成");
}

// 运行示例
main().catch(console.error);
