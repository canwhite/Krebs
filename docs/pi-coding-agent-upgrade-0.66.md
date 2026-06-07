# pi-coding-agent 升级指南 (0.51.5 → 0.66.1)

## 概述

本文档记录了 Krebs 从 `@mariozechner/pi-coding-agent` 0.51.5 升级到 0.66.1 的过程和重要变更。

## 版本变更

| 包名 | 旧版本 | 新版本 |
|------|--------|--------|
| `@mariozechner/pi-coding-agent` | 0.51.5 | 0.66.1 |
| `@mariozechner/pi-ai` | - | 0.66.1 |

## 主要变更

### 1. 依赖更新

新增 `@mariozechner/pi-ai` 依赖包，该包包含模型相关的类型和工具函数。

```bash
bun install @mariozechner/pi-ai@latest
```

### 2. 导入方式变更

**旧代码 (CommonJS require):**
```typescript
const { getModel } = require("@mariozechner/pi-ai");
```

**新代码 (ESM import):**
```typescript
import { getModel } from "@mariozechner/pi-ai";
import type { Model } from "@mariozechner/pi-ai";
```

### 3. Session Management API 变更

#### 移除的事件 (v0.65.0)
- `session_switch`
- `session_fork`

#### 新增事件 (v0.65.0)
- `session_start` - 统一的事件，包含 `reason` 字段：
  - `"startup"` - 启动时
  - `"reload"` - 重新加载
  - `"new"` - 新建会话
  - `"resume"` - 恢复会话
  - `"fork"` - 分支会话

### 4. 新增功能

#### Session Runtime API (v0.65.0)
```typescript
import { createAgentSessionRuntime, AgentSessionRuntime } from "@mariozechner/pi-coding-agent";

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.create(process.cwd()),
});
```

#### defineTool() 辅助函数 (v0.65.0)
```typescript
import { defineTool } from "@mariozechner/pi-coding-agent";

const myTool = defineTool({
  name: "my_tool",
  description: "My custom tool",
  parameters: Type.Object({
    input: Type.String(),
  }),
  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    // 工具实现
  },
});
```

### 5. 环境变量

新增环境变量 `PI_CODING_AGENT=true`，可在子进程中检测是否在 coding agent 环境中运行。

## 兼容性修复

### 问题 1: 模块解析错误

**错误信息:**
```
Cannot find module '@mariozechner/pi-ai' from '/Users/zack/Desktop/Krebs/server.ts'
```

**原因:** 使用 CommonJS `require()` 在 ESM 环境中无法正确解析模块。

**解决方案:** 改用 ESM `import` 语法。

### 问题 2: 类型导入

`Model` 类型从 `@mariozechner/pi-ai` 的 `types.js` 中导出，通过主入口 re-export。

**正确导入:**
```typescript
import type { Model } from "@mariozechner/pi-ai";
```

## 测试验证

升级后请运行以下测试验证功能：

```bash
# 启动服务器
bun run start

# 健康检查
curl http://localhost:3333/health

# 运行测试套件
bun run test
```

## 迁移清单

- [x] 更新 `@mariozechner/pi-coding-agent` 到 0.66.1
- [x] 安装 `@mariozechner/pi-ai` 0.66.1
- [x] 修改 `server.ts` 中的导入方式
- [x] 验证 WebSocket 连接和会话创建
- [x] 验证健康检查端点
- [ ] 检查自定义工具兼容性
- [ ] 检查扩展系统兼容性
- [ ] 运行完整测试套件

## 参考链接

- [pi-mono GitHub](https://github.com/badlogic/pi-mono)
- [Pi Coding Agent 文档](https://pi.dev)
- [Changelog](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/CHANGELOG.md)

## 更新日期

2026-04-13
