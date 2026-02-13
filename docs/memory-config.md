# Memory 配置指南

> **Krebs Memory 系统** - 完整的配置和控制开关说明

---

## 🎛 控制开关总览

| 开关位置 | 配置项 | 默认值 | 作用 |
|---------|--------|--------|------|
| **AgentManager** | `enableMemory` | `true` | 总开关（启用/禁用整个 Memory 系统）|
| **MemoryService** | `searchEnabled` | `true` | 自动搜索相关记忆 |
| **MemoryService** | `autoSaveEnabled` | `true` | 自动保存对话到日志 |
| **MemoryIndexManager** | `sync.watch` | `true` | 文件监听（自动更新索引） |
| **MemoryIndexManager** | `sync.onSearch` | `true` | 搜索前自动同步 |
| **MemoryIndexManager** | `sync.onSessionStart` | `true` | 会话启动时预热 |

---

## 🔧 快速配置

### 完全禁用 Memory（最快）

```typescript
const agentManager = new AgentManager({
  enableMemory: false,  // ← 一键关闭
}, deps);
```

### 完整配置（生产推荐）

```typescript
const agentManager = new AgentManager({
  enableMemory: true,   // 启用 Memory
  dataDir: "./data",  // Memory 存储目录
}, deps);
```

---

## 📋 常见场景配置

### 场景 1：开发调试（禁用 Memory）

**目标**：快速测试，不启动 Memory 索引

```typescript
const agentManager = new AgentManager({
  enableMemory: false,  // 关闭整个 Memory 系统
}, deps);
```

**效果**：
- ❌ 不搜索记忆
- ❌ 不保存对话
- ❌ 不索引文件
- ✅ 启动速度快

---

### 场景 2：只保存，不搜索

**目标**：保存对话历史，但不在对话中引用

```typescript
const agentManager = new AgentManager({
  enableMemory: true,
  dataDir: "./data",
}, deps);

// 内部配置（需要修改源码）
new MemoryService({
  searchEnabled: false,    // 不自动搜索记忆
  autoSaveEnabled: true,     // 但自动保存对话
});
```

**效果**：
- ❌ 不自动注入记忆
- ✅ 自动保存对话到 `data/memory/YYYY-MM-DD.md`
- ✅ 记忆可被手动搜索

---

### 场景 3：只搜索，不保存

**目标**：使用已有记忆，但不保存新对话

```typescript
new MemoryService({
  searchEnabled: true,      // 自动搜索记忆
  autoSaveEnabled: false,    // 但不自动保存
});
```

**效果**：
- ✅ 自动注入相关记忆
- ❌ 不自动保存新对话
- ✅ 手动保存重要信息

---

### 场景 4：禁用文件监听（手动索引）

**目标**：不自动监听文件变化，手动控制索引更新

```typescript
new MemoryIndexManager({
  config: {
    sync: {
      watch: false,       // 不监听文件变化
      onSearch: true,      // 但搜索前同步
      intervalMinutes: 30,  // 或每 30 分钟定期同步
    }
  }
});
```

**效果**：
- ❌ 不自动更新索引
- ✅ 搜索前手动同步
- ✅ 定期自动同步
- ✅ 减少文件监听开销

---

### 场景 5：禁用自动同步（完全手动）

**目标**：完全手动控制索引更新

```typescript
new MemoryIndexManager({
  config: {
    sync: {
      watch: false,          // 不监听文件
      onSearch: false,        // 搜索前不同步
      onSessionStart: false,   // 会话启动时不同步
      intervalMinutes: undefined, // 不定期同步
    }
  }
});
```

**效果**：
- ❌ 不自动更新索引
- ✅ 完全手动控制
- ✅ 需要调用 `manager.sync()` 或 `manager.reindex()`

---

## 🎯 生产环境推荐配置

### 标准配置（推荐）

```typescript
const agentManager = new AgentManager({
  enableMemory: true,   // 启用 Memory
  dataDir: "./data",  // 存储目录
}, deps);
```

**适用场景**：
- ✅ 大多数应用
- ✅ 需要长期记忆
- ✅ 自动化管理

---

### 高性能配置

```typescript
new MemoryIndexManager({
  config: {
    sync: {
      watch: true,               // 启用文件监听
      watchDebounceMs: 5000,      // 5 秒防抖
      onSearch: false,             // 搜索前不同步（提升性能）
      onSessionStart: true,        // 会话启动时预热
      intervalMinutes: 30,          // 30 分钟定期同步
    },
    query: {
      maxResults: 5,               // 最多 5 个结果
      minScore: 0.5,               // 最低相关性 0.5
      hybrid: {
        enabled: true,             // 启用混合搜索
        vectorWeight: 0.7,        // 向量权重 70%
        textWeight: 0.3,           // 关键词权重 30%
      },
    },
  },
});
```

**适用场景**：
- ✅ 大量记忆文件
- ✅ 需要快速响应
- ✅ 搜索性能优化

---

### 低资源配置

