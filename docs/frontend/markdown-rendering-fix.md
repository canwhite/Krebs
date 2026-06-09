# Markdown 渲染优化修复记录

## 问题背景

在前端聊天界面中，AI 助手返回的 markdown 内容显示不正常，主要表现为：

- 列表格式混乱，无法正确渲染
- 粗体、斜体等格式显示异常
- 标题层级不清晰
- 流式输出时格式错乱

## 根本原因分析

### 1. HTML 转义顺序错误（原始问题）

### 2. 流式更新时的解析不稳定

**问题场景：**

```tsx
case "text_delta":
  // 每次追加内容
  { ...msg, content: msg.content + data.delta }
```

当内容不完整时：

- 第1次：`这是**粗体` → marked 解析失败或产生错误输出
- 第2次：`这是**粗体**文本` → 解析正确

这导致流式输出时 HTML 结构不断变化，造成显示闪烁和格式混乱。

流式更新时 markdown 解析不稳定 - 内容不完整时（如 \*\*粗体 未闭合），unified 解析可能产生错误输出。

当前 StreamingMarkdown 组件在每次 content 变化时都调用 processSync 解析，对于不完整的 markdown 会出问题。

解决方案思路：

1. 流式过程中保持原始文本
2. 收到 message_end / response_end 时一次性渲染完整 markdown

需要我修复吗？确认下场景：

- 流式输出时：显示原始文本或简单转义
- 输出完成后：正常渲染 markdown
