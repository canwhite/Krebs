# krebs

一个精简的 AI Agent 框架

## 架构设计

本项目采用分层架构，去除了渠道层（channel），专注于核心功能：

```
┌─────────────────────────────────────────┐
│           Gateway Layer                 │
│  (HTTP/WebSocket Server + Protocol)     │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│           Agent Layer                   │
│  (Agent Core + Tools + Skills)          │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Provider Layer                  │
│  (Anthropic, OpenAI, etc.)              │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│         Storage Layer                   │
│  (Markdown File Storage)                │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│        Lane Scheduler                   │
│  (Command Queue + Concurrency Control)  │
└─────────────────────────────────────────┘
```

## 核心层次

### 1. Gateway 层 (`src/gateway/`)

- **协议定义**: 定义请求/响应格式
- **HTTP 服务器**: REST API 接口
- **WebSocket 服务器**: 实时双向通信

### 2. Agent 层 (`src/agent/`)

- **核心**: Agent 实现和管理
- **工具**: 可扩展的工具系统
- **技能**: 触发式技能系统

### 3. Provider 层 (`src/provider/`)

- **基础接口**: LLM 提供者抽象
- **DeepSeek**: 默认 Provider，性价比高
- **Anthropic**: Claude 模型支持
- **OpenAI**: GPT 模型支持

### 4. Storage 层 (`src/storage/`)

- **Markdown 存储**: 会话和文档管理
- **Frontmatter 支持**: 元数据管理

### 5. Lane 调度系统 (`src/scheduler/`)

- **命令队列**: 异步任务调度
- **并发控制**: Lane 隔离和限流

## 快速开始

### 安装依赖

\`\`\`bash
npm install
\`\`\`

### 配置环境变量

复制 `.env.example` 到 `.env` 并配置：
\`\`\`bash
cp .env.example .env
\`\`\`

必需的配置：
\`\`\`env

# 默认使用 DeepSeek（推荐）

DEEPSEEK_API_KEY=your_deepseek_key

# 可选：配置其他 Provider

ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
\`\`\`

**DeepSeek 获取 API Key：**

1. 访问 [DeepSeek 开放平台](https://platform.deepseek.com/)
2. 注册并创建 API Key
3. 复制到 `.env` 文件的 `DEEPSEEK_API_KEY`

### 启动服务

\`\`\`bash
npm run dev
\`\`\`

### 构建

\`\`\`bash
npm run build
\`\`\`

## API 使用示例

### 发送聊天消息

\`\`\`bash
curl -X POST http://localhost:3000/api/chat \\
-H "Content-Type: application/json" \\
-d '{
"id": "test-001",
"method": "chat.send",
"params": {
"agentId": "default",
"sessionId": "session-001",
"message": "你好！"
}
}'
\`\`\`

### WebSocket 连接

\`\`\`javascript
const ws = new WebSocket("ws://localhost:3001");

ws.onopen = () => {
ws.send(JSON.stringify({
id: "ws-001",
method: "chat.send",
params: {
agentId: "default",
sessionId": "session-001",
message: "你好！",
stream: true
}
}));
};

ws.onmessage = (event) => {
const data = JSON.parse(event.data);
console.log("Received:", data);
};
\`\`\`

## 项目结构

```
krebs/
├── src/
│ ├── agent/ # Agent 层
│ │ ├── core/ # 核心 Agent 逻辑
│ │ ├── tools/ # 工具系统
│ │ └── skills/ # 技能系统
│ ├── gateway/ # Gateway 层
│ │ ├── protocol/ # 协议定义
│ │ └── server/ # 服务器实现
│ ├── provider/ # Provider 层
│ │ ├── base.ts # 基础接口
│ │ ├── deepseek.ts # DeepSeek 实现（默认）
│ │ ├── anthropic.ts # Anthropic 实现
│ │ └── openai.ts # OpenAI 实现
│ ├── scheduler/ # 调度系统
│ │ └── lanes.ts # Lane 调度
│ ├── shared/ # 共享模块
│ │ ├── config.ts # 配置管理
│ │ └── logger.ts # 日志系统
│ ├── storage/ # 存储层
│ │ └── markdown/ # MD 存储
│ ├── types/ # 类型定义
│ └── index.ts # 主入口
├── config/ # 配置文件
├── data/ # 数据目录
├── package.json
├── tsconfig.json
└── README.md
```

## 特性

- ✅ 精简架构，专注核心功能
- ✅ 默认使用 DeepSeek（高性价比）
- ✅ 支持 Anthropic Claude 和 OpenAI GPT
- ✅ Markdown 文件存储（带 Frontmatter）
- ✅ 可扩展的工具系统
- ✅ 触发式技能系统
- ✅ Lane 并发控制
- ✅ HTTP + WebSocket 双协议支持
- ✅ 流式响应支持

## 支持的模型

### DeepSeek（默认）

- `deepseek-chat` - 通用对话模型
- `deepseek-coder` - 代码专用模型

### Anthropic Claude

- `claude-3-5-sonnet-20241022`
- `claude-3-5-haiku-20241022`
- `claude-3-opus-20240229`

### OpenAI GPT

- `gpt-4o`
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-3.5-turbo`

## 开发

### 运行开发模式

\`\`\`bash
npm run dev
\`\`\`

### 运行测试

\`\`\`bash
npm test
\`\`\`

### 代码检查

\`\`\`bash
npm run lint
npm run format
\`\`\`

## 参考

本项目学习和借鉴了 [krebs-ds](https://github.com/clawdbot/krebs-ds) 的设计思想。

## 许可证

MIT
