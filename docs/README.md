# pi-coding-agent 文档索引

## 文档列表

### 核心概念
1. **[快速入门](quick-start.md)** - 安装、配置和基本使用指南
2. **[架构概述](architecture-overview.md)** - 系统整体架构和设计理念
3. **[代码逻辑详解](code-logic.md)** - 详细代码分析和实现原理

### 高级主题
4. **[Extension 系统详解](extension-system.md)** - 插件系统的完整指南
   - Extension 的概念和作用
   - Extension 的加载和调用机制
   - reload 方法的工作原理
   - 开发自定义 Extension

### 沙箱系统 (新增)
5. **[沙箱实现核心](sandbox-core.md)** - 沙箱实现原理
6. **[沙箱方案](sandbox-wasmtime.md)** - wasmtime + coreutils 沙箱设计

---

## 新增：沙箱系统

### 核心思路

**读写分离**：
- **读命令** → 透传到原 bash（无限制）
- **写命令** → wasmtime + coreutils 沙箱执行

### 安全覆盖

| 场景 | 保护 |
|------|------|
| 写文件到 cwd 外 | ✅ wasmtime `--dir` 限制 |
| 删除 cwd 外的文件 | ✅ 同上 |
| 恶意写操作 | ✅ 白名单命令 |

| 未覆盖 | 现状 |
|--------|------|
| 读敏感文件 | ❌ 透传无限制 |
| 读取 cwd 外 | ❌ 透传无限制 |
| 网络访问 | ❌ 无限制 |

### 启用方式

```typescript
createRuntime(sessionId, sessionPath, true);  // sandbox=true
```

### 目录结构

```
server/sandbox/
├── mod.ts           # 导出
├── executor.ts     # wasmtime 封装
└── tools/
    ├── bash.ts     # 沙箱 bash 工具
    └── types.ts

wasm/
├── bin/wasmtime              # v45.0.1
└── coreutils/coreutils-0.9.0-wasm32-wasip1/coreutils.wasm
```

---

## 学习路径

### 初学者
1. 从 [快速入门](quick-start.md) 开始，了解基本使用
2. 阅读 [架构概述](architecture-overview.md) 理解整体设计
3. 查看 [代码逻辑详解](code-logic.md) 了解实现细节

### 开发者
1. 深入 [Extension 系统详解](extension-system.md) 学习插件开发
2. 参考现有代码创建自定义工具和扩展
3. 探索框架的高级功能和配置选项
4. 了解 [沙箱实现核心](sandbox-core.md) 学习沙箱原理

---

## 核心概念速查

### Agent Session
- 管理单个对话会话
- 维护对话历史
- 处理工具调用和事件分发

### 工具系统
- **内置工具**: read, write, bash 等基础操作
- **自定义工具**: 直接在代码中定义的工具
- **Extension 工具**: 通过插件系统加载的工具
- **沙箱工具**: 通过 wasmtime 隔离的写操作执行

### Extension 系统
- **插件化架构**: 支持功能扩展
- **事件驱动**: 响应框架生命周期事件
- **热重载**: 支持动态更新资源

### 资源管理
- **ResourceLoader**: 资源加载和发现
- **reload()**: 重新加载所有资源的方法
- **配置系统**: 环境变量和配置文件

---

## 常见用例

### 1. 创建自定义工具
参考 [代码逻辑详解](code-logic.md) 中的工具定义部分

### 2. 开发 Extension 插件
参考 [Extension 系统详解](extension-system.md) 中的开发指南

### 3. 配置 AI 模型
- 设置环境变量: `DEEPSEEK_API_KEY` 或 `ANTHROPIC_API_KEY`
- 选择不同的思考级别: `thinkingLevel`
- 配置系统提示: 修改 `systemPrompt`

### 4. 集成第三方服务
- 通过 Extension 系统集成 GitHub、Jira、Slack 等
- 创建专门的工具处理特定 API
- 添加命令和快捷键提高效率

---

## 故障排除

### 常见问题
1. **API 密钥错误**: 检查环境变量设置
2. **工具未找到**: 确认工具名称和注册方式
3. **Extension 加载失败**: 检查文件路径和依赖
4. **类型错误**: 验证 TypeBox 模式定义

### 调试技巧
```bash
# 启用调试日志
export DEBUG="pi:*"

# 检查资源加载
console.log(resourceLoader.getExtensions())
```

---

## 更新日志

### 2026-06-09
- 添加沙箱系统（wasmtime + coreutils）
- 实现读写分离机制
- 添加 `before_agent_confirm`、`agent_end`、`context` 扩展

### 2026-03-19
- 创建完整的文档体系
- 添加 Extension 系统详细说明
- 完善架构概述和快速入门指南
- 整理代码逻辑分析

---

## 相关资源

### 官方文档
- [pi-coding-agent GitHub](https://github.com/mariozechner/pi-coding-agent)
- [TypeBox 文档](https://github.com/sinclairzx81/typebox)
- [Bun 运行时](https://bun.sh/docs)
- [wasmtime](https://github.com/bytecodealliance/wasmtime)
- [uutils/coreutils](https://github.com/uutils/coreutils)

### 学习资源
- TypeScript 官方文档
- AI Agent 设计模式
- 插件系统架构设计

---

## 许可证

本文档基于项目代码和相关技术文档整理，遵循相应的开源协议。

---

*如有问题或建议，请提交 Issue 或参与讨论。*
