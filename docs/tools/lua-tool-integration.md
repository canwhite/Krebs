# Lua 工具集成方案

## 问题背景

### 当前架构

```
server/index.ts 启动时:
  └─ initLuaTools()
       ├─ luaRuntime.initialize()
       └─ loadLuaToolsFromDirectory("lua-tools") → luaToolMap (in-memory Map)

session 创建时:
  └─ createRuntimeFactory()
       └─ createAgentSession({ customTools: TOOLS.map(t => t.tool) })
            └─ 只看到 getCurrentTimeTool + luaExecTool (两个工具)
```

### 核心问题

1. **Agent 只看到 `lua_exec` 这一个工具**，不知道具体有哪些 Lua 脚本
2. **wasmoon 无原生 JS 能力**，Lua 代码无法访问 Date、Math、HTTP 等 JS API

### 解决目标

让 AI 能**直接调用**每个 Lua 工具（如 `string_upper`、`math_random`），而不是通过 `lua_exec` 间接调用。

---

## 解决方案

### 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                         启动时初始化                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  lua-tools/*.lua                                                 │
│       │                                                          │
│       ▼                                                          │
│  解析元信息 (name/description/params)                            │
│       │                                                          │
│       ▼                                                          │
│  生成 ToolDefinition[]                                           │
│       │                                                          │
│       ▼                                                          │
│  注册到 TOOLS 数组                                                │
│       │                                                          │
│       ▼                                                          │
│  createRuntimeFactory 读取 TOOLS.map(t => t.tool)                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         运行时                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Agent 调用 string_upper                                         │
│       │                                                          │
│       ▼                                                          │
│  ToolDefinition.execute()                                        │
│       │                                                          │
│       ├── 设置 lua.global.params = { str: "hello" }              │
│       │                                                          │
│       └── luaRuntime.execute(luaScript)                          │
│                    │                                             │
│                    ▼                                             │
│               wasmoon WASM 执行 Lua                              │
│                    │                                             │
│                    ├── Lua 调用 js_xxx() ──→ JS 桥接函数         │
│                    │                                             │
│                    └── return result                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## JS-Lua 桥接机制

### 为什么需要桥接

wasmoon 是 Lua 5.4 的 WebAssembly 编译版本，**没有原生访问 JS 的能力**：

```lua
-- Lua 无法直接做到：
print(Date.now())           -- ❌ Date 不存在
local r = math.random(1,10) -- ⚠️ Lua math.random 不是 JS 的 Math.random
os.date("*t", ts)          -- ⚠️ 不支持时区参数
os.execute("cat file.txt") -- ⚠️ wasmoon 不支持 os.execute
```

### 桥接方案

通过 `lua.global.set()` 将 JS 函数注册为 Lua 全局函数：

```typescript
// tools/lua-runtime.ts
lua.global.set('js_now', () => Date.now());
lua.global.set('js_random', (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min
);
lua.global.set('js_format_date', (ts: number, tz?: string) =>
  new Date(ts).toLocaleString('zh-CN', { timeZone: tz || 'local' })
);
lua.global.set('js_write_file', async (path: string, content: string) => {
  // 安全校验 + 写入
});
lua.global.set('js_read_file', async (path: string) => {
  // 安全校验 + 读取
});
```

```lua
-- Lua 中即可调用：
local ts = js_now()
local r = js_random(1, 100)
local s = js_format_date(ts, "Asia/Shanghai")
local ok = js_write_file("custom/test.txt", "hello")
```

### 桥接函数清单

| JS 函数 | Lua 调用 | 说明 |
|---------|----------|------|
| `Date.now()` | `js_now()` | 获取当前 Unix 时间戳（毫秒） |
| `Math.random()` | `js_random(min, max)` | 生成指定范围随机整数 |
| `Date.toLocaleString()` | `js_format_date(ts, timezone?)` | 格式化时间字符串 |
| `fs.writeFile()` | `js_write_file(path, content)` | 写入文件（安全路径校验） |
| `fs.readFile()` | `js_read_file(path)` | 读取文件（安全路径校验） |
| `fs.exists()` | `js_exists(path)` | 检查文件是否存在 |

---

## 完整工具迁移计划

### 现有 TS 工具

| 工具 | 文件 | 迁移方式 |
|------|------|----------|
| `get-current-time` | `tools/get-current-time.ts` | ✅ 转为 Lua（datetime.now, datetime.format） |
| `write-file` | `tools/write-file.ts`（禁用） | ✅ 转为 Lua（js_write_file 桥接） |
| `lua-exec` | `tools/lua-exec.ts` | ❌ 保留（fallback/调试用） |

### 迁移后删除的文件

- `tools/get-current-time.ts` → 删除
- `tools/write-file.ts` → 删除

---

## JS 桥接函数完整清单

