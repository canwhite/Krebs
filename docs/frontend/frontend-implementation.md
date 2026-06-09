# Krebs 前端实现详解

## 1. 前端技术栈

| 类别 | 技术 |
|------|------|
| UI 框架 | React 18 + TypeScript |
| 构建工具 | Bun（运行时兼构建工具） |
| Markdown 渲染 | unified → remark-parse → remark-gfm → remark-rehype → rehype-highlight → rehype-react |
| 实时通信 | WebSocket |
| 样式方案 | CSS 内嵌于 HTML `<style>` 标签 |

### 1.1 依赖概览

- `react` / `react-dom`: UI 组件库
- `unified` / `remark-parse` / `remark-gfm` / `remark-rehype`: Markdown → AST 解析流水线
- `rehype-highlight`: 代码高亮
- `rehype-react`: AST → React 组件渲染

---

## 2. 静态文件服务机制

### 2.1 服务架构

Bun 同时承担 HTTP 服务器和前端构建工具的双重职责：

```
Bun.serve()
├── HTTP 路由
│   ├── GET /              → 返回 chat.html
│   ├── GET /frontend/*    → 返回静态文件（.tsx 被动态转译）
│   └── /api/*             → REST API
└── WebSocket /ws           → Agent 会话通信
```

### 2.2 前端文件服务流程

**路径**: `server/index.ts` 第 153–186 行

```typescript
if (url.pathname.startsWith("/frontend/")) {
  const filePath = "." + url.pathname;
  const file = Bun.file(filePath);

  if (await file.exists()) {
    // TSX/JSX 文件需要动态转译
    if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
      const transpiled = await Bun.build({
        entrypoints: [filePath],
        target: "browser",
        minify: false,
        jsx: {
          runtime: "automatic",
          importSource: "react",
        },
      });
      return new Response(transpiled.outputs[0], {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    // 其他静态文件直接返回
    return new Response(file, { headers: { "Content-Type": getContentType(filePath) } });
  }
}
```

**关键机制**:
1. 所有 `/frontend/*` 请求由 Bun 直接处理
2. `.tsx`/`.jsx` 文件通过 `Bun.build()` 实时转译为 JavaScript
3. 转译时使用 `jsx: { runtime: "automatic", importSource: "react" }`（React 17+ 新 JSX 转换）
4. 转译后的 JS 通过 `<script type="module">` 被浏览器加载

### 2.3 HTML 入口

**路径**: `frontend/chat.html`

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Krebs Chat</title>
    <!-- KaTex 数学公式支持 -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.40/dist/katex.min.css" />
    <!-- highlight.js 代码高亮主题 -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/atom-one-dark.min.css" />
    <style>/* 所有 CSS 样式 */</style>
  </head>
  <body>
    <div id="app"></div>
    <!-- 直接引用 TSX 文件，Bun 会自动转译 -->
    <script type="module" src="./frontend/chat.tsx"></script>
  </body>
</html>
```

**特点**:
- 所有 CSS 样式内联在 `<style>` 标签中，无独立 CSS 文件
- 外部 CDN 引入 KaTeX 和 highlight.js
- `<div id="app">` 作为 React 根节点
- `<script type="module" src="./frontend/chat.tsx">` 触发 Bun 动态转译

---

## 3. 核心组件结构

### 3.1 文件结构

```
frontend/
├── chat.html    # HTML 入口 + 内联 CSS
└── chat.tsx     # 主 React 组件
```

### 3.2 组件树

```
App (根组件)
├── Header
│   ├── StatusDot（连接状态指示）
│   ├── Title
│   ├── SessionId
│   └── HistoryDropdown（会话历史）
├── MessageList（滚动容器）
│   └── Message（按 role 渲染）
│       ├── user         → 蓝色渐变背景
│       ├── assistant    → 紫色渐变 avatar
│       ├── tool         → 黄色 avatar，左边框
│       └── thinking     → 可折叠思考过程
└── InputArea
    ├── TextInput
    └── SendButton / StopButton
```

### 3.3 状态管理

纯 React `useState` + `useRef`，无外部状态库：

```typescript
// 核心状态
const [messages, setMessages] = useState<Message[]>([]);
const [input, setInput] = useState("");
const [isConnected, setIsConnected] = useState(false);
const [sessionId, setSessionId] = useState<string>("");

// Refs（避免闭包陷阱）
const wsRef = useRef<WebSocket | null>(null);
const streamingMessageIdRef = useRef<string | null>(null);
const messagesContainerRef = useRef<HTMLDivElement>(null);
```

---

## 4. Markdown 渲染流程

### 4.1 unified 流水线

```typescript
const markdownProcessor = unified()
  .use(remarkParse)          // Markdown → MD AST
  .use(remarkGfm)           // 支持 GFM（表格、任务列表等）
  .use(remarkRehype)        // MD AST → HTML AST
  .use(rehypeHighlight)     // 代码高亮
  .use(rehypeReact, {       // HTML AST → React 组件
    jsx, jsxs, Fragment: React.Fragment
  });
