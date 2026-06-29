# Pi Agent Extension 加载机制

> 基于 `pi-coding-agent@0.66.1` 源码验证

## 核心结论

**pi agent 只提供扩展调度框架，不内置任何 context/memory 等钩子实现。**

无论是官方功能还是自定义扩展，都需要通过 `extensionFactories` 显式注册才能生效。

---

## 一、Extension 加载方式

### 1. extensionFactories（内联工厂函数）✅ 当前使用

```typescript
extensionFactories: [subagents, tasks, memoryExtension, contextExtension]
```

- 直接传入工厂函数
- 通过 `loadExtensionFromFactory()` 加载
- **不需要文件路径解析**

### 2. additionalExtensionPaths（显式路径）

```typescript
additionalExtensionPaths: [".pi/extensions/memory", ".pi/extensions/context"]
```

- 传入文件路径
- 通过 `loadExtensions(paths)` 加载
- **当前未被使用**

### 3. discoverAndLoadExtensions（自动发现）

```typescript
import { discoverAndLoadExtensions } from "@mariozechner/pi-coding-agent";

await discoverAndLoadExtensions(configuredPaths, cwd, agentDir);
```

**扫描位置：**
1. `cwd/.pi/extensions/` (项目本地)
2. `agentDir/extensions/` (全局)
3. `configuredPaths` (显式配置)

**问题：此函数从未被调用**，自动发现机制不生效。

---

## 二、扩展调度机制：emitContext

### 源码位置

`node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/runner.js:520`

### 工作原理

```javascript
async emitContext(messages) {
    let currentMessages = structuredClone(messages);

    // 遍历所有注册的扩展
    for (const ext of this.extensions) {
        const handlers = ext.handlers.get("context");
        if (!handlers || handlers.length === 0) continue;

        // 遍历该扩展的所有 context handler
        for (const handler of handlers) {
            const event = { type: "context", messages: currentMessages };
            const handlerResult = await handler(event, ctx);

            // 如果返回 { messages: ... }，则传给下一个 handler
            if (handlerResult && handlerResult.messages) {
                currentMessages = handlerResult.messages;
            }
        }
    }
    return currentMessages;
}
```

### 关键特性

| 特性 | 说明 |
|------|------|
| 链式调用 | 一个扩展的输出作为下一个的输入 |
| 按序执行 | 按 `extensionFactories` 数组顺序 |
| 可修改消息 | 返回 `{ messages: newMessages }` 才会传递修改 |
| 原样传递 | 返回 `{}` 或 `undefined` 则保持当前消息 |

### 触发时机

```javascript
// sdk.js:190-194
transformContext: async (messages) => {
    const runner = extensionRunnerRef.current;
    if (!runner) return messages;
    return runner.emitContext(messages);  // 每次 LLM 调用前触发
},
```

**每次 LLM 调用前**触发，context hook 的名称来源于此。

---

## 三、context hook 链执行示例

```
[LLM 调用前]
    ↓
emitContext(messages)
    ↓
┌─────────────────────────────────────────────────────┐
│ memory (memoryExtension) - 50% 阈值                  │
│   - 检查 usage.percent >= 0.5                       │
│   - 写入 MEMORY.md                                   │
│   - 返回 {} (不修改 messages)                       │
└─────────────────────────────────────────────────────┘
    ↓ messages 原样传递
┌─────────────────────────────────────────────────────┐
│ context (contextExtension) - 70%/75% 阈值           │
│   - usage.percent >= 0.7 → Micro Compact          │
│   - usage.percent >= 0.75 → Context Collapse       │
│   - 返回 { messages: projected }                   │
└─────────────────────────────────────────────────────┘
    ↓ projected messages
[LLM 调用]
```

---

## 四、Extension 注册流程

```
session-service.ts
    ↓
ResourceLoader.reload()
    ↓
1. loadExtensions(extensionPaths)  // npm 包/配置的扩展
2. loadExtensionFactories()         // 内联工厂函数
    ↓
ExtensionRunner 实例化
    ↓
AgentLoop 执行
    ↓
transformContext: emitContext()
    ↓
链式调用所有注册的 context handler
```

---

## 五、相关源码文件

| 文件 | 用途 |
|------|------|
| `dist/core/extensions/loader.js` | 扩展加载器（loadExtensions, discoverAndLoadExtensions） |
| `dist/core/extensions/runner.js` | 扩展调度器（emitContext, emitBeforeProviderRequest） |
| `dist/core/resource-loader.js` | ResourceLoader，调用 loader.js |
| `dist/core/sdk.js` | Agent 配置，transformContext 触发 emitContext |

---

## 六、验证方法

```bash
# 确认扩展是否被加载
grep -n "extensionFactories" server/session-service.ts

# 查看 emitContext 实现
grep -n "emitContext" node_modules/@mariozechner/pi-coding-agent/dist/core/extensions/runner.js -A 30

# 确认 transformContext 触发时机
grep -n "transformContext" node_modules/@mariozechner/pi-coding-agent/dist/core/sdk.js -A 5
```
