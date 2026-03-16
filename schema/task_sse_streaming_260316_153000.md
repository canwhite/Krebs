# Task: SSE 流式中间过程显示

**任务ID**: task_sse_streaming_260316_153000
**创建时间**: 2026-03-16
**状态**: 进行中
**目标**: 实现 SSE 流式传输，让 UI 实时显示 AI 的工具调用、执行状态和中间结果

## 最终目标

1. 后端提供 SSE 端点 `/api/chat/stream`
2. 实时发射工具调用事件（开始、进度、结果）
3. 前端使用 EventSource 接收并实时渲染
4. UI 和现有风格一致，支持工具卡片展示

## 拆解步骤

### 1. 后端 - SSE 事件协议定义
- [ ] 定义 SSE 事件类型和数据格式
- [ ] 创建 `src/gateway/protocol/sse-events.ts`

### 2. 后端 - Agent 层事件发射
- [ ] 修改 `Agent.processWithTools` 支持事件回调
- [ ] 添加 `onToolCall` 回调 - 工具调用开始
- [ ] 添加 `onToolProgress` 回调 - 工具执行进度
- [ ] 添加 `onToolResult` 回调 - 工具执行结果
- [ ] 添加 `onContent` 回调 - 流式文本输出

### 3. 后端 - SSE 端点实现
- [ ] 在 `http-server.ts` 添加 `/api/chat/stream` 端点
- [ ] 实现 SSE 响应格式
- [ ] 集成 Agent 事件回调

### 4. 前端 - EventSource 连接
- [ ] 修改 `krebs-chat.ts` 使用 EventSource
- [ ] 处理各种事件类型
- [ ] 实时更新消息状态

### 5. 前端 - UI 组件增强
- [ ] 增强工具卡片显示（状态转换动画）
- [ ] 实现折叠/展开结果详情
- [ ] 流式文本动画效果

### 6. 测试和验证
- [ ] 端到端测试 SSE 流程
- [ ] 验证工具调用实时显示
- [ ] 验证错误处理

## 当前进度

### 正在进行: 规划阶段
分析现有代码，准备开始实现

## 下一步行动

1. 创建 SSE 事件协议定义文件
2. 修改 Agent 层添加事件回调支持
