# Task: 实现 OpenClaw 风格的上下文管理系统

**任务ID**: task_context_mgmt_260219_204914
**创建时间**: 2026-02-19
**状态**: 进行中
**目标**: 为 Krebs 项目实现完整的上下文管理系统，解决 token 超限问题

## 最终目标
实现一套三层防御机制：
1. 预防层：请求前检查上下文窗口
2. 智能压缩层：分块、摘要、修剪
3. 错误恢复层：自动识别并重试

## 拆解步骤

### 1. 核心基础设施 (Foundation)
- [x] 1.1 创建 Token 估算工具 (`src/utils/token-estimator.ts`)
- [x] 1.2 创建上下文窗口守卫 (`src/utils/model-context.ts`)
- [x] 1.3 创建压缩核心工具 (`src/utils/compaction.ts`)
- [x] 1.4 复用现有错误检测工具 (`src/agent/errors.ts`)

### 2. Provider 层集成
- [x] 2.1 更新 DeepSeek Provider 支持压缩重试
- [x] 2.2 更新 OpenAI Provider 支持压缩重试
- [x] 2.3 更新 Anthropic Provider 支持压缩重试
- [x] 2.4 添加统一的错误处理和重试逻辑

### 3. Agent 层集成
- [x] 3.1 在 Agent 中添加上下文压缩钩子（复用现有 `compactIfNeeded()`）
- [x] 3.2 实现自动压缩触发机制（复用现有溢出检测）
- [x] 3.3 添加压缩日志和监控

### 4. 配置和优化
- [x] 4.1 更新配置文件支持上下文窗口设置（使用模型映射）
- [x] 4.2 添加模型上下文窗口映射
- [x] 4.3 优化压缩参数（分块比例、安全边际等）

### 5. 测试和验证
- [ ] 5.1 单元测试：Token 估算准确性
- [ ] 5.2 单元测试：压缩逻辑正确性
- [ ] 5.3 集成测试：完整压缩流程
- [ ] 5.4 压力测试：超长消息处理

## 当前进度
### 正在进行: 2. Provider 层集成
已完成 DeepSeek Provider 的自动重试机制，待完成 OpenAI 和 Anthropic Provider

## 下一步行动
1. 为 OpenAI Provider 添加自动重试
2. 为 Anthropic Provider 添加自动重试
3. 编写单元测试和集成测试
4. 压力测试超长消息处理

## 技术细节

### 核心常量
- `CONTEXT_WINDOW_HARD_MIN_TOKENS = 16_000` - 硬性最小值
- `CONTEXT_WINDOW_WARN_BELOW_TOKENS = 32_000` - 警告阈值
- `BASE_CHUNK_RATIO = 0.4` - 基础分块比例
- `MIN_CHUNK_RATIO = 0.15` - 最小分块比例
- `SAFETY_MARGIN = 1.2` - 安全边际（20% buffer）

### 压缩策略
1. **历史修剪**: 当新消息过多时，直接丢弃最旧的历史消息
2. **分块摘要**: 将历史消息分成多块，分别摘要后合并
3. **自适应分块**: 根据消息大小动态调整分块比例
4. **降级机制**: 摘要失败时，排除超大消息后重试

## 参考实现
- OpenClaw: `/Users/zack/Desktop/openclaw-cn-ds/src/agents/compaction.ts`
- OpenClaw: `/Users/zack/Desktop/openclaw-cn-ds/src/agents/context-window-guard.ts`
- OpenClaw: `/Users/zack/Desktop/openclaw-cn-ds/src/agents/pi-embedded-helpers/errors.ts`
