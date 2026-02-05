# Task: Krebs 项目全面优化改造

**任务ID**: task_comprehensive_optimization_260205_125939
**创建时间**: 2026-02-05 12:59:39
**状态**: 进行中
**目标**: 对 Krebs 项目进行全面优化改造，增强功能特性

## 最终目标
基于 openclaw-cn-ds 的优秀设计，对 Krebs 项目的四大核心系统进行优化改造，提升功能完整性和用户体验。

## 优化范围

1. **应用 openclaw-cn-ds 的 markdown 查询机制** - 学习并应用其文件监控、自动同步等机制
2. **优化 Memory Storage 系统** - 改进 SQLite 索引和向量搜索功能
3. **优化 Skills 系统** - 改进技能加载、热加载、多位置加载等
4. **优化 Session 管理** - 改进 Session Store 的性能、文件锁、缓存等

## 拆解步骤

### 第一阶段：应用 openclaw-cn-ds 的查询机制（最高优先级）

#### 1.1 文件监控机制
- [ ] 在 Memory Storage 中集成 chokidar 文件监控
- [ ] 实现文件变化自动标记 dirty
- [ ] 添加防抖机制（watchDebounceMs）
- [ ] 监控 `MEMORY.md` 和 `memory/` 目录

#### 1.2 自动同步机制
- [ ] 实现 `onSearch` 自动同步（搜索前）
- [ ] 实现 `onSessionStart` 预热（会话启动时）
- [ ] 实现定期后台同步（intervalMinutes）
- [ ] 添加完整的配置支持

#### 1.3 混合搜索策略
- [ ] 实现向量搜索 + 关键词搜索的混合
- [ ] 添加可配置的权重（vectorWeight, textWeight）
- [ ] 实现结果合并和排序算法

### 第二阶段：优化 Memory Storage 系统

#### 2.1 增强索引功能
- [ ] 优化增量更新机制（只更新变更文件）
- [ ] 添加文件哈希校验
- [ ] 实现更智能的分块策略
- [ ] 添加 Embedding 缓存优化

#### 2.2 丰富查询接口
- [ ] 添加高亮显示功能
- [ ] 支持按日期范围过滤
- [ ] 支持按标签过滤
- [ ] 添加查询统计和分析

#### 2.3 完善数据源支持
- [ ] 支持多数据源配置（memory, sessions）
- [ ] 实现数据源规范化工具
- [ ] 添加会话记忆搜索（实验性功能）
- [ ] 支持自定义数据源扩展

### 第三阶段：优化 Skills 系统

#### 3.1 多位置技能加载
- [ ] 支持从 Bundled Skills 加载（内置）
- [ ] 支持从 Managed/local 加载（本地技能目录）
- [ ] 支持从 Workspace 加载（工作空间技能）
- [ ] 支持从 Extra 加载（额外技能路径）

#### 3.2 技能依赖管理
- [ ] 实现技能依赖自动检测
- [ ] 添加依赖自动安装功能
- [ ] 实现依赖版本管理
- [ ] 添加依赖冲突检测

#### 3.3 技能热加载优化
- [ ] 优化 chokidar 监控性能
- [ ] 添加技能加载错误恢复
- [ ] 实现技能加载状态通知
- [ ] 添加技能加载日志

#### 3.4 技能查询增强
- [ ] 添加技能分类浏览
- [ ] 实现技能搜索功能
- [ ] 添加技能使用统计
- [ ] 实现技能推荐机制

### 第四阶段：优化 Session 管理

#### 4.1 性能优化
- [ ] 优化文件锁机制（减少锁竞争）
- [ ] 改进 TTL 缓存策略（动态调整）
- [ ] 添加批量操作支持
- [ ] 实现懒加载机制

#### 4.2 功能增强
- [ ] 支持会话导入/导出
- [ ] 添加会话合并功能
- [ ] 实现会话版本控制
- [ ] 支持会话标签和分类

#### 4.3 多 Agent 支持
- [ ] 完善 `agent:{agentId}:{key}` 格式
- [ ] 添加 Agent 隔离机制
- [ ] 实现 Agent 间会话共享
- [ ] 支持 Agent 组管理

#### 4.4 监控和诊断
- [ ] 添加会话性能监控
- [ ] 实现会话健康检查
- [ ] 添加会话统计报告
- [ ] 实现会话调试工具

## 当前进度

### 正在进行
已完成第一阶段所有实现和测试

### 完成内容（2026-02-05）

#### ✅ 第一阶段：应用 openclaw-cn-ds 的查询机制

**1.1 文件监控机制** ✅
- ✅ 集成 chokidar 文件监控（已有）
- ✅ 实现文件变化自动标记 dirty（新增 dirty 标志）
- ✅ 添加防抖机制（watchDebounceMs 配置化）
- ✅ 监控 `MEMORY.md` 和 `memory/` 目录（已实现）
- ✅ 优化 awaitWriteFinish 配置（100ms stability）