```typescript
new MemoryIndexManager({
  config: {
    sync: {
      watch: false,                // 不监听文件
      onSearch: true,              // 搜索前同步
      intervalMinutes: 60,          // 60 分钟定期同步
    },
    query: {
      maxResults: 3,               // 减少结果数
      hybrid: {
        enabled: false,            // 禁用混合搜索（只向量）
      },
    },
  },
});
```

**适用场景**：
- ✅ 资源受限环境
- ✅ 低功耗设备
- ✅ 减少磁盘 I/O

---

## 🔍 配置项详解

### AgentManager 配置

```typescript
interface AgentManagerConfig {
  /**
   * 数据目录（Memory 存储位置）
   * @default "./data"
   */
  dataDir?: string;

  /**
   * 是否启用 Memory 系统
   * @default true
   */
  enableMemory?: boolean;
}
```

### MemoryService 配置

```typescript
interface MemoryServiceConfig {
  /**
   * 是否启用自动搜索
   * @default true
   */
  searchEnabled?: boolean;

  /**
   * 是否启用自动保存
   * @default true
   */
  autoSaveEnabled?: boolean;

  /**
   * 最大搜索结果数
   * @default 6
   */
  maxSearchResults?: number;

  /**
   * 最低相关性分数（0-1）
   * @default 0.35
   */
  minScore?: number;
}
```

### MemoryIndexManager 高级配置

```typescript
interface MemoryStorageConfig {
  /**
   * 同步配置
   */
  sync?: {
    /**
     * 搜索前自动同步
     * @default true
     */
    onSearch?: boolean;

    /**
     * 会话启动时预热索引
     * @default true
     */
    onSessionStart?: boolean;

    /**
     * 监控文件变化
     * @default true
     */
    watch?: boolean;

    /**
     * 文件变化防抖时间（毫秒）
     * @default 5000
     */
    watchDebounceMs?: number;

    /**
     * 定期同步间隔（分钟）
     * @default undefined（不启用）
     */
    intervalMinutes?: number;
  };

  /**
   * 查询配置
   */
  query?: {
    /**
     * 最大结果数
     * @default 5
     */
    maxResults?: number;

    /**
     * 最低分数
     * @default 0.0
     */
    minScore?: number;

    /**
     * 混合搜索配置
     */
    hybrid?: {
       enabled?: boolean;      // @default false
       vectorWeight?: number;  // @default 0.7
       textWeight?: number;    // @default 0.3
     };

    /**
     * 高亮配置
     */
    highlight?: {
       enabled?: boolean;      // @default false
       prefix?: string;       // @default "**"
       suffix?: string;       // @default "**"
       maxLength?: number;     // @default 200
     };

    /**
     * 过滤配置
     */
    filter?: {
       startDate?: string;    // 日期范围开始
       endDate?: string;      // 日期范围结束
       tags?: string[];       // 标签过滤
       sources?: Array<"memory" | "sessions">;  // 来源过滤
     };
  };
}
```

---

## 💡 配置建议

### 开发环境

```typescript
{
  enableMemory: false,  // 快速迭代
}
```

### 测试环境

```typescript
{
  enableMemory: true,
  // 使用临时目录
  dataDir: "./test-data",
}
```

### 生产环境

```typescript
{
  enableMemory: true,
  dataDir: "./data",
  // 定期备份
  // 添加监控
}
```

---

## 🚨 故障排查

### 问题 1：Memory 不工作

**检查**：
```typescript
// 1. 确认启用了 Memory
const config = agentManager.config;
console.log(config.enableMemory);  // 应该是 true

// 2. 检查 MemoryService 是否创建
const memoryService = agentManager.getMemoryService();
console.log(memoryService);  // 应该不是 undefined
```

### 问题 2：记忆没有被搜索

**检查**：
```typescript
// 1. 检查是否启用了搜索
const config = memoryService.config;
console.log(config.searchEnabled);  // 应该是 true

// 2. 检查是否有记忆文件
ls -la data/memory/

// 3. 手动搜索测试
const results = await memoryService.searchMemories("测试查询");
console.log(results.length);  // 应该 > 0
```

### 问题 3：文件没有被自动保存

**检查**：
```typescript
// 1. 检查是否启用了自动保存
const config = memoryService.config;
console.log(config.autoSaveEnabled);  // 应该是 true

// 2. 检查文件权限
ls -la data/memory/

// 3. 检查是否有写入错误
// 查看日志中的 "[Memory Service]" 相关错误
```

### 问题 4：性能问题

**优化方案**：
```typescript
{
  // 1. 禁用混合搜索（更快）
  hybrid: { enabled: false },

  // 2. 减少搜索结果
  maxResults: 3,

  // 3. 禁用文件监听（减少 I/O）
  watch: false,

  // 4. 增大同步间隔
  intervalMinutes: 60,
}
```

---

## 📚 参考文档

- [Memory 工作流程](./memory-workflow.md) - 详细的工作流程图
- [Memory Storage 使用指南](./memory-storage-guide.md) - 存储层详细说明
- [Memory 系统指南](./memory-guide.md) - 完整使用指南

---

**文档版本**: v1.0
**最后更新**: 2026-02-13
**维护者**: Claude Code
