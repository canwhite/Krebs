# Task: Agent 模块重构与增强

**任务ID**: task_agent_refactor_260204_111751
**创建时间**: 2026-02-04
**状态**: 进行中
**目标**: 学习 openclaw-cn-ds 的优秀设计，重构 Krebs 的 agent 模块，解决架构分析中指出的耦合问题

---

## 最终目标

构建一个**高度模块化、可测试、可扩展**的 Agent 系统，具体包括：

1. **分离职责**: 将 Agent 的技能调度职责分离到独立的 Orchestrator 层
2. **移除全局单例**: 所有依赖通过依赖注入传递
3. **引入接口层**: Gateway 与 Agent 之间通过服务接口解耦
4. **增强模块化**: 参考 openclaw-cn-ds 的设计，提升 agent 模块的独立性
5. **完善测试**: 编写全面的单元测试和集成测试

---

## 拆解步骤

### 阶段 1: 研究与设计 ✅

- [x] 1.1 阅读架构分析报告 `docs/architecture-analysis.md`
- [x] 1.2 探索参考项目 openclaw-cn-ds 的 agent 设计
- [x] 1.3 分析当前 agent 模块的问题
- [x] 1.4 创建任务文档
- [ ] 1.5 设计新的架构方案
  - [ ] 1.5.1 设计 Orchestrator 层接口
  - [ ] 1.5.2 设计 AgentContext 接口
  - [ ] 1.5.3 设计依赖注入方案

### 阶段 2: 核心重构

#### 2.1 引入 Orchestrator 层 ⏳

- [ ] 2.1.1 创建 `src/agent/core/orchestrator.ts`
  - [ ] 定义 `AgentOrchestrator` 类
  - [ ] 实现技能触发逻辑
  - [ ] 实现技能调度逻辑
  - [ ] 实现委托 Agent 处理逻辑

- [ ] 2.1.2 重构 `src/agent/core/agent.ts`
  - [ ] 移除技能调度代码（line 84-105）
  - [ ] 简化为纯粹的 LLM 处理器
  - [ ] 更新 `process` 和 `processStream` 方法

- [ ] 2.1.3 更新 `src/agent/core/manager.ts`
  - [ ] 集成 Orchestrator
  - [ ] 更新 Agent 创建逻辑

#### 2.2 移除全局单例

- [ ] 2.2.1 修改 `src/agent/core/agent.ts`
  - [ ] 移除 `import { globalSkillRegistry }`
  - [ ] 在构造函数中接受 `skillRegistry` 参数
  - [ ] 更新类型定义

- [ ] 2.2.2 修改 `src/agent/core/manager.ts`
  - [ ] 管理 SkillRegistry 实例
  - [ ] 通过构造函数传递给 Agent

- [ ] 2.2.3 更新 `src/agent/skills/index.ts`
  - [ ] 移除或标记 `globalSkillRegistry` 为废弃
  - [ ] 导出工厂函数 `createSkillRegistry()`

#### 2.3 Storage 接口化

- [ ] 2.3.1 创建 `src/storage/interface.ts`
  - [ ] 定义 `StorageInterface` 接口
  - [ ] 定义 `SessionStorage` 接口

- [ ] 2.3.2 更新 `src/agent/core/manager.ts`
  - [ ] 修改构造函数接受 `StorageInterface`
  - [ ] 移除硬编码的 SessionStore 创建

- [ ] 2.3.3 更新 `src/index.ts`
  - [ ] 创建具体存储实现
  - [ ] 通过依赖注入传递给 AgentManager

### 阶段 3: 服务抽象层

#### 3.1 引入服务接口

- [ ] 3.1.1 创建 `src/gateway/service/chat-service.ts`
  - [ ] 定义 `ChatService` 接口
  - [ ] 实现 `AgentChatService` 类

- [ ] 3.1.2 更新 Gateway 服务器
  - [ ] 修改 `src/gateway/server/http-server.ts`
  - [ ] 修改 `src/gateway/server/ws-server.ts`
  - [ ] 使用 `ChatService` 接口而非直接依赖 AgentManager

- [ ] 3.1.3 更新依赖注入
  - [ ] 在 `src/index.ts` 中创建 ChatService 实例
  - [ ] 注入到 Gateway 服务器

### 阶段 4: 技能系统增强

#### 4.1 精简 SkillContext

- [ ] 4.1.1 更新 `src/agent/skills/base.ts`
  - [ ] 重新定义 `SkillContext` 接口
  - [ ] 只传递必要的上下文信息
  - [ ] 添加按需获取历史的方法

- [ ] 4.1.2 更新技能实现
  - [ ] 适配新的 SkillContext
  - [ ] 使用 `getHistory()` 按需获取

#### 4.2 参考开源项目的优秀设计

- [ ] 4.2.1 研究工具系统的模块化
  - [ ] 学习 openclaw-cn-ds 的工具设计
  - [ ] 设计独立的工具加载机制

