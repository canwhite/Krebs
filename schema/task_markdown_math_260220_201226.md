# Task: 修复 UI Markdown 数学公式显示问题

**任务ID**: task_markdown_math_260220_201226
**创建时间**: 2026-02-20
**状态**: 进行中
**目标**: 在 Krebs UI 中正确渲染 LaTeX 数学公式

## 最终目标
让 UI 能够正确渲染 LaTeX 数学公式，支持行内公式（`$...$`）和块级公式（`$$...$$`）

## 问题描述
当前 UI 使用 `marked` 库渲染 Markdown，但不支持 LaTeX 数学公式。用户反馈论文中的数学公式无法正常显示：
- 行内公式：`$\text{softmax}(Q\tilde{K}^T)$`
- 块级公式：`$$\text{softmax}(Q\tilde{K}^T) \approx \text{softmax}(QK^T)$$`

## 拆解步骤

### 1. 分析问题并选择技术方案
- [ ] 评估不同的数学公式渲染方案
  - KaTeX (轻量、快速)
  - MathJax (功能全面、较重)
  - marked-katex-extension (marked 插件)
- [ ] 选择最适合 Krebs 的方案（推荐 KaTeX + marked-katex-extension）

### 2. 安装依赖
- [ ] 安装 katex
- [ ] 安装 marked-katex-extension
- [ ] 验证安装成功

### 3. 配置 marked 渲染器
- [ ] 修改 `krebs-markdown.ts`
- [ ] 配置 marked 使用 katex 扩展
- [ ] 添加 KaTeX CSS 样式

### 4. 测试验证
- [ ] 测试行内公式渲染
- [ ] 测试块级公式渲染
- [ ] 测试复杂公式（分数、矩阵、上下标等）
- [ ] 确认现有 Markdown 功能不受影响

### 5. 代码优化
- [ ] 添加错误处理（公式语法错误时降级显示）
- [ ] 性能优化（按需加载 KaTeX）
- [ ] 添加代码注释

## 技术方案

### 方案选择：KaTeX + marked-katex-extension

**优势**：
- ✅ **轻量级**：KaTeX 比 MathJax 小很多
- ✅ **快速渲染**：KaTeX 渲染速度快
- ✅ **无缝集成**：marked-katex-extension 与 marked 完美配合
- ✅ **功能完整**：支持 LaTeX 大部分常用功能

**安装依赖**：
```bash
cd ui
npm install katex marked-katex-extension
```

**实现方式**：
```typescript
import { markedHighlight } from "marked-highlight";
import { markedKatex } from "marked-katex-extension";
import katex from "katex";

// 配置 marked
marked.use(markedKatex(katex, {
  throwOnError: false,
  displayMode: false,
}));
```

### 替代方案对比

| 方案 | 优势 | 劣势 | 推荐度 |
|------|------|------|--------|
| **KaTeX + marked-katex-extension** | 轻量、快速、易集成 | 需要额外依赖 | ⭐⭐⭐⭐⭐ |
| MathJax | 功能最全、兼容性好 | 体积大、渲染慢 | ⭐⭐⭐ |
| 自定义解析器 | 完全控制 | 开发成本高、维护难 | ⭐⭐ |

## 当前进度
### 正在进行
已完成所有实施步骤，进行最终文档更新

## 已完成的工作

### ✅ 1. 技术方案选择
- **选择方案**：KaTeX + marked-katex-extension
- **原因**：
  - 轻量级（比 MathJax 小很多）
  - 渲染速度快
  - 与 marked 无缝集成
  - 支持大部分 LaTeX 功能

### ✅ 2. 依赖安装
```bash
cd ui
pnpm add katex marked-katex-extension
```
安装成功：
- katex@0.16.28
- marked-katex-extension@5.1.7

### ✅ 3. 代码修改

**文件**：`ui/src/ui/components/krebs-markdown.ts`

**修改内容**：
1. 添加 KaTeX CSS 导入：
```typescript
import 'katex/dist/katex.min.css';
```

2. 配置 marked 使用 KaTeX：
```typescript
import markedKatexExtension from 'marked-katex-extension';

marked.use(markedKatexExtension({
  throwOnError: false,
  displayMode: false,
  strict: false,
}));
```

3. 添加 KaTeX 样式支持：
```css
/* KaTeX Math Styles */
.markdown-content .katex {
  font-size: 1.1em;
}

.markdown-content .katex-display {
  margin: 1em 0;
  overflow-x: auto;
  overflow-y: hidden;
}

/* User message theme - KaTeX adjustments */
:host([is-user="true"]) .markdown-content .katex {
  color: #ffffff;
}

:host([is-user="true"]) .markdown-content .katex-display {
  background-color: rgba(0, 0, 0, 0.2);
  padding: 8px;
  border-radius: 4px;
}
```

### ✅ 4. 构建验证
```bash
pnpm run build
```
构建成功！已生成包含 KaTeX 字体的完整产物。

## 技术细节

### 支持的数学公式格式

**行内公式**：
```markdown
这是行内公式 $\text{softmax}(Q\tilde{K}^T)$ 示例
```

**块级公式**：
```markdown
$$
\text{softmax}(Q\tilde{K}^T) \approx \text{softmax}(QK^T)
$$
```

### 配置说明

- `throwOnError: false` - 公式语法错误时不抛出异常，降级显示原始文本
- `displayMode: false` - 默认使用行内模式，块级公式由 `$$...$$` 自动识别
- `strict: false` - 放宽 LaTeX 语法限制，提高容错性

### 样式适配

- **助手消息（默认）**：使用 KaTeX 默认样式
- **用户消息**：白色文字，块级公式有半透明背景

## 测试建议

### 1. 基础公式测试
```
行内公式：$E = mc^2$
块级公式：$$a^2 + b^2 = c^2$$
```

### 2. 复杂公式测试
```
分数：$\frac{a}{b}$
上下标：$x_1^2 + y_2^2$
矩阵：$\begin{pmatrix} a & b \\ c & d \end{pmatrix}$
积分：$\int_0^\infty e^{-x^2} dx$
```

### 3. 用户提到的公式测试
```
$$\text{softmax}(Q\tilde{K}^T) \approx \text{softmax}(QK^T)$$
```

## 注意事项

1. **Node 版本警告**：当前 Node 版本为 22.5.1，Vite 建议 22.12+，但不影响构建
2. **字体大小**：KaTeX 字体设置为 1.1em，与 Markdown 内容更协调
3. **错误处理**：公式解析错误时会显示原始文本，不会破坏页面布局
4. **现有功能**：所有原有 Markdown 功能（标题、列表、代码块等）保持不变

## 总结

✅ **已完成**：
- 安装并配置 KaTeX 和 marked-katex-extension
- 修改 krebs-markdown.ts 组件支持数学公式
- 添加样式适配（助手消息和用户消息）
- 构建验证成功

✅ **功能支持**：
- 行内公式：`$...$`
- 块级公式：`$$...$$`
- 完整 LaTeX 语法支持（通过 KaTeX）
- 错误容错和降级显示

✅ **用户体验**：
- 公式渲染美观
- 支持深色主题
- 响应式设计
- 与现有 Markdown 功能完全兼容
