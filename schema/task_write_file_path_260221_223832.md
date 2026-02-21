# Task: 修复 write_file 工具默认保存路径

**任务ID**: task_write_file_path_260221_223832
**创建时间**: 2026-02-21 22:38:32
**状态**: 进行中
**目标**: 让 Agent 生成的任务文件自动保存到 `data/tasks/` 目录，而不是项目根目录

## 最终目标

修改 write_file 工具的实现，使其在没有指定完整路径时，默认将文件保存到 `data/tasks/` 目录。

## 问题分析

### 当前行为

从会话 `user_1771593098964_3h9g1fur8.md` 中看到：

```json
{
  "id": "call_00_BUDyaXNVMlPJRPGMSI31V5zi",
  "name": "write_file",
  "arguments": {
    "path": "ai_daichang_article.md",
    "content": "..."
  }
}
```

Agent 使用相对路径 `ai_daichang_article.md`，文件被保存到项目根目录。

### 期望行为

当 Agent 使用相对路径时，文件应该保存到 `data/tasks/` 目录：
- 输入：`ai_daichang_article.md`
- 实际保存：`data/tasks/ai_daichang_article.md`

### 保留能力

仍然支持绝对路径和显式的相对路径：
- 输入：`/tmp/test.md` → 保存到 `/tmp/test.md`
- 输入：`./docs/test.md` → 保存到 `./docs/test.md`
- 输入：`test.md` → 保存到 `data/tasks/test.md`（新增）

## 拆解步骤

### 1. 定位 write_file 工具实现 ✅
- [x] 1.1 搜索 write_file 工具定义
- [x] 1.2 读取工具实现代码（src/agent/tools/builtin.ts L180-239）
- [x] 1.3 理解当前路径处理逻辑

### 2. 修改路径处理逻辑 ✅
- [x] 2.1 添加默认路径前缀（data/tasks/）
- [x] 2.2 保留绝对路径和显式相对路径的处理
- [x] 2.3 确保 data/tasks/ 目录存在

### 3. 测试验证 ✅
- [x] 3.1 构建项目验证代码正确性
- [x] 3.2 移动现有文件到正确位置

### 4. 更新文档 ✅
- [x] 4.1 更新工具描述，说明默认保存路径
- [ ] 4.2 更新 production.md（如需要）

## 当前进度

### 正在进行: 完成总结

已成功完成所有核心任务。

## 实现方案

### 修改内容

**文件**: `src/agent/tools/builtin.ts`

**关键修改** (L215-222):
```typescript
// 处理路径：如果是纯文件名（不含路径分隔符），添加 data/tasks/ 前缀
if (!filePath.includes("/") && !filePath.includes("\\")) {
  // 纯文件名，保存到 data/tasks/
  filePath = path.join("data", "tasks", filePath);
  logger.debug(`Simple filename detected, saving to tasks directory: ${filePath}`);
}
// 其他情况（绝对路径、显式相对路径）保持不变
```

**更新工具描述** (L183):
```typescript
description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. If a simple filename is provided (without path separators), it will be saved to data/tasks/ directory.",
```

**路径处理规则**:
- ✅ **纯文件名**: `test.md` → `data/tasks/test.md`
- ✅ **绝对路径**: `/tmp/test.md` → `/tmp/test.md`
- ✅ **显式相对路径**: `./docs/test.md` → `./docs/test.md`
- ✅ **上级相对路径**: `../test.md` → `../test.md`

### 测试结果

**构建测试**: ✅ 通过
```bash
npm run build
# tsc && tsc-alias 编译成功
```

**文件移动**: ✅ 完成
```bash
mv ai_daichang_article.md data/tasks/
# 文件已移动到正确位置
```

## 下一步行动

1. ✅ 所有任务已完成
2. ✅ 代码已修改并构建成功
3. ✅ 现有文件已移动到正确位置
4. 等待用户重启服务以应用更改