```typescript
// tools/lua-runtime.ts

// ===== 时间相关 =====
lua.global.set('js_now', () => Date.now());

lua.global.set('js_format_date', (ts: number, tz?: string) => {
  return new Date(ts).toLocaleString('zh-CN', {
    timeZone: tz || Intl.DateTimeFormat().resolvedOptions().timeZone
  });
});

// ===== 数学相关 =====
lua.global.set('js_random', (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
});

// ===== 文件操作相关 =====
const CUSTOM_DIR = join(process.cwd(), 'custom');

function validatePath(path: string): string {
  const fullPath = path.startsWith('/') ? path : join(CUSTOM_DIR, path);
  if (!fullPath.startsWith(CUSTOM_DIR)) {
    throw new Error('Path traversal detected');
  }
  return fullPath;
}

lua.global.set('js_write_file', async (path: string, content: string) => {
  const fs = await import('node:fs/promises');
  const safePath = validatePath(path);
  await fs.writeFile(safePath, content, 'utf-8');
  return { success: true, path: safePath };
});

lua.global.set('js_read_file', async (path: string) => {
  const fs = await import('node:fs/promises');
  const safePath = validatePath(path);
  const content = await fs.readFile(safePath, 'utf-8');
  return { success: true, content };
});

lua.global.set('js_exists', async (path: string) => {
  const fs = await import('node:fs/promises');
  try {
    await fs.access(validatePath(path));
    return true;
  } catch {
    return false;
  }
});
```

---

## 迁移后的 Lua 工具集

| 工具名 | 说明 | Lua 脚本 |
|--------|------|----------|
| `datetime.now` | 获取当前时间戳 | `return js_now()` |
| `datetime.format` | 格式化时间 | `return js_format_date(params.timestamp, params.timezone)` |
| `math.random` | 生成随机数 | `return js_random(params.min, params.max)` |
| `string.upper` | 转大写 | `return string.upper(params.str)` |
| `string.lower` | 转小写 | `return string.lower(params.str)` |
| `file.write` | 写入文件 | `return js_write_file(params.path, params.content)` |
| `file.read` | 读取文件 | `return js_read_file(params.path)` |
| `file.exists` | 检查文件存在 | `return js_exists(params.path)` |

---

## 文件变更

| 文件 | 操作 |
|------|------|
| `tools/lua-runtime.ts` | 扩展：添加文件操作 JS 桥接函数 |
| `tools/lua-tools-registry.ts` | 添加 `parseLuaMetadata()` 和 `loadLuaToolDefinitions()` |
| `tools/index.ts` | 添加 `registerTool()`，移除 `get-current-time` |
| `server/index.ts` | 修改 initLuaTools，初始化全部 JS 桥接 |
| `lua-tools/datetime-now.lua` | 新建 |
| `lua-tools/datetime-format.lua` | 新建 |
| `lua-tools/math-random.lua` | 新建（已有） |
| `lua-tools/string-upper.lua` | 新建（已有） |
| `lua-tools/string-lower.lua` | 新建（已有） |
| `lua-tools/file-write.lua` | 新建 |
| `lua-tools/file-read.lua` | 新建 |
| `lua-tools/file-exists.lua` | 新建 |
| `tools/get-current-time.ts` | 删除 |
| `tools/write-file.ts` | 删除 |

---

## 实现细节

### 1. lua-tools 元信息格式

```lua
-- file-write.lua
-- name: file.write
-- description: 写入内容到文件（限制在 custom/ 目录）
-- params: {
--   "path": {"type": "string", "description": "文件路径（相对于 custom/）"},
--   "content": {"type": "string", "description": "文件内容"}
-- }

local p = params
return js_write_file(p.path, p.content)
```

### 2. 安全路径校验

```typescript
// 所有文件操作必须校验路径，防止路径遍历攻击
const CUSTOM_DIR = join(process.cwd(), 'custom');

function validatePath(path: string): string {
  // 禁止绝对路径
  if (path.startsWith('/')) {
    throw new Error('Absolute paths not allowed');
  }
  // 禁止 .. 遍历
  if (path.includes('..')) {
    throw new Error('Path traversal not allowed');
  }
  const fullPath = join(CUSTOM_DIR, path);
  if (!fullPath.startsWith(CUSTOM_DIR)) {
    throw new Error('Path traversal detected');
  }
  return fullPath;
}
```

### 3. 解析器实现

```typescript
// tools/lua-tools-registry.ts

interface LuaToolMeta {
  name: string;
  description: string;
  params: Record<string, { type: string; description: string }>;
  script: string;
}

function parseLuaMetadata(content: string, filename: string): LuaToolMeta {
  const lines = content.split('\n');
  const meta: Partial<LuaToolMeta> = {};
  const scriptLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('-- name:')) {
      meta.name = line.replace('-- name:', '').trim();
    } else if (line.startsWith('-- description:')) {
      meta.description = line.replace('-- description:', '').trim();
    } else if (line.startsWith('-- params:')) {
      const paramsStr = line.replace('-- params:', '').trim();
      meta.params = JSON.parse(paramsStr);
    } else if (!line.startsWith('--')) {
      scriptLines.push(line);
    }
  }

  meta.script = scriptLines.join('\n');
  return meta as LuaToolMeta;
}
```

