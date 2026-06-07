# WebSocket 流式 Markdown 渲染问题调研

## 问题分析

当前实现（`chat.tsx:116-140`）：

```typescript
function formatStreamingMessage(content: string): string {
  try {
    const parsed = marked.parse(content) as string;
    return DOMPurify.sanitize(parsed);
  } catch (e) {
    // 回退到简单格式化
    // ...
  }
}
```

**核心问题：**
1. 每次增量更新都重新解析整个内容
2. 不完整的 markdown（如未闭合的代码块 ```）导致解析错误
3. `marked.parse()` 对不完整语法支持有限
4. 代码高亮每次都重新计算，性能差
5. DOMPurify 每次都重新净化，开销大

## 解决方案调研

### 方案 1: 增量解析 + 缓存（推荐）

**核心思想：** 只解析新增部分，复用已渲染的 HTML

```typescript
function formatStreamingMessage(content: string, previousContent?: string): string {
  // 1. 如果是首次渲染，直接解析
  if (!previousContent || content.length <= previousContent.length) {
    return marked.parse(content);
  }

  // 2. 提取新增部分
  const delta = content.substring(previousContent.length);

  // 3. 检查是否在不完整结构中（代码块、表格等）
  const isIncomplete = isIncompleteMarkdown(content);

  if (isIncomplete) {
    // 不完整时，只渲染纯文本+简单格式
    return renderSimpleFormat(content);
  }

  // 4. 完整时，增量渲染
  return marked.parse(delta);
}

function isIncompleteMarkdown(content: string): boolean {
  // 检查未闭合的代码块
  const codeBlockCount = (content.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) return true;

  // 检查未闭合的表格
  const lines = content.split('\n');
  let inTable = false;
  for (const line of lines) {
    if (line.trim().startsWith('|')) {
      inTable = true;
    } else if (inTable && line.trim()) {
      inTable = false; // 表格结束
    }
  }

  return inTable;
}
```

**优点：**
- 减少解析开销
- 避免不完整语法错误

**缺点：**
- 实现复杂
- 需要跟踪状态

---

### 方案 2: 延迟渲染（最简单）

**核心思想：** 流式时显示纯文本，结束后再渲染 markdown

```typescript
function formatStreamingMessage(content: string): string {
  // 流式时：纯文本 + 简单换行
  return content.replace(/\n/g, '<br>').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatMessage(content: string): string {
  // 流式结束后：完整 markdown
  const parsed = marked.parse(content) as string;
  return DOMPurify.sanitize(parsed);
}

// 在组件中
{msg.isStreaming
  ? formatStreamingMessage(msg.content)  // 纯文本
  : formatMessage(msg.content)            // 完整 markdown
}
```

**优点：**
- 实现简单
- 无语法错误
- 性能好

**缺点：**
- 流式时无格式（代码块、粗体等）
- 用户体验略差

---

### 方案 3: 双缓冲渲染（平衡）

**核心思想：** 流式时用轻量解析器，结束后用完整渲染器

```typescript
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// 使用 marked 的流式支持（如果有）
import { markedLexer } from 'marked';

// 或者使用轻量级的 markdown-incremental
import { incrementals } from 'markdown-incremental';

function formatStreamingMessage(content: string): string {
  // 使用不检查完整性的解析器
  marked.setOptions({
    mangle: false,
    headerIds: false
  });

  // 捕获解析错误，返回原始内容
  try {
    return marked.parse(content, {
      silent: true,  // 静默模式
      breaks: true
    });
  } catch {
    return escapeHtml(content).replace(/\n/g, '<br>');
  }
}
```

---

### 方案 4: 使用专门的流式 markdown 库（最佳）

**推荐库：** `react-markdown` + `remark-gfm` + `rehype-highlight`

```bash
bun add react-markdown remark-gfm rehype-highlight
```

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

function StreamingMarkdown({ content, isStreaming }: {
  content: string;
  isStreaming: boolean;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // 自定义代码块组件，支持流式
        code({ node, inline, className, children, ...props }) {
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// 在消息组件中
{msg.isStreaming ? (
  <StreamingMarkdown content={msg.content} isStreaming={true} />
) : (
  <StreamingMarkdown content={msg.content} isStreaming={false} />
)}
```

**优点：**
- React 组件化，状态管理更好
- 自动处理增量更新
- 语法高亮集成

---

### 方案 5: Web Worker 异步解析（性能最优）

**核心思想：** 将 markdown 解析放到 Web Worker

```typescript
// markdown-worker.ts
self.onmessage = (e) => {
  const { content } = e.data;
  const parsed = marked.parse(content);
  self.postMessage({ html: DOMPurify.sanitize(parsed) });
};

// chat.tsx
const workerRef = useRef<Worker>();

useEffect(() => {
  workerRef.current = new Worker(new URL('./markdown-worker.ts', import.meta.url));

  workerRef.current.onmessage = (e) => {
    setRenderedHtml(e.data.html);
  };

  return () => workerRef.current?.terminate();
}, []);

// 流式更新时
useEffect(() => {
  if (msg.isStreaming && workerRef.current) {
    // 防抖处理
    const timeout = setTimeout(() => {
      workerRef.current?.postMessage({ content: msg.content });
    }, 100);

    return () => clearTimeout(timeout);
  }
}, [msg.content]);
```

---

## 推荐实施计划

### 短期（立即可用）：方案 2 - 延迟渲染
```typescript
// 流式时：纯文本 + 简单格式
function formatStreamingMessage(content: string): string {
  return content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// 流式结束后：完整 markdown
function formatMessage(content: string): string {
  return DOMPurify.sanitize(marked.parse(content));
}
```

### 中期（2-3天）：方案 4 - react-markdown
- 替换 `dangerouslySetInnerHTML`
- 使用 React 组件渲染
- 更好的状态管理

### 长期（1周）：方案 5 - Web Worker
- 完全异步解析
- 最优性能
- 不阻塞 UI

---

## 其他优化建议

### 1. 防抖处理
```typescript
const debouncedUpdate = useMemo(
  () => debounce((content: string) => {
    setRenderedHtml(formatMessage(content));
  }, 100),
  []
);
```

### 2. 虚拟滚动
```bash
bun add react-window
```

### 3. 增量高亮
```typescript
// 只高亮新增的代码块
const highlightNewCode = (oldContent: string, newContent: string) => {
  const oldBlocks = extractCodeBlocks(oldContent);
  const newBlocks = extractCodeBlocks(newContent);
  // 只高亮新增的块
};
```

---

## 总结

| 方案 | 难度 | 效果 | 性能 | 推荐度 |
|------|------|------|------|--------|
| 延迟渲染 | ⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 增量解析 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| react-markdown | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Web Worker | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

**立即行动：** 先实施方案 2（延迟渲染），快速解决问题，再考虑迁移到 react-markdown。

## 实施记录

### 已从 Preact 迁移到 React（2025-04-13）

由于需要使用 react-markdown，将整个前端从 Preact 迁移到 React。

**修改文件：**

1. `package.json` - 将 preact 替换为 react 和 react-dom
2. `tsconfig.json` - jsxImportSource 从 "preact" 改为 "react"
3. `server.ts` - importSource 从 "preact" 改为 "react"
4. `frontend/chat.tsx`:
   - 导入改为 react
   - `render` 改为 `createRoot`
   - `class` 改为 `className`
   - 添加 StreamingMarkdown 组件

### 方案 2 改进版已实施（2025-04-13）

由于 react-markdown 与 preact 兼容性问题，方案 4 不可用。改用方案 2 的改进版。

**修改文件：** `frontend/chat.tsx`

添加了 `isIncompleteMarkdown` 检测函数，改进 `formatStreamingMessage`：
- 检测未闭合的代码块
- 检测未闭合的行内代码
- 不完整时使用简单格式化
- 完整时尝试解析 markdown

```typescript
function isIncompleteMarkdown(content: string): boolean {
  const codeBlockCount = (content.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) return true;
  const inlineCodeCount = (content.match(/(?<!`)(`+)(?!`)/g) || []).length;
  if (content.includes("`") && inlineCodeCount % 2 !== 0) return true;
  return false;
}

