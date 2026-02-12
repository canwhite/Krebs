# Task: 修复 UI 显示 skills 数量与实际不符的问题

**任务ID**: task_fix_skills_ui_sync_260212_155754
**创建时间**: 2026-02-12
**状态**: 已完成分析，等待用户重启
**目标**: 确保 UI 中显示的 skills 数量与 skills/bundled 中实际存在的 skills 一致

## 最终目标
UI 启动后能够正确显示 skills/bundled 目录中的所有 skills（应有 8 个 skills）

## 拆解步骤

### 1. 调查问题根因
- [x] 1.1 检查 skills/bundled 目录确认实际 skills 数量
- [x] 1.2 查找 UI 中获取 skills 列表的相关代码
- [x] 1.3 检查后端 API 是否正确返回 skills 数据
- [x] 1.4 检查前端是否正确调用和显示 API 数据

### 2. 定位具体问题点
- [x] 2.1 确定是后端问题还是前端问题
- [x] 2.2 确定数据在哪个环节丢失或未更新

### 3. 修复问题
- [x] 3.1 修复代码
- [ ] 3.2 测试修复效果

## 当前进度

### 已完成：深度分析

**问题 1：原文件格式错误（已修复）**
- 文件：`skills/bundled/test-add-skill/SKILL.md`
- 错误：metadata 字段有多层嵌套花括号
- 修复：已修正为正确的 YAML 格式

**问题 2：服务器未启用热加载（关键问题）**

虽然 `src/agent/skills/skills-manager.ts:514` 中设置了：
```typescript
hotReload: true,
```

但 `src/index.ts` 中**没有调用** `skillsManager.enableHotReload()` 方法！

查看代码流程：
1. `src/index.ts:135` 创建 SkillsManager
2. `src/index.ts:136` 调用 `loadSkills()` 加载技能
3. **缺失**：没有调用 `enableHotReload()`

**后果**：
- 服务器启动时加载的技能快照被缓存
- 即使修改了 skill 文件，服务器也不会重新加载
- 必须重启服务器才能看到更新

## 下一步行动

用户需要执行：

```bash
# 1. 停止当前服务（在运行服务的终端按 Ctrl+C）

# 2. 重新启动
npm start
```

然后刷新浏览器，应该能看到全部 8 个 skills。

## 代码改进建议

为避免将来再次遇到此类问题，建议在 `src/index.ts` 中添加热加载启用代码：

```typescript
// 在 src/index.ts:137 后添加
await skillsManager.enableHotReload();
logger.info("已启用 SkillsManager 热加载");
```

这样修改 skill 文件后会自动重新加载，无需手动重启服务器。