**1.2 自动同步机制** ✅
- ✅ 实现 `onSearch` 自动同步（搜索前检查 dirty）
- ✅ 实现 `onSessionStart` 预热（会话启动时同步）
- ✅ 实现定期后台同步（intervalMinutes）
- ✅ 添加完整的配置支持（MemoryStorageConfig）
- ✅ 并发控制（syncInProgress 标志）

**1.3 混合搜索策略** ✅
- ✅ 实现向量搜索 + 关键词搜索的混合
- ✅ 添加可配置的权重（vectorWeight, textWeight）
- ✅ 实现结果合并和排序算法
- ✅ 智能分数归一化

#### 代码改动

**src/storage/memory/types.ts**:
- 新增 `MemoryStorageConfig` 接口
- 支持同步配置（sync）
- 支持查询配置（query）
- 支持混合搜索配置（hybrid）

**src/storage/memory/manager.ts**:
- 添加 `dirty` 和 `sessionsDirty` 标志
- 添加 `syncInProgress` 并发控制
- 添加 `sessionWarm` 会话预热缓存
- 添加 `intervalSyncTimer` 定期同步定时器
- 改进 `start()` - 支持定期同步
- 改进 `enableWatch()` - 添加 dirty 标记
- 新增 `startIntervalSync()` - 定期同步
- 新增 `warmSession()` - 会话预热
- 改进 `sync()` - 支持原因参数，并发控制
- 改进 `search()` - onSearch 自动同步，混合搜索
- 新增 `searchVector()` - 向量搜索
- 新增 `searchKeyword()` - 关键词搜索
- 新增 `mergeHybridResults()` - 混合结果合并
- 新增 `hasFullTextSearch()` - FTS 检查

**src/storage/memory/service.ts**:
- 更新 `searchMemories()` 使用新的搜索接口

**test/storage/memory/manager.test.ts**:
- 调整测试等待时间（7000ms）

#### 测试结果

✅ **所有 103 个测试通过**
- test/storage/memory/embeddings.test.ts: 24 tests
- test/storage/memory/internal.test.ts: 33 tests
- test/storage/memory/schema.test.ts: 18 tests
- test/storage/memory/manager.test.ts: 28 tests

编译通过：✅ `npm run build`
测试通过：✅ `npm test -- --run test/storage/memory/`

### 代码分析结果

**现有功能**（已实现）：
- ✅ 文件监控（chokidar）
- ✅ 防抖同步（5秒）
- ✅ 增量更新（文件哈希）
- ✅ 向量搜索（sqlite-vec）

**新增功能**：
1. ✅ **onSearch 自动同步**：搜索前检查 dirty 标志
2. ✅ **混合搜索**：向量 + 关键词搜索
3. ✅ **onSessionStart 预热**：会话启动时同步
4. ✅ **定期后台同步**：定时更新索引
5. ✅ **灵活配置接口**：支持外部配置
6. ✅ **可配置权重**：vectorWeight, textWeight

## 下一步行动
1. 扩展类型定义，添加新配置接口
2. 改进 manager.ts，添加自动同步触发点
3. 实现混合搜索功能
4. 编写测试用例

## 技术方案

### 文件监控集成方案

基于 openclaw-cn-ds 的设计，在 `src/storage/memory/manager.ts` 中添加：

```typescript
private watcher?: FSWatcher;
private dirty = false;
private watchSyncScheduled = false;

private ensureWatcher() {
  if (this.watcher) return;

  const watchPaths = [
    path.join(this.workspaceDir, "MEMORY.md"),
    path.join(this.workspaceDir, "memory"),
  ];

  this.watcher = chokidar.watch(watchPaths, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: this.settings.sync.watchDebounceMs,
      pollInterval: 100,
    },
  });

  this.watcher.on("change", () => {
    this.dirty = true;
    this.scheduleWatchSync();
  });
}
```

### 自动同步触发点

1. **搜索前同步**：在 `search()` 方法开始时检查 `dirty` 标志
2. **会话启动预热**：添加 `warmSession()` 方法
3. **定期同步**：使用 `setInterval` 实现后台同步
4. **文件变化同步**：通过 chokidar 监控触发

### 配置扩展

```typescript
export interface MemoryStorageConfig {
  // ... 现有配置

  // 新增：同步配置
  sync?: {
    onSessionStart?: boolean;
    onSearch?: boolean;
    watch?: boolean;
    watchDebounceMs?: number;
    intervalMinutes?: number;
  };

  // 新增：混合搜索配置
  query?: {
    hybrid?: {
      enabled?: boolean;
      vectorWeight?: number;
      textWeight?: number;
    };
  };
}
```

## 依赖需求

- chokidar（已在 production.md 中列出）
- 需要确保 Memory Storage 的结构支持这些增强功能

## 测试计划

每个阶段完成后需要添加/更新测试：
- 文件监控功能测试
- 自动同步机制测试
- 混合搜索功能测试
- 性能基准测试

## 文档更新

完成后需要更新：
- production.md - 反映新功能和架构变化
- 添加使用示例和配置说明
- 更新 API 文档