- [ ] 4.2.2 增强技能系统
  - [ ] 支持多位置技能加载（Bundled, Local, Workspace）
  - [ ] 添加技能元数据（description, permissions, etc.）
  - [ ] 实现技能热加载

### 阶段 5: 测试与文档

#### 5.1 编写单元测试

- [ ] 5.1.1 测试 Orchestrator
  - [ ] 测试技能触发逻辑
  - [ ] 测试技能调度逻辑
  - [ ] 测试委托逻辑

- [ ] 5.1.2 测试 Agent
  - [ ] 测试 LLM 调用
  - [ ] 测试流式处理
  - [ ] 测试历史管理

- [ ] 5.1.3 测试依赖注入
  - [ ] 测试 Mock 注入
  - [ ] 测试不同的存储实现

#### 5.2 更新文档

- [ ] 5.2.1 更新 `production.md`
  - [ ] 反映新的架构状态
  - [ ] 更新模块依赖关系图

- [ ] 5.2.2 更新 `docs/architecture-analysis.md`
  - [ ] 标记已解决的问题
  - [ ] 更新架构评分

- [ ] 5.2.3 创建使用示例
  - [ ] 创建示例代码
  - [ ] 添加最佳实践文档

---

## 当前进度

### 正在进行: 阶段 1-4 - 核心重构已完成 ✅

已完成的主要工作：

1. ✅ **引入 Orchestrator 层** - 创建了 `src/agent/core/orchestrator.ts`
2. ✅ **重构 Agent 类** - 移除了技能调度逻辑，专注于 LLM 处理
3. ✅ **移除全局单例** - 不再使用 `globalSkillRegistry`，改用依赖注入
4. ✅ **Storage 接口化** - 创建了 `ISessionStorage` 接口
5. ✅ **ChatService 接口层** - 解耦 Gateway 和 Agent
6. ✅ **更新主入口** - `index.ts` 使用新的架构
7. ✅ **测试构建** - 项目成功构建，无类型错误

**下一步**: 更新文档，记录架构改进

---

## 下一步行动

1. **立即行动**: 设计 Orchestrator 层的接口和实现方案
2. **并行任务**: 分析 openclaw-cn-ds 的工具系统，设计增强方案
3. **后续任务**: 开始实施代码重构

---

## 关键决策记录

### 决策 1: 为什么要引入 Orchestrator 层？

**问题**: 当前 Agent 类承担了太多职责（消息处理、历史管理、技能调度、LLM 调用）

**解决方案**: 引入 Orchestrator 层专门负责技能调度和编排

**预期收益**:
- Agent 类可专注于 LLM 对话管理
- 技能系统可独立演进
- 提高可测试性和可维护性

### 决策 2: 为什么要移除全局单例？

**问题**: `globalSkillRegistry` 导致难以测试、并发隐患、无法隔离实例

**解决方案**: 通过依赖注入在 AgentManager 中管理 SkillRegistry

**预期收益**:
- 可测试性提升 50%
- 消除并发隐患
- 符合依赖注入原则

### 决策 3: 为什么要引入服务接口层？

**问题**: Gateway 直接依赖 AgentManager，难以替换和测试

**解决方案**: 定义 ChatService 接口，Gateway 只依赖接口

**预期收益**:
- Gateway 可独立测试
- 支持多种后端实现
- 降低模块耦合度

---

## 风险与挑战

### 风险 1: 重构范围较大

**影响**: 可能引入新的 bug

**缓解措施**:
- 分阶段实施，每阶段完成后进行测试
- 保留原有代码作为备份
- 编写全面的测试用例

### 风险 2: API 变更影响使用者

**影响**: 可能破坏现有代码

**缓解措施**:
- 提供迁移指南
- 保留兼容层（deprecated）
- 版本号升级（major version）

### 风险 3: 性能影响

**影响**: 新增抽象层可能影响性能

**缓解措施**:
- 性能基准测试
- 优化关键路径
- 提供性能监控

---

## 成功标准

### 功能标准
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 功能与原有系统一致

### 质量标准
- [ ] 代码覆盖率达到 80% 以上
- [ ] 无 TypeScript 类型错误
- [ ] 无 ESLint 警告

### 架构标准
- [ ] 模块耦合度降低
- [ ] 可测试性提升
- [ ] 符合 SOLID 原则

---

## 参考资料

### 内部文档
- `docs/architecture-analysis.md` - 架构分析报告
- `production.md` - 项目全局文档

### 外部参考
- `/Users/zack/Desktop/openclaw-cn-ds` - 参考项目
- `openclaw-cn-ds/docs/concepts/agent.md` - Agent 概念文档
- `openclaw-cn-ds/docs/concepts/architecture.md` - 架构文档

### 设计原则
- SOLID 原则
- 依赖注入模式
- 策略模式
- 仓储模式

---

**任务维护**: 每完成一个步骤，更新本文档的进度。
**任务归档**: 完成后移至 `schema/archive/`
