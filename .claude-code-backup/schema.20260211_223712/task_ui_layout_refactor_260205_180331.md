# Task: UI Layout Refactor - Chat & Sidebar Redesign

**任务ID**: task_ui_layout_refactor_260205_180331
**创建时间**: 2026-02-05
**状态**: 进行中
**目标**: 重构UI布局，实现聊天界面固定输入框、可滚动消息区、重新设计侧边栏交互

## 最终目标
1. **重构侧边栏为Tab导航**：左侧只显示Chat、Tools、Skills三个导航项
2. **右侧内容区Tab切换**：根据左侧选择显示对应界面（Chat/Tools/Skills）
3. **Chat界面优化**：输入框fixed在页面底部，消息内容独立滚动

## 已确认的需求
### 架构设计
- **左侧侧边栏**：导航菜单（Chat、Tools、Skills三个选项）
- **右侧主内容区**：根据选中tab切换显示
  - Chat界面：消息滚动区 + 固定输入框
  - Tools界面：所有工具的详细信息列表
  - Skills界面：所有技能的详细信息列表

## 当前进度
### 已完成: 所有实现和测试

## 拆解步骤
### 1. 创建导航侧边栏组件 ✅
- [x] 1.1 创建 krebs-sidebar-nav.ts 组件
- [x] 1.2 实现Tab切换逻辑和状态管理

### 2. 重构app.ts布局 ✅
- [x] 2.1 修改app.ts，集成新的侧边栏导航
- [x] 2.2 添加tab状态管理
- [x] 2.3 实现内容区切换逻辑

### 3. 创建Tools和Skills详情界面 ✅
- [x] 3.1 创建 krebs-tools-panel.ts 显示工具详情
- [x] 3.2 创建 krebs-skills-panel.ts 显示技能详情

### 4. 优化Chat界面 ✅
- [x] 4.1 修改krebs-chat.ts，输入框改为fixed定位
- [x] 4.2 调整消息容器高度计算

### 5. 编译测试 ✅
- [x] 5.1 TypeScript类型检查通过
- [x] 5.2 代码结构验证完成

## 实现总结

### 新增组件
1. **krebs-sidebar-nav.ts** - 侧边栏导航组件
   - 显示Chat、Tools、Skills三个导航项
   - 显示Tools/Skills数量徽章
   - 通过CustomEvent发送tab-change事件

2. **krebs-tools-panel.ts** - 工具详情面板
   - 网格布局展示所有工具
   - 按category分组显示
   - 卡片式设计，显示工具参数信息

3. **krebs-skills-panel.ts** - 技能详情面板
   - 网格布局展示所有技能
   - 按category分组显示
   - 支持启用/禁用切换功能

### 核心改动
1. **app.ts重构**
   - 移除旧的双section sidebar布局
   - 实现Tab切换架构
   - 根据activeTab显示对应内容面板

2. **krebs-chat.ts优化**
   - 输入框改为position: fixed; bottom: 0
   - 消息容器增加padding-bottom避免被遮挡
   - 响应式调整：移动端left: 80px

## 下一步行动
任务完成！可以启动开发服务器测试实际效果。
