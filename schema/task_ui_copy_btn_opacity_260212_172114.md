# Task: 优化复制按钮透明度效果

**任务ID**: task_ui_copy_btn_opacity_260212_172114
**创建时间**: 2026-02-12
**状态**: 进行中
**目标**: 调整复制按钮的透明度，使其默认状态几乎不可见，hover时完全显示并变蓝

## 最终目标
- 默认状态：复制按钮高透明度（几乎不可见）
- hover 状态：完全显示并变为蓝色

## 拆解步骤
### 1. 修改样式
- [x] 读取 krebs-markdown.ts 组件
- [ ] 修改 `.copy-buttons` 的默认 opacity
- [ ] 修改 `.copy-btn` 的默认样式
- [ ] 调整 hover 状态样式

## 当前进度
### ✅ 已完成: 修改样式

已完成的修改：
1. ✅ `.copy-buttons` 默认 opacity: 0.3（之前是 0）
2. ✅ `.copy-btn` 默认样式：
   - opacity: 0.7（添加透明度）
   - background-color: rgba(255, 255, 255, 0.6)（降低背景不透明度）
3. ✅ `.copy-btn:hover` 状态：
   - background-color: var(--color-primary)（变蓝）
   - opacity: 1（完全显示）
4. ✅ 同步修改了 `:host([is-user="true"])` 状态的样式

## 效果说明
- **默认状态**：按钮组 opacity 为 0.3，按钮本身 opacity 为 0.7，背景半透明
- **hover 到 wrapper**：按钮组 opacity 变为 1，完全显示
- **hover 到按钮**：背景变蓝（primary color），opacity 为 1

## 下一步行动
任务已完成，等待用户确认效果。