### 4. ToolDefinition 生成

```typescript
// tools/lua-tools-registry.ts

import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

function createToolDefinition(meta: LuaToolMeta): ToolDefinition {
  // "file.write" → "file_write"
  const toolName = meta.name.replace(/\./g, "_");

  const paramProps: Record<string, any> = {};
  for (const [key, val] of Object.entries(meta.params)) {
    paramProps[key] = Type.String({ description: val.description });
  }

  return {
    name: toolName,
    label: meta.name,
    description: meta.description,
    parameters: Type.Object(paramProps),
    execute: async (_, params, _signal, _onUpdate, _ctx) => {
      const result = await luaRuntime.execute(meta.script, params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        details: {},
      };
    },
  };
}
```

### 5. 启动时初始化

```typescript
// server/index.ts

async function initLuaTools() {
  try {
    await luaRuntime.initialize();

    // ===== 注册 JS 桥接函数 =====

    // 时间
    luaRuntime.registerJsFunction('js_now', () => Date.now());
    luaRuntime.registerJsFunction('js_format_date', (ts: number, tz?: string) =>
      new Date(ts).toLocaleString('zh-CN', { timeZone: tz || 'local' })
    );

    // 数学
    luaRuntime.registerJsFunction('js_random', (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1)) + min
    );

    // 文件操作
    luaRuntime.registerJsFunction('js_write_file', async (path: string, content: string) => {
      const fs = await import('node:fs/promises');
      const safePath = validatePath(path);
      await fs.writeFile(safePath, content, 'utf-8');
      return { success: true, path: safePath };
    });

    luaRuntime.registerJsFunction('js_read_file', async (path: string) => {
      const fs = await import('node:fs/promises');
      const safePath = validatePath(path);
      const content = await fs.readFile(safePath, 'utf-8');
      return { success: true, content };
    });

    luaRuntime.registerJsFunction('js_exists', async (path: string) => {
      const fs = await import('node:fs/promises');
      try {
        await fs.access(validatePath(path));
        return true;
      } catch {
        return false;
      }
    });

    // ===== 加载 Lua 工具 =====
    const definitions = await loadLuaToolDefinitions(luaToolsPath);
    for (const def of definitions) {
      registerTool(def);
    }

    console.log(`[Lua] 已加载 ${definitions.length} 个工具`);
  } catch (error: any) {
    console.warn(`[Lua] 初始化失败: ${error.message}`);
  }
}
```

---

## 验证步骤

1. 启动服务器
   ```bash
   bun run server/index.ts
   ```

2. 确认日志输出
   ```
   [Lua] 已加载 8 个工具 + js_xxx 桥接函数
   ```

3. 测试 datetime.now
   ```
   用户: 获取当前时间戳
   Agent → datetime_now()
   期望: { success: true, result: 1717846323000 }
   ```

4. 测试 string.upper
   ```
   用户: 把 "hello" 转成大写
   Agent → string_upper({ str: "hello" })
   期望: { success: true, result: "HELLO" }
   ```

5. 测试 file.write
   ```
   用户: 写入 "hello world" 到 test.txt
   Agent → file_write({ path: "test.txt", content: "hello world" })
   期望: { success: true, path: "..." }
   ```

6. 测试 file.read
   ```
   用户: 读取 test.txt 的内容
   Agent → file_read({ path: "test.txt" })
   期望: { success: true, content: "hello world" }
   ```

---

## 示例 Lua 工具

### datetime-now.lua

```lua
-- name: datetime.now
-- description: 获取当前 Unix 时间戳（毫秒）
-- params: {}

return js_now()
```

### datetime-format.lua

```lua
-- name: datetime.format
-- description: 格式化时间字符串
-- params: {
--   "timestamp": {"type": "number", "description": "Unix 时间戳（毫秒）"},
--   "timezone": {"type": "string", "description": "时区，如 'Asia/Shanghai'"}
-- }

local p = params
return js_format_date(p.timestamp, p.timezone)
```

### file-write.lua

```lua
-- name: file.write
-- description: 写入内容到文件（限制在 custom/ 目录）
-- params: {
--   "path": {"type": "string", "description": "文件路径（相对于 custom/）"},
--   "content": {"type": "string", "description": "文件内容"}
-- }

local p = params
return js_write_file(p.path, p.content)
```

### file-read.lua

```lua
-- name: file.read
-- description: 读取文件内容
-- params: {
--   "path": {"type": "string", "description": "文件路径（相对于 custom/）"}
-- }

local p = params
return js_read_file(p.path)
```

### file-exists.lua

```lua
-- name: file.exists
-- description: 检查文件是否存在
-- params: {
--   "path": {"type": "string", "description": "文件路径（相对于 custom/）"}
-- }

local p = params
return js_exists(p.path)
```
