# Markdown 渲染优化 - AST 方案

## 问题
之前使用 `react-markdown` + `flushSync` + `createRoot` 动态渲染，存在以下问题：

1. **flushSync 警告** - 在 `useEffect` 中调用 `flushSync` 违反 React 规则
2. **性能开销** - 每次内容变化都创建新的 root 渲染
3. **重复解析** - 相同内容重复解析 Markdown

## 解决方案
改用 `unified` + `remark` + `rehype` 直接生成 AST，缓存解析结果。

## 技术栈
```bash
bun add unified remark-parse remark-rehype rehype-react hast-util-to-jsx-runtime
```

## 实现代码

```tsx
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeReact from 'rehype-react';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { jsx, jsxs } from 'react/jsx-runtime';

// AST processor 全局单例
const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeHighlight)
  .use(rehypeReact, { jsx, jsxs, Fragment: React.Fragment });

// AST 缓存
const astCache = new Map<string, React.ReactNode>();

const StreamingMarkdown = memo(function StreamingMarkdown({
  content,
}: {
  content: string;
}) {
  const ast = useMemo(() => {
    if (astCache.has(content)) {
      return astCache.get(content);
    }
    try {
      const result = markdownProcessor.processSync({ value: content }).result;
      astCache.set(content, result);
      return result;
    } catch (e) {
      console.error('Markdown parse error:', e);
      return <span className="error">{content}</span>;
    }
  }, [content]);

  return <div className="markdown-body">{ast}</div>;
});
```

## 优势
1. **无 React 警告** - 不需要 `flushSync` 和 `createRoot`
2. **性能优化** - AST 缓存，相同内容不重复解析
3. **直接渲染** - 返回 React 节点，无需二次挂载
4. **可扩展** - 可以分析 AST 做自定义处理

## 移除依赖
```bash
bun remove react-markdown
```

## flushSync 正确用法
`flushSync` 仅用于**事件处理器**中，强制同步更新 DOM：

```tsx
// ✅ 正确
const handleClick = () => {
  flushSync(() => {
    setCount(count + 1);
  });
  // DOM 已更新，可以直接读取
  const element = document.getElementById('result');
};

// ❌ 错误
useEffect(() => {
  flushSync(() => setState(1)); // React 已在渲染中
}, []);
```

## 文件修改
- `frontend/chat.tsx` - 替换 Markdown 渲染逻辑