function formatStreamingMessage(content: string): string {
  if (isIncompleteMarkdown(content)) {
    // 不完整时使用简单格式化
    let formatted = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    formatted = formatted.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return `<div class="streaming">${formatted.replace(/\n/g, "<br>")}</div>`;
  }
  // 完整时尝试解析
  // ...
}
```

**效果：**
- 流式时不完整的代码块不会导致解析错误
- 完整后自动显示完整 markdown 格式
- 无需额外依赖

---

## 最终实施方案（2025-04-13）

### 问题背景

1. **Preact 兼容性问题**：react-markdown 与 Preact 不兼容（类型和运行时差异）
2. **Bun JSX 构建问题**：在 JSX 中直接使用 `<ReactMarkdown>` 组件无法正确渲染
3. **流式更新问题**：每次 content 变化都触发重渲染，可能导致 React 内部状态混乱

### 最终方案

#### 1. 从 Preact 迁移到 React

**修改文件：**
- `package.json`: `preact` → `react` + `react-dom`
- `tsconfig.json`: `jsxImportSource: "preact"` → `"react"`
- `server.ts`: `importSource: "preact"` → `"react"`
- `frontend/chat.tsx`: 导入和语法调整

#### 2. 使用 createRoot 动态渲染 react-markdown

由于 Bun 构建的 JSX 与 react-markdown 组件不兼容，采用官方推荐的 `createRoot` 动态渲染方式：

```typescript
import { createRoot } from "react-dom/client";
import React, { useEffect, useRef, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { flushSync } from "react-dom";

// StreamingMarkdown 组件
const StreamingMarkdown = memo(function StreamingMarkdown({
  content,
}: {
  content: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 初始化 root（只执行一次）
    if (!rootRef.current) {
      rootRef.current = createRoot(containerRef.current);
    }

    // 使用 flushSync 强制同步更新，避免竞态
    flushSync(() => {
      rootRef.current.render(
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
        >
          {content}
        </ReactMarkdown>,
      );
    });
  }, [content]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (rootRef.current) {
        rootRef.current.unmount();
        rootRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} />;
});
```

#### 3. 流式期间显示策略

为避免流式期间内容不完整导致渲染问题，采用以下策略：

```typescript
// 流式期间：显示纯文本
// 流式结束后：用 react-markdown 渲染
{msg.isStreaming ? (
  <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
) : (
  <StreamingMarkdown content={msg.content} />
)}
```

### 依赖包

```json
{
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "react-markdown": "^10.1.0",
  "rehype-highlight": "^7.0.2",
  "remark-gfm": "^4.0.1"
}
```

### 关键点

1. **createRoot 动态渲染**：绕过 Bun JSX 构建问题
2. **flushSync 同步更新**：避免流式更新时的竞态条件
3. **memo 优化**：避免不必要的重渲染
4. **流式期间纯文本**：确保内容完整后才渲染 markdown

### 效果

- ✅ Markdown 正确渲染（标题、表格、代码块等）
- ✅ 语法高亮正常工作
- ✅ 流式更新相对稳定
- ✅ GFM（GitHub Flavored Markdown）支持