```

### 4.2 StreamingMarkdown 组件

**路径**: `frontend/chat.tsx` 第 118–142 行

```typescript
const StreamingMarkdown = memo(function StreamingMarkdown({ content }: { content: string }) {
  const ast = useMemo(() => {
    const processedContent = preprocessMarkdown(content);
    if (astCache.has(processedContent)) {
      return astCache.get(processedContent);
    }
    const result = markdownProcessor.processSync({ value: processedContent }).result;
    astCache.set(processedContent, result);
    return result;
  }, [content]);

  return <div className="markdown-body">{ast}</div>;
});
```

**特点**:
- 使用 `useMemo` 缓存 AST 结果
- `astCache` Map 存储已解析的 Markdown → AST 映射
- `preprocessMarkdown()` 修复常见格式问题（如 `##标题` → `## 标题`）
- 基于 AST 渲染，**无 `dangerouslySetInnerHTML`**（安全）

---

## 5. WebSocket 通信协议

### 5.1 连接建立

```
1. 页面加载 → fetch("/api/auth/internal") → 设置 Cookie
2. new WebSocket("/ws")
3. ws.onopen → ws.send({ type: "auth" })
4. 服务器返回 { type: "auth_success" } → isConnected = true
```

### 5.2 消息类型定义

```typescript
type WSMessage =
  | { type: "connected"; sessionId: string }
  | { type: "message_start" }           // AI 开始回复
  | { type: "text_delta"; delta: string } // 流式文本片段
  | { type: "thinking_delta"; delta: string } // 思考过程片段
  | { type: "think_block"; content: string } // 完整思考块
  | { type: "tool_call_start"; tool: string; contentIndex: number }
  | { type: "tool_call_delta"; tool: string; path: string; content: string }
  | { type: "tool_start"; tool: string; args: any }
  | { type: "tool_end"; tool: string; success: boolean; result: string }
  | { type: "turn_end"; content: string }   // 单轮结束，完整内容
  | { type: "message_end" }          // AI 结束回复
  | { type: "error"; message: string };
```

### 5.3 流式消息处理

```typescript
// text_delta: 累积文本片段
if (data.type === "text_delta") {
  if (!streamingMessageIdRef.current) {
    // 创建新流式消息
    streamingMessageIdRef.current = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: streamingMessageIdRef.current,
      role: "assistant",
      content: data.delta,
      isStreaming: true,
    }]);
  } else {
    // 追加到现有消息
    setMessages(prev => prev.map(msg =>
      msg.id === streamingMessageIdRef.current
        ? { ...msg, content: msg.content + data.delta }
        : msg
    ));
  }
}

// turn_end: 用完整内容替换流式消息
if (data.type === "turn_end") {
  setMessages(prev => prev.map(msg =>
    msg.id === streamingMessageIdRef.current
      ? { ...msg, content: data.content, isStreaming: false }
      : msg
  ));
}
```

---

## 6. 认证机制

### 6.1 内部认证（本地前端）

**路径**: `server/routes/auth.ts`

```typescript
// 页面加载时调用
fetch("/api/auth/internal")
```

内部认证流程：
1. 服务器检查 `.env` 中的 `TOKEN`
2. 未设置时自动生成随机 token
3. 设置 `api_token` HttpOnly Cookie
4. WebSocket 发送 `{ type: "auth" }` 完成认证

### 6.2 API Token 验证

所有 `/api/*` 接口（除 `/api/auth`）需要 Token 验证：

```typescript
const token = extractToken(req); // 从 Cookie 或 Authorization header
if (!isValidToken(token)) {
  return Response.json({ error: "未授权" }, { status: 401 });
}
```

---

## 7. 样式实现

### 7.1 CSS 内嵌方式

所有样式写在 `chat.html` 的 `<style>` 标签中（约 620 行），主要类别：

- **布局**: Flexbox 为主，全屏 `height: 100vh`
- **颜色**: 暗色主题，`#1a1a2e` 背景，`#16213e` 卡片，`#667eea` / `#764ba2` 渐变
- **动画**: `fadeIn` 消息出现，`pulse` 状态点，`spin` 加载动画
- **消息样式**: 按 role（user/assistant/tool/thinking）差异化渲染

### 7.2 关键样式类

| 类名 | 用途 |
|------|------|
| `.message.user` | 用户消息，右侧，蓝色渐变 |
| `.message.assistant` | AI 消息，左侧，紫色渐变 avatar |
| `.message.tool` | 工具调用，黄色 avatar，左边框 |
| `.thinking-box` | 可折叠思考过程 |
| `.input-container` | 输入区域，固定底部 |

---

## 8. 会话历史管理

### 8.1 加载会话列表

```typescript
const loadSessions = async () => {
  const res = await fetch("/api/sessions/list");
  const data = await res.json();
  setSessions(data.sessions || []);
};
```

### 8.2 切换会话

```typescript
const loadSessionMessages = async (sessionItem: any) => {
  const res = await fetch(`/api/sessions/${sessionItem.id}`);
  const data = await res.json();
  // 加载消息到 UI
  setMessages(loadedMessages);
  // 通知后端切换 session
  ws.send(JSON.stringify({ type: "switch_session", sessionId: data.sessionId }));
};
```

### 8.3 删除会话

```typescript
const deleteSession = async (sessionIdToDelete: string, e: any) => {
  e.stopPropagation();
  await fetch(`/api/sessions/${sessionIdToDelete}`, { method: "DELETE" });
  loadSessions(); // 刷新列表
};
```
