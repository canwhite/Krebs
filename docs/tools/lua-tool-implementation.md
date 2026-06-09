# Lua 工具系统实现总结

## 核心问题

1. **Agent 只看到 `lua_exec` 一个工具**，不知道具体有哪些 Lua 脚本
2. **wasmoon 无原生 JS 能力**，Lua 无法访问 Date、Math、文件系统

## 解决方案

从 `.lua` 文件动态生成 `ToolDefinition`，注册到 Agent 的工具列表。

```
启动时:
  lua-tools/*.lua
       ↓
  解析元信息 (name/description/params)
       ↓
  生成 ToolDefinition[]
       ↓
  注册到 TOOLS 数组
       ↓
  Agent 直接看到每个 Lua 工具
```

---

## 关键实现

### 1. JS-Lua 桥接 (`tools/lua-runtime.ts`)

wasmoon 通过 `lua.global.set()` 注册 JS 函数为 Lua 全局函数：

```typescript
// 时间
luaEngine.global.set("js_now", () => Date.now());
luaEngine.global.set("js_format_date", (ts: number, tz?: string) =>
  new Date(ts).toLocaleString("zh-CN", { timeZone: tz })
);

// 数学
luaEngine.global.set("js_random", (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min
);

// 文件操作（带安全校验）
luaEngine.global.set("js_write_file", async (path: string, content: string) => {
  const fs = await import("node:fs/promises");
  const safePath = validatePath(path);  // 防止路径遍历
  await fs.writeFile(safePath, content, "utf-8");
  return { success: true, path: safePath };
});
```

Lua 中调用：
```lua
local ts = js_now()
local r = js_random(1, 100)
js_write_file("test.txt", "hello")
```

### 2. 元信息解析 (`tools/lua-tools-registry.ts`)

`.lua` 文件格式：
```lua
-- name: datetime.now
-- description: 获取当前时间戳
-- params: {}

return js_now()
```

解析器提取：
- `-- name:` → 工具名
- `-- description:` → 描述
- `-- params:` → 参数 schema（JSON）
- 剩余行 → Lua 脚本

### 3. ToolDefinition 生成

```typescript
function createToolDefinition(meta: LuaToolMeta): ToolDefinition {
  return {
    name: meta.name.replace(/\./g, "_"),  // "datetime.now" → "datetime_now"
    label: meta.name,
    description: meta.description,
    parameters: Type.Object(paramSchema),
    execute: async (_, params) => {
      const result = await luaRuntime.execute(meta.script, params);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  };
}
```

### 4. 动态注册 (`tools/index.ts`)

```typescript
export function registerTool(definition: ToolDefinition): void {
  const existing = TOOLS.findIndex(t => t.name === definition.name);
  if (existing >= 0) {
    TOOLS[existing] = { ... };
  } else {
    TOOLS.push({ ... });
  }
}
```

### 5. 启动初始化 (`server/index.ts`)

```typescript
async function initLuaTools() {
  await luaRuntime.initialize();  // JS 桥接函数在此注册
  const definitions = await loadLuaToolDefinitions(luaToolsPath);
  for (const def of definitions) {
    registerTool(def);  // 加入 TOOLS 数组
  }
}
initLuaTools();  // 服务器启动时调用
```

---

## 并发安全

`lua-runtime.ts` 使用 `AsyncMutex` 保证同一时刻只有一个 Lua 执行：

```typescript
class AsyncMutex {
  private mutex = Promise.resolve();

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const release = this.mutex;
    let unlock: () => void;
    const lock = new Promise<void>(r => { unlock = r; });
    this.mutex = this.mutex.then(async () => { await lock; });
    try {
      await release;
      return await fn();
    } finally {
      unlock!();
    }
  }
}
```

---

## 安全路径校验

```typescript
function validatePath(path: string): string {
  if (path.startsWith("/")) throw new Error("Absolute paths not allowed");
  if (path.includes("..")) throw new Error("Path traversal not allowed");
  const fullPath = join(CUSTOM_DIR, path);
  if (!fullPath.startsWith(CUSTOM_DIR)) throw new Error("Path traversal detected");
  return fullPath;
}
```

---

## 工具清单

| 工具名 | Lua 脚本 | 说明 |
|--------|----------|------|
| `datetime_now` | `return js_now()` | 获取时间戳 |
| `datetime_format` | `js_format_date(ts, tz)` | 格式化时间 |
| `math_random` | `js_random(min, max)` | 随机整数 |
| `string_upper` | `string.upper(params.str)` | 转大写 |
| `string_lower` | `string.lower(params.str)` | 转小写 |
| `file_write` | `js_write_file(path, content)` | 写入文件 |
| `file_read` | `js_read_file(path)` | 读取文件 |
| `file_exists` | `js_exists(path)` | 检查存在 |
| `json_encode` | 纯 Lua JSON 编码 | 编码值 |

---

## 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                     server/index.ts                           │
│                         │                                    │
│                    initLuaTools()                            │
│                         │                                    │
│            ┌────────────┴────────────┐                      │
│            │                         │                       │
│   luaRuntime.initialize()    loadLuaToolDefinitions()        │
│            │                         │                       │
│   注册 JS 桥接函数              解析 .lua 元信息              │
│   js_now, js_random,          生成 ToolDefinition[]         │
│   js_write_file, ...                                        │
│            │                         │                       │
│            └────────────┬────────────┘                       │
│                         │                                    │
│                    registerTool()                            │
│                         │                                    │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                    tools/index.ts                            │
│                         │                                    │
│              TOOLS: [lua_exec, datetime_now,                │
│                       string_upper, file_write, ...]         │
│                         │                                    │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│              session-service.ts                              │
│                         │                                    │
│        createAgentSession({ customTools: TOOLS.map(...) })   │
│                         │                                    │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                   Agent 可见工具                              │
│                                                              │
│   read | bash | edit | lua_exec | datetime_now |            │
│   string_upper | file_write | ...                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 新增文件

| 文件 | 说明 |
|------|------|
| `tools/lua-runtime.ts` | WASM 运行时 + JS 桥接 |
| `tools/lua-tools-registry.ts` | 解析器 + ToolDefinition 生成 |
| `lua-tools/*.lua` | 9 个 Lua 工具脚本 |
| `docs/lua-tool-integration.md` | 集成方案文档 |
| `docs/lua-tool-implementation.md` | 本文档 |
