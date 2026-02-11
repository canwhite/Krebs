# Task: 研究 openclaw-cn-ds 如何知道需要查询本地存储的 markdown

**任务ID**: task_investigate_local_md_query_260205_121121
**创建时间**: 2026-02-05 12:11:21
**状态**: 进行中
**目标**: 理解 openclaw-cn-ds 项目如何判断何时查询本地存储的 markdown 数据

## 最终目标
分析 `/Users/zack/Desktop/openclaw-cn-ds` 项目的代码，找出它是如何知道在何时需要查询本地已存储的 markdown 文件的机制。

## 拆解步骤

### 1. 探索 openclaw-cn-ds 项目结构
- [x] 查看项目根目录结构
- [x] 理解项目的整体架构

### 2. 查找 markdown 相关的查询机制
- [x] 搜索 markdown storage 相关代码
- [x] 查找本地数据查询的逻辑
- [x] 理解何时触发本地数据查询

### 3. 分析判断机制
- [x] 找出判断是否使用本地数据的逻辑
- [x] 理解触发条件
- [x] 总结机制原理

## 当前进度

### 正在进行
已完成探索，正在整理分析结果

## 核心发现

### 1. 判断机制概述

openclaw-cn-ds 通过以下机制判断何时查询本地存储的 markdown：

**配置驱动 + 事件触发 + 自动同步**

### 2. 关键触发条件

#### A. 主动搜索触发
- 当调用 `memory_search` 工具时
- 位置：`src/memory/manager.ts:261-307`

#### B. 文件变化触发
- 使用 chokidar 监控 `MEMORY.md` 和 `memory/` 目录
- 位置：`src/memory/manager.ts:770-790`
- 配置：`sync.watch` 和 `sync.watchDebounceMs`

#### C. 会话启动触发
- 新会话开始时预热索引
- 位置：`src/memory/manager.ts:251-259`
- 配置：`sync.onSessionStart`

#### D. 搜索前自动同步
- 每次搜索前检查是否需要同步
- 位置：`src/memory/manager.ts:270-274`
- 配置：`sync.onSearch`

#### E. 定期同步
- 后台定时更新索引
- 配置：`sync.intervalMinutes`

### 3. 判断是否启用的逻辑

```typescript
// src/agents/memory-search.ts:116-118
const enabled = overrides?.enabled ?? defaults?.enabled ?? true;
const sessionMemory =
  overrides?.experimental?.sessionMemory ?? defaults?.experimental?.sessionMemory ?? false;
const sources = normalizeSources(overrides?.sources ?? defaults?.sources, sessionMemory);
```

### 4. 数据源识别

```typescript
// src/memory/internal.ts:33-38
export function isMemoryPath(relPath: string): boolean {
  const normalized = normalizeRelPath(relPath);
  if (!normalized) return false;
  if (normalized === "MEMORY.md" || normalized === "memory.md") return true;
  return normalized.startsWith("memory/");
}
```

### 5. 核心文件位置

- **内存管理器**：`src/memory/manager.ts` (2179行)
- **内部工具**：`src/memory/internal.ts`
- **工作空间管理**：`src/agents/workspace.ts`
- **搜索配置**：`src/agents/memory-search.ts`
- **配置类型**：`src/config/types.tools.ts:211-300`

## 下一步行动
1. 总结分析结果（已完成）
2. 向用户汇报机制原理
