# 蜂巢模式 (Hive Mode) Agent 说明

## 蜂巢模式的核心概念

蜂巢模式模仿蜜蜂群体的协作方式，让多个 specialized agents 各司其职，共同完成复杂任务。

## 典型的蜂巢模式 Agent 类型

### 1. Planner Agent（规划者）

- **职责**: 分析用户需求，制定执行计划
- **功能**:
  - 拆解任务成子任务
  - 分配任务给其他 agents
  - 协调整体流程
  - 监控执行进度

### 2. Researcher Agent（研究者）

- **职责**: 信息收集和调研
- **功能**:
  - 搜索互联网信息
  - 分析文档和代码
  - 总结研究结果
  - 提供参考资料

### 3. Coder Agent（编码者）

- **职责**: 代码实现
- **功能**:
  - 编写具体代码
  - 修改文件
  - 实现功能逻辑
  - 遵循代码规范

### 4. Reviewer Agent（审查者）

- **职责**: 质量检查
- **功能**:
  - 检查代码质量
  - 发现潜在问题
  - 提出改进建议
  - 验证最佳实践

### 5. Executor Agent（执行者）

- **职责**: 运行和验证
- **功能**:
  - 运行脚本和命令
  - 测试代码
  - 验证结果
  - 报告执行状态

## 工作流程示例

```
用户: "帮我写一个带登录功能的网页应用"

Planner Agent:
  ├─ 分析需求
  ├─ 分配给 Researcher: 研究最佳登录方案
  ├─ 分配给 Coder: 编写前端代码
  ├─ 分配给 Coder: 编写后端 API
  └─ 分配给 Reviewer: 审查代码

Researcher Agent → 返回研究结果
Coder Agents → 并行编写代码
Reviewer Agent → 检查并反馈
Planner Agent → 整合结果，输出最终方案
```

## 在 Krebs 中实现类似功能

### 方式一: 通过多个 specialized tools

每个 tool 就像一个 specialized agent：

```typescript
const plannerTool: ToolDefinition = {
  name: "planner",
  description: "分析任务并制定执行计划",
  parameters: Type.Object({
    task: Type.String({ description: "需要规划的任务" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    const { task } = params as { task: string };
    // 分析任务，返回计划
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            plan: [
              "步骤 1: 调研需求",
              "步骤 2: 设计方案",
              "步骤 3: 实现代码",
              "步骤 4: 测试验证"
            ]
          }, null, 2)
        }
      ],
      details: {},
    };
  }
};

const researcherTool: ToolDefinition = {
  name: "researcher",
  description: "搜索和收集信息",
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    // 执行搜索和信息收集
  }
};

const coderTool: ToolDefinition = {
  name: "coder",
  description: "编写和修改代码",
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    // 编写代码
  }
};

const reviewerTool: ToolDefinition = {
  name: "reviewer",
  description: "审查代码质量",
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    // 审查代码
  }
};

// 将这些工具添加到 session
await createAgentSession({
  // ... 其他配置
  customTools: [plannerTool, researcherTool, coderTool, reviewerTool],
});
```

### 方式二: 通过 skills 定义协作流程

创建一个 `hive-mode` skill：

**skills/hive-mode/SKILL.md**

```markdown
---
name: hive-mode
description: 多智能体协作模式，通过规划、研究、编码、审查等步骤完成复杂任务
---

# Hive Mode

当面对复杂任务时，按照以下流程进行：

## 1. 规划阶段
使用 `/planner` 工具分析需求并制定计划

## 2. 研究阶段
使用 `/researcher` 工具收集必要信息

## 3. 执行阶段
使用 `/coder` 工具实现代码
使用 `/executor` 工具运行和测试

## 4. 审查阶段
使用 `/reviewer` 工具检查质量
```

## 蜂巢模式的优势

| 优势 | 说明 |
|------|------|
| **并行处理** | 多个 agents 可以同时工作，提高效率 |
| **专业分工** | 每个 agent 专注自己的领域，提高质量 |
| **自我纠错** | Reviewer agent 可以发现并修正错误 |
| **可扩展** | 容易添加新的 agent 类型 |
| **透明性** | 每个步骤清晰可见，便于调试 |
| **灵活性** | 可以根据任务动态调整 |

## 实现建议

1. **从简单开始**: 先实现 2-3 个核心 agents
2. **定义清晰接口**: 每个 agent 的输入输出要明确
3. **添加日志**: 记录每个 agent 的执行过程
4. **支持回滚**: 当某个 agent 失败时能够回退
5. **性能监控**: 跟踪每个 agent 的执行时间

## 参考资源

- [Multi-Agent Systems](https://en.wikipedia.org/wiki/Multi-agent_system)
- [Agent Skills 规范](https://agentskills.io/specification)
- [Kimi 蜂巢模式](https://kimi.moonshot.cn/)
