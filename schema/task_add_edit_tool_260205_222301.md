# Task: 添加 Edit 工具到 Tools 系统

**任务ID**: task_add_edit_tool_260205_222301
**创建时间**: 2026-02-05
**状态**: 已完成 ✅
**目标**: 在 builtin.ts 中添加 edit 工具，实现文件的精确编辑功能

## 最终目标
在 tools 系统中添加 edit 工具，用于对现有文件进行精确的字符串替换编辑，与现有的 write、read 工具形成完整文件操作能力。

## 拆解步骤

### 1. 分析现有工具实现
- [ ] 查看 read、write 工具的实现模式
- [ ] 了解 Tool 类型定义
- [ ] 确定工具参数和返回值结构

### 2. 实现 edit 工具
- [ ] 添加 editTool 导出对象
- [ ] 定义 inputSchema（path, oldString, newString, replaceAll）
- [ ] 实现 execute 方法
  - [ ] 参数验证
  - [ ] 读取文件内容
  - [ ] 执行字符串替换
  - [ ] 写回文件
  - [ ] 错误处理

### 3. 更新工具导出
- [ ] 将 editTool 添加到 getBuiltinTools() 返回数组

### 4. 测试
- [ ] 手动测试基本编辑功能
- [ ] 测试 replaceAll 参数
- [ ] 测试错误情况（文件不存在、oldString 不存在等）

## 当前进度

### 已完成: 实现并测试 edit 工具 ✅

已成功完成所有步骤：
1. ✅ 分析现有工具实现（bash、read、write）
2. ✅ 实现 editTool 工具
3. ✅ 更新 getBuiltinTools() 导出列表
4. ✅ 创建并运行完整测试套件（8个测试全部通过）

## 实现详情

### editTool 功能
- **参数**:
  - `path`: 文件路径（必需）
  - `oldString`: 要替换的字符串（必需）
  - `newString`: 新字符串（必需）
  - `replaceAll`: 是否替换所有匹配项（可选，默认 false）

### 核心特性
- ✅ 精确字符串匹配（区分大小写）
- ✅ 支持单个替换（默认）和全局替换
- ✅ 完整的参数验证
- ✅ 详细的错误提示
- ✅ 支持特殊字符（如换行符）
- ✅ 可替换为空字符串（删除功能）

### 测试覆盖（8个测试全部通过）
1. ✅ 替换第一个匹配项（默认行为）
2. ✅ 替换所有匹配项
3. ✅ 处理 oldString 不存在的情况
4. ✅ 处理文件不存在的情况
5. ✅ 支持空 newString（删除操作）
6. ✅ 大小写敏感验证
7. ✅ 特殊字符处理
8. ✅ 参数验证（path、oldString、newString）

### 文件变更
- `src/agent/tools/builtin.ts`: 添加 editTool 实现
- `src/agent/tools/index.ts`: 导出 editTool
- `src/agent/tools/groups.ts`: 添加 edit_file 到 group:fs 和 group:builtin
- `test/edit-tool.test.ts`: 新增完整测试套件（8个测试）
- `test/edit-tool-integration.test.ts`: 新增集成测试（6个测试）
- `test/edit-tool-adapters.test.ts`: 新增适配器测试（3个测试）

## 系统集成验证 ✅

### 1. 核心集成
- ✅ 在 `getBuiltinTools()` 中导出
- ✅ 在 `index.ts` 中公开导出
- ✅ 在 `ToolRegistry` 中可注册和调用

### 2. 工具分组
- ✅ 添加到 `group:fs`（文件系统工具）
- ✅ 添加到 `group:builtin`（内置工具）
- ✅ 支持通过分组批量启用

### 3. Provider 适配
- ✅ OpenAI 适配正常
- ✅ Anthropic 适配正常
- ✅ DeepSeek 适配正常

### 4. 测试覆盖
- **单元测试**: 8个 ✅
- **集成测试**: 6个 ✅
- **适配器测试**: 3个 ✅
- **总计**: 17个测试全部通过

### 5. 构建验证
- ✅ TypeScript 编译通过
- ✅ 无破坏性变更（369个现有测试通过）

## 可用性说明

**Edit 工具现在完全可用！** 可以在以下场景中使用：

1. **Agent 工具调用**: LLM 可以调用 `edit_file` 工具
2. **直接代码调用**: 通过 `ToolRegistry` 或 `getBuiltinTools()` 调用
3. **多 Provider 支持**: 适用于所有支持的 LLM 提供商
4. **工具策略控制**: 可通过 `group:fs` 或 `group:builtin` 批量控制

## 使用示例

```typescript
// 示例 1: Agent 自动调用
const agent = new Agent({
  tools: getBuiltinTools(), // 包含 edit_file
  // ...
});

// 示例 2: 通过工具策略启用
const agent = new Agent({
  toolProfile: "coding", // 启用 group:fs，包含 edit_file
  // ...
});

// 示例 3: 直接调用
const editTool = getBuiltinTools().find(t => t.name === "edit_file");
await editTool.execute({
  path: "/path/to/file.txt",
  oldString: "old text",
  newString: "new text",
  replaceAll: false,
});
```