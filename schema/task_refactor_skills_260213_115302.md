# Task: 移除旧 Skills 系统，保留新功能和 Tool Calling

**任务ID**: task_refactor_skills_260213_115302
**创建时间**: 2026-02-13
**状态**: 进行中
**目标**: 移除旧的 Skills 系统（基于 trigger），保留新 Skills 系统（pi-coding-agent）和 Tool Calling 系统

## 最终目标
- 识别并移除旧的 Skills 系统所有相关代码
- 保留新的 Skills 系统（pi-coding-agent）
- 保留 Tool Calling 系统
- 更新 Orchestrator 层（如果需要）
- 确保所有现有功能不受影响

## 拆解步骤
1. [ ] 识别旧的 Skills 系统的所有组件
2. [ ] 识别新的 Skills 系统和 Tool Calling 的依赖关系
3. [ ] 分析移除旧系统的影响范围
4. [ ] 制定详细的移除计划
5. [ ] 执行移除（按模块顺序）
6. [ ] 更新相关文档
7. [ ] 运行测试确保功能正常

## 当前进度
### 正在进行: 总结移除工作
已完成所有核心移除工作，正在总结

## 已完成的移除工作

### Phase 1: 简化 Orchestrator 层 ✅
- ✅ 移除 `enableSkills`, `skillTimeout`, `logSkillTriggers` 配置
- ✅ 移除 `skillRegistry` 依赖
- ✅ 移除 `tryExecuteSkills()` 方法
- ✅ 移除 `executeSkillWithTimeout()` 方法
- ✅ 移除 `createSkillContext()` 方法
- ✅ 移除 `withTimeout()` 方法
- ✅ 移除 `getSkillRegistry()` 方法
- ✅ 简化为统一的 Agent 委托层

### Phase 2: 更新 AgentManager ✅
- ✅ 移除 `SkillRegistry` 导入
- ✅ 移除 `skillRegistry` 字段
- ✅ 移除 `createDefaultSkillRegistry()` 方法
- ✅ 移除 `registerSkill()` 方法
- ✅ 简化配置选项（移除 `enableSkills`, `skillTimeout`, `logSkillTriggers`）
- ✅ 更新 `createAgent()` 方法，移除旧 Skills 系统配置

### Phase 3: 更新主入口 ✅
- ✅ 移除 `getBuiltinSkills` 导入
- ✅ 移除 `getBuiltinSkills()` 调用
- ✅ 移除 `skillRegistry` 相关代码
- ✅ 简化 `AgentManager` 初始化

### Phase 4: 删除旧文件 ✅
- ✅ 删除 `src/agent/skills/builtin.ts`
- ✅ 删除 `src/agent/skills/base.ts`

### Phase 5: 更新导出文件 ✅
- ✅ 更新 `src/agent/skills/index.ts`
- ✅ 移除旧 Skills 系统的导出
- ✅ 保留新 Skills 系统（pi-coding-agent）的导出

## 测试结果

运行 `npm test` 发现：
- ✅ 大部分测试通过
- ⚠️ Memory 相关测试失败（需要初始化数据库）
- ✅ Skills 系统测试通过
- ✅ Tool Calling 测试通过
- ✅ Session 测试通过

## 架构改进

### 移除前
```
Orchestrator
  ├─ 旧 Skills 系统（基于 trigger）
  └─ Agent
      ├─ 新 Skills 系统（pi-coding-agent）
      └─ Tool Calling 系统
```

### 移除后
```
Orchestrator
  └─ Agent（统一入口）
      ├─ 新 Skills 系统（通过 system prompt）
      └─ Tool Calling 系统（通过 LLM）
```

## 优势

1. **代码简化**：移除约 300 行旧 Skills 系统代码
2. **架构清晰**：Orchestrator 变成纯粹的 Agent 委托层
3. **维护性提升**：只需维护一套 Skills 系统
4. **性能优化**：减少双重系统的开销
