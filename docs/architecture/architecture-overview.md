# pi-coding-agent 架构概述

## 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                   用户界面 (UI/CLI)                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    Agent Session                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Agent Loop (代理循环)                               │  │
│  │  • 管理对话流程                                      │  │
│  │  • 处理工具调用                                      │  │
│  │  • 事件分发                                          │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                    工具系统 (Tools)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   内置工具   │  │  自定义工具  │  │ Extension工具│       │
│  │ • read      │  │ • web_search│  │ • github    │       │
│  │ • write     │  │ • get_time  │  │ • jira      │       │
│  │ • bash      │  │             │  │ • slack     │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                  Extension 系统                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Resource Loader (资源加载器)                        │  │
│  │  • 发现和加载扩展                                    │  │
│  │  • 管理技能/提示/主题                                │  │
│  │  • 支持热重载 (reload)                               │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                     AI 模型集成                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   DeepSeek  │  │   Claude    │  │   OpenAI    │       │
│  │             │  │             │  │             │       │
│  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. Agent Session (代理会话)
- **功能**: 管理单个对话会话
- **职责**:
  - 维护对话历史
  - 管理工具调用
  - 处理用户输入
  - 分发事件

### 2. Agent Loop (代理循环)
- **功能**: 核心的 AI 交互循环
- **流程**:
  1. 接收用户输入
  2. 调用 AI 模型生成响应
  3. 解析工具调用
  4. 执行工具
  5. 将结果返回给 AI
  6. 继续循环

### 3. 工具系统
分为三个层次：

#### 内置工具 (Built-in Tools)
- 基础文件操作: `read`, `write`
- 系统命令: `bash`
- 代码编辑: `edit`, `grep`, `find`, `ls`

#### 自定义工具 (Custom Tools)
- 直接在代码中定义
- 示例: `web_search`, `get_current_time`
- 使用 TypeBox 定义参数模式

#### Extension 工具
- 通过 Extension 系统加载
- 支持第三方集成
- 示例: GitHub, Jira, Slack 集成

### 4. Extension 系统
- **Resource Loader**: 资源加载器，负责发现和加载所有资源
- **Extension API**: 扩展开发接口
- **Event Bus**: 事件总线，用于组件间通信

### 5. 资源管理
- **Extensions**: 功能扩展插件
- **Skills**: 技能定义文件 (SKILL.md)
- **Prompts**: 提示模板
- **Themes**: 界面主题
- **Agents Files**: 代理配置文件 (AGENTS.md, CLAUDE.md)

## 数据流

### 用户请求处理流程
```
1. 用户输入
   ↓
2. Agent Session 接收
   ↓
3. Agent Loop 处理
   ↓
4. AI 模型生成响应
   ↓
5. 解析工具调用 (如果有)
   ↓
6. 执行工具
   ↓
7. 返回结果给 AI
   ↓
8. AI 生成最终响应
   ↓
9. 返回给用户
```

### Extension 加载流程
```
1. ResourceLoader.reload() 调用
   ↓
2. 发现资源路径
   ↓
3. 加载 Extension 模块
   ↓
4. 执行 Extension 工厂函数
   ↓
5. 注册工具/命令/事件处理器
   ↓
6. 集成到系统中
```

## 关键设计模式

### 1. 插件化架构
- **核心原则**: 框架核心保持简洁，功能通过扩展添加
- **优势**: 易于维护、扩展、测试

### 2. 事件驱动
- **事件系统**: 组件通过事件通信
- **松耦合**: 组件间依赖减少

### 3. 类型安全
- **TypeBox**: 运行时类型检查
- **TypeScript**: 编译时类型检查

### 4. 资源热重载
- **reload 机制**: 支持动态更新资源
- **开发友好**: 无需重启即可测试更改

## 配置系统

### 环境变量
```bash
# API 密钥
DEEPSEEK_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here

# 其他配置
PI_AGENT_DIR=~/.pi/agent
PI_CWD=/path/to/project
```

### 配置文件
```
~/.pi/agent/
├── auth.json          # 认证信息
├── models.json        # 模型配置
├── settings.json      # 用户设置
└── extensions/        # 用户扩展
```

## 开发扩展

### Extension 结构
```typescript
// my-extension.ts
import { Type } from "@sinclair/typebox";

export const myExtension: ExtensionFactory = (pi) => {
  // 1. 注册工具
  pi.tool("my_tool", {
    label: "My Tool",
    description: "A custom tool",
    parameters: Type.Object({
      param: Type.String(),
    }),
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      // 工具逻辑
      return { 
        content: [{ type: "text", text: "Result" }], 
        details: {} 
      };
    },
  });

  // 2. 注册命令
  pi.command("my_command", {
    description: "My command",
    handler: async (ctx) => {
      await ctx.ui.notify("Command executed", "info");
    },
  });

  // 3. 注册事件处理器
  pi.on("session_start", async (event, ctx) => {
    console.log("Session started:", event.cwd);
  });
};
```

### 工具返回值结构
```typescript
{
  content: [
    {
      type: "text",  // 或 "image"
      text: string,  // 文本内容
      // 或 data: string (base64), mimeType: string (对于图像)
    }
  ],
  details: {
    // 任意元数据
    api: "GitHub",
    count: 10,
    duration: "0.5s"
  }
}
```

## 最佳实践

### 1. 工具设计
- **单一职责**: 每个工具只做一件事
- **良好文档**: 提供清晰的描述和参数说明
- **错误处理**: 妥善处理异常情况

### 2. Extension 开发
- **模块化**: 保持扩展功能聚焦
- **配置化**: 通过标志支持配置
- **向后兼容**: 避免破坏性更改

### 3. 性能考虑
- **懒加载**: 按需加载资源
- **缓存**: 缓存频繁访问的数据
- **异步处理**: 避免阻塞主线程

## 故障排除

### 常见问题

#### 1. 工具未找到
- 检查工具名称拼写
- 确认工具已正确注册
- 查看扩展是否成功加载

#### 2. Extension 加载失败
- 检查扩展文件路径
- 查看错误日志
- 确认依赖已安装

#### 3. API 调用失败
- 验证 API 密钥
- 检查网络连接
- 查看 API 服务状态

### 调试技巧
```typescript
// 启用详细日志
process.env.DEBUG = "pi:*";

// 检查加载的资源
console.log(resourceLoader.getExtensions());
console.log(resourceLoader.getSkills());
```

## 总结

pi-coding-agent 是一个**模块化、可扩展的 AI 代理框架**，具有以下特点：

1. **清晰的架构分层**: 各组件职责明确
2. **强大的扩展系统**: 支持功能插件化
3. **灵活的工具系统**: 内置、自定义、扩展工具分层
4. **完整的事件系统**: 支持生命周期管理
5. **类型安全**: TypeScript + TypeBox 双重保障
6. **开发友好**: 热重载、良好文档、调试支持

这个架构设计使得框架既适合快速原型开发，也适合构建复杂的企业级应用。