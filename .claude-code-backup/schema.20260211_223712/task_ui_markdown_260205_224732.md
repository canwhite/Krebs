# Task: 优化UI Chat部分Markdown展示与复制功能

**任务ID**: task_ui_markdown_260205_224732
**创建时间**: 2026-02-05
**状态**: 已完成 ✅
**目标**: 为Krebs UI的chat部分添加更好的markdown渲染和复制按钮功能

## 最终目标
- [x] 分析当前chat组件的markdown渲染方式
- [x] 安装并集成markdown渲染库（marked + DOMPurify）
- [x] 创建带复制按钮的markdown展示组件
- [x] 为每个消息添加"复制文本"和"复制Markdown"两个按钮
- [x] 确保按钮不影响回答正文的布局和显示

## 拆解步骤

### 1. 项目分析与准备
- [x] 1.1 检查 ui/package.json 了解当前依赖
- [x] 1.2 分析 krebs-chat.ts 中现有的 markdown 渲染逻辑（第294-302行）
- [x] 1.3 确定需要添加的npm包

### 2. 安装依赖
- [x] 2.1 marked (markdown解析器) - 已安装 ^17.0.1
- [x] 2.2 DOMPurify (XSS防护) - 已安装 ^3.3.1
- [x] 2.3 验证安装成功

### 3. 创建Markdown展示组件
- [x] 3.1 创建 `src/ui/components/krebs-markdown.ts` 组件
- [x] 3.2 实现markdown渲染逻辑
- [x] 3.3 添加代码高亮样式
- [x] 3.4 添加复制文本按钮
- [x] 3.5 添加复制Markdown按钮
- [x] 3.6 实现复制到剪贴板功能
- [x] 3.7 添加复制成功提示

### 4. 更新Chat组件
- [x] 4.1 导入新的 krebs-markdown 组件
- [x] 4.2 替换现有的 renderMessageContent 方法
- [x] 4.3 确保样式不影响消息布局
- [x] 4.4 测试响应式布局

### 5. 样式优化
- [x] 5.1 添加代码块样式
- [x] 5.2 添加复制按钮悬停效果
- [x] 5.3 确保按钮不遮挡内容
- [x] 5.4 移动端适配

### 6. 测试
- [x] 6.1 构建测试通过
- [x] 6.2 markdown渲染效果验证
- [x] 6.3 复制功能实现

## 实现内容

### 创建的新文件
1. **krebs-markdown.ts** - Markdown展示组件
   - 使用 marked 库解析markdown
   - 使用 DOMPurify 防止XSS攻击
   - 提供"复制文本"和"复制MD"两个按钮
   - 按钮hover时显示，不影响正文
   - 支持代码高亮样式（暗色主题）
   - 完整的markdown语法支持（标题、列表、链接、表格、引用等）

### 修改的文件
1. **krebs-chat.ts** - Chat组件
   - 导入 KrebsMarkdown 组件
   - 替换旧的简单正则渲染方式
   - 删除 renderMessageContent 方法
   - 优化用户消息的markdown样式

2. **krebs-app.ts** - 应用入口
   - 添加 krebs-markdown 组件的导入

## 功能特性

### 1. Markdown渲染
- ✅ GitHub风格的Markdown（GFM）
- ✅ 代码块语法（```）
- ✅ 行内代码（`code`）
- ✅ 标题（# ## ###）
- ✅ 列表（有序、无序）
- ✅ 链接和图片
- ✅ 引用块
- ✅ 表格
- ✅ 粗体、斜体、删除线

### 2. 复制功能
- ✅ **复制文本** - 智能去除markdown语法，保留纯文本
- ✅ **复制MD** - 复制原始markdown源码
- ✅ 复制成功反馈（2秒后自动恢复）
- ✅ 兼容性回退机制（支持旧浏览器）

### 3. 样式设计
- ✅ 代码块暗色主题（#1e1e1e背景）
- ✅ 按钮悬停时显示（不干扰阅读）
- ✅ 响应式设计（移动端适配）
- ✅ 用户消息特殊样式（深色背景上的白色文字）
- ✅ 复制按钮现代化设计（带图标）

### 4. 安全性
- ✅ DOMPurify清理HTML（防止XSS）
- ✅ 安全的复制功能

## 构建结果
```
✓ 35 modules transformed.
✓ built in 204ms
```

## 下一步建议
1. 如果需要代码语法高亮，可以考虑集成 highlight.js 或 prism.js
2. 可以添加 Mermaid 图表支持（如果需要流程图、时序图等）
3. 可以添加 LaTeX 数学公式支持（如果需要数学公式渲染）

## 当前进度
✅ 所有任务已完成！

## 下一步行动
功能已完成，可以启动开发服务器测试：
```bash
cd /Users/zack/Desktop/Krebs/ui
npm run dev
```
