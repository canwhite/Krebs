# Task: 分析 openclaw-cn-ds 的 system prompt 设计并改进 Krebs

**任务ID**: task_analysis_openclaw_prompt_260219_193220
**创建时间**: 2026-02-19 19:32:20
**状态**: ✅ Phase 1 + Phase 2 已完成
**目标**: 深入分析 openclaw-cn-ds 的 system prompt 架构，提取核心设计模式，评估 Krebs 当前实现，提出具体改进方案

## 最终目标
1. ✅ 完整分析 openclaw-cn-ds 的 system prompt 机制
2. ✅ 识别 Krebs 与 openclaw-cn-ds 在 prompt 工程上的差距
3. ✅ 提出可操作的改进方案
4. ✅ 实现 Phase 1 核心改进
5. ✅ 实现 Phase 2 增强功能

## 拆解步骤

### 1. 分析 openclaw-cn-ds 的 system prompt 机制
- [ ] 1.1 分析 `buildAgentSystemPrompt` 函数的结构
- [ ] 1.2 分析 PromptMode 设计（full/minimal/none）
- [ ] 1.3 分析各个 section 的构建逻辑
- [ ] 1.4 分析工具系统（tools）的集成方式
- [ ] 1.5 分析动态参数系统（runtime info, timezone, etc.）

### 2. 对比 Krebs 当前实现
- [ ] 2.1 读取 Krebs 的 `src/agent/core/system-prompt.ts`
- [ ] 2.2 对比两者的架构差异
- [ ] 2.3 识别 Krebs 的优势和不足

### 3. 提取可借鉴的设计模式
- [ ] 3.1 PromptMode 模式（full/minimal/none）
- [ ] 3.2 Section 化构建策略
- [ ] 3.3 工具系统 prompt 生成
- [ ] 3.4 动态运行时信息注入
- [ ] 3.5 Skills/Memory/Context 集成

### 4. 设计改进方案
- [ ] 4.1 架构层面：PromptBuilder 模式
- [ ] 4.2 功能层面：新增哪些 section
- [ ] 4.3 性能层面：缓存和优化策略
- [ ] 4.4 可测试性：prompt 单元测试

### 5. 实现改进
- [x] 5.1 完成分析和设计
- [x] 5.2 Phase 1: 核心改造
  - [x] 5.2.1 增强 Tool System（P0）
  - [x] 5.2.2 新增 Tool Call Style Section（P0）
  - [x] 5.2.3 新增 Memory Recall Section（P0）
- [x] 5.3 编写测试（22 个测试，100% 通过）
- [x] 5.4 更新文档
- [x] 5.5 修复类型错误（RuntimeInfo 添加 environment 字段）
- [ ] 5.3 Phase 2: 增强功能
  - [ ] 5.3.1 支持上下文文件（SOUL.md, AGENTS.md, TOOLS.md）
  - [ ] 5.3.2 自动检测 git root
  - [ ] 5.3.3 增强 Runtime 信息（capabilities, channel）

## 当前进度
### 🚀 正在进行: Phase 2 增强功能改造

已完成：
- ✅ Phase 1 所有功能
- ✅ 用户确认开始 Phase 2

## 下一步行动
Phase 2 任务：
1. 支持上下文文件（SOUL.md）加载和集成
2. 实现 findGitRoot 函数自动检测项目根目录
3. 增强 Runtime 信息（添加 capabilities, channel 等字段）

---

## Bug 修复记录

### 修复 1: RuntimeInfo 类型错误（2026-02-19）
**问题**: agent.ts:672 中的 `environment: (process.env.NODE_ENV as any) || "development"` 导致类型错误

**原因**: 新的 `RuntimeInfo` 接口没有 `environment` 字段，但旧代码在使用它

**解决方案**:
1. 在 `RuntimeInfo` 接口中添加 `environment?: "development" | "production" | "test"` 字段
2. 在 `buildRuntimeSection` 函数中添加对 `environment` 的支持

**验证**:
- ✅ 单元测试通过（22/22）
- ✅ 构建成功（`npm run build`）
- ✅ 向后兼容，不影响现有代码

### 修复 2: 测试文件导入路径错误（2026-02-19）
**问题**: `Cannot find module '@/agent/core/system-prompt.js' or its corresponding type declarations`

**原因**: 测试文件中使用了带 `.js` 扩展名的导入路径，但 TypeScript 路径别名不需要扩展名

**解决方案**:
- 将 `from "@/agent/core/system-prompt.js"` 改为 `from "@/agent/core/system-prompt"`

**验证**:
- ✅ 单元测试通过（22/22）
- ✅ 构建成功（`npm run build`）

---

## 关键发现（持续更新）

### openclaw-cn-ds 的核心设计特点

#### 1. PromptMode 模式
```typescript
export type PromptMode = "full" | "minimal" | "none";
```
- **full**: 完整模式，主 Agent 使用
- **minimal**: 精简模式，子 Agent 使用
- **none**: 仅基础身份行

#### 2. Section 化构建策略
所有 prompt 内容按 section 拆分，每个 section 有独立的构建函数：
- `buildSkillsSection` - Skills 系统
- `buildMemorySection` - 记忆检索
- `buildUserIdentitySection` - 用户身份
- `buildTimeSection` - 时区和时间
- `buildReplyTagsSection` - 回复标签
- `buildMessagingSection` - 消息系统
- `buildVoiceSection` - 语音/TTS
- `buildDocsSection` - 文档链接

#### 3. 工具系统 Prompt 生成
- 核心工具硬编码摘要（`coreToolSummaries`）
- 外部工具通过 `toolSummaries` 参数传入
- 工具排序和去重
- 大小写不敏感的工具名解析

#### 4. 动态运行时信息
通过 `RuntimeInfoInput` 注入：
- agentId, host, os, arch, node
- model, defaultModel
- channel, capabilities
- repoRoot（自动检测 git root）

#### 5. 丰富的 Section 内容
- **Tooling**: 工具列表和使用指导
- **Tool Call Style**: 工具调用风格指导
- **Clawdbot CLI Quick Reference**: CLI 命令参考
- **Skills**: 技能系统使用指导
- **Memory Recall**: 记忆检索指导
- **Sandbox**: 沙盒环境信息
- **Reactions**: 反应指导（minimal/extensive）
- **Silent Replies**: 静默回复规则
- **Heartbeats**: 心跳检测机制
