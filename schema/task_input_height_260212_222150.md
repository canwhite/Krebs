# Task: 修复输入框输入时高度突然变高的问题

**任务ID**: task_input_height_260212_222150
**创建时间**: 2026-02-12
**状态**: 进行中
**目标**: 修复输入框在输入内容时高度突然增加的视觉跳动问题

## 最终目标
将输入框改为固定高度（44px），避免输入时高度变化。

## 拆解步骤

### 1. 定位问题
- [x] 1.1 查找 UI 中的输入框组件
- [x] 1.2 分析输入框的高度样式和计算逻辑
- [x] 1.3 识别导致高度突变的具体原因

### 2. 修复问题
- [x] 2.1 移除动态高度计算逻辑
- [x] 2.2 设置固定高度为 44px

### 3. 验证
- [x] 3.1 在浏览器中测试输入行为
- [x] 3.2 确认高度固定不变

## 拆解步骤

### 1. 定位问题
- [ ] 1.1 查找 UI 中的输入框组件
- [ ] 1.2 分析输入框的高度样式和计算逻辑
- [ ] 1.3 识别导致高度突变的具体原因

### 2. 修复问题
- [ ] 2.1 修改 CSS 或代码确保平滑过渡
- [ ] 2.2 测试修复效果

### 3. 验证
- [x] 3.1 在浏览器中测试输入行为
- [x] 3.2 确认高度变化平滑

## 当前进度
### 正在进行: 完成
已将输入框改为固定高度。

## 已完成的工作

### 用户需求变更
用户要求将输入框改为固定高度，而不是平滑的动态高度。

### 最终解决方案

1. **CSS 修改** (krebs-chat.ts:141-157)：
   - 移除 `min-height` 和 `max-height`
   - 设置固定 `height: 44px`
   - 移除 `transition: height 0.15s ease-out`
   - 保持 `overflow-y: auto` 以支持滚动

2. **JavaScript 简化** (krebs-chat.ts:318-320)：
   - 移除所有动态高度计算逻辑
   - `handleInput` 方法仅更新 `this.input` 状态
   - 不再操作 `target.style.height`

### 代码变更

**CSS 部分**：
```css
textarea {
  flex: 1;
  padding: var(--spacing-md);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: var(--font-size-md);
  resize: none;
  height: 44px;          /* 固定高度 */
  outline: none;
  transition: border-color 0.2s;
  overflow-y: auto;       /* 内容多时可滚动 */
  line-height: 1.5;
}
```

**JavaScript 部分**：
```typescript
private handleInput(e: Event) {
  const target = e.target as HTMLTextAreaElement;
  this.input = target.value;
  // 不再动态调整高度
}
```
