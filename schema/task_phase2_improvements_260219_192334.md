# Task: Phase 2 - 自动压缩重试与错误分类

**任务ID**: task_phase2_improvements_260219_192334
**创建时间**: 2026-02-19
**状态**: 进行中
**目标**: 参考 openclaw-cn-ds，实现自动压缩重试机制和改进错误分类处理

## 最终目标
增强 Agent 的鲁棒性，实现：
1. 上下文溢出时自动压缩并重试（最多一次）
2. 工具错误分类和处理（可恢复/可重试/致命）
3. 更清晰的错误信息

## 拆解步骤

### 1. 设计阶段
- [ ] 1.1 分析 openclaw-cn-ds 的错误处理机制
- [ ] 1.2 设计错误分类系统
- [ ] 1.3 设计自动压缩重试流程

### 2. 实现阶段
- [ ] 2.1 实现 ToolErrorKind 枚举
- [ ] 2.2 实现 classifyToolError 函数
- [ ] 2.3 实现自动压缩重试机制
- [ ] 2.4 集成到 processWithTools 循环中

### 3. 测试阶段
- [ ] 3.1 添加错误分类测试
- [ ] 3.2 添加自动压缩重试测试
- [ ] 3.3 验证所有测试通过

### 4. 文档阶段
- [ ] 4.1 更新 API 文档
- [ ] 4.2 添加使用示例

## 当前进度
### 正在进行: 设计阶段
正在分析 openclaw-cn-ds 的错误处理机制，设计 Krebs 的错误分类系统。

## 设计方案

### 错误分类（参考 openclaw-cn-ds）

```typescript
enum ToolErrorKind {
  RECOVERABLE = 'recoverable',      // 可恢复：工具执行失败，继续执行
  RETRYABLE = 'retryable',          // 可重试：网络错误、rate limit
  FATAL = 'fatal',                  // 致命：认证失败、上下文溢出
}
```

### 自动压缩重试流程

```
LLM 调用
    ↓
错误？
    ↓ YES
分类错误
    ├─ FATAL (上下文溢出)
    │   ├─ 首次溢出？
    │   │   ├─ YES → 压缩上下文 → 重试
    │   │   └─ NO  → 抛出错误
    │   └─ 其他 FATAL → 抛出错误
    ├─ RETRYABLE (网络错误)
    │   └─ 重试（有限次数）
    └─ RECOVERABLE (工具失败)
        └─ 记录错误，继续执行
```

## 下一步行动
1. 创建 ToolErrorKind 枚举和错误分类函数
2. 修改 processWithTools 实现自动压缩重试
3. 添加测试用例
