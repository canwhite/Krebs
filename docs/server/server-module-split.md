# server.ts 模块拆分改造

## 背景

`server.ts` 膨胀至 1771 行，混合了以下关注点：

- API Token 认证
- Think 标签解析
- Session CRUD
- Route handler（auth / messages / sessions）
- WebSocket 事件订阅（重复 2 次，~200 行 × 2）
- Server bootstrap + 路由分发

## 拆分策略

按**单一职责**拆为 7 个模块 + 2 个路由文件：

```
server/
├── index.ts                  # Server bootstrap + 路由分发 + WS handler
├── auth.ts                   # API Token 生成/验证/Cookie
├── think-parser.ts           # Think 标签流式解析状态机
├── session-service.ts        # Session CRUD + runtime factory + 等待/读取工具
├── event-subscription.ts     # WebSocket 事件订阅（去重后单份）
└── routes/
    ├── index.ts              # corsHeaders
    ├── auth.ts               # /api/auth/internal, /api/auth POST
    ├── messages.ts           # POST /api/messages
    └── sessions.ts           # Session 创建/删除/查询
```

## 关键改动

### 1. 去重事件订阅

原代码中 `setupEventSubscriptionForSwitch` 与 `open` handler 内的订阅回调几乎一致（~200 行重复）。提取为单一工厂函数 `subscribeToSessionEvents()`，两个调用点复用同一份逻辑。

### 2. 模块职责划分

| 模块 | 职责 | 行数 |
|------|------|------|
| `index.ts` | Bun.serve, 路由分发, WS open/message/close | ~220 |
| `auth.ts` | token 生成/读取/验证/Cookie | ~100 |
| `think-parser.ts` | `<think>` 标签流式解析 | ~95 |
| `session-service.ts` | session 增删查, runtime 工厂, 超时等待, 文件读取 | ~320 |
| `event-subscription.ts` | AI 事件 → WS 消息转发 | ~230 |
| `routes/auth.ts` | 认证接口处理 | ~35 |
| `routes/messages.ts` | HTTP 消息接口 | ~190 |
| `routes/sessions.ts` | HTTP session 接口 | ~130 |

### 3. 伴随修改

- **`package.json`**: `"start"` 从 `server.ts` 改为 `server/index.ts`
- **`tsconfig.json`**:
  - `"module"`: `"Preserve"` → `"ESNext"`（使 `import.meta.dir` 通过 TS 检查）
  - `"types"`: 空数组 → `["bun-types"]`（加载 Bun 类型声明，补全 `bun:sqlite`、`ImportMeta.dir` 等）
  - `"include"`: `"server.ts"` → `"server/**/*.ts"`（包含新目录结构）
  - `"typeRoots"`: 添加 `"./node_modules"`（使 `bun-types` 可被解析）

## 验证

1. `bunx --bun tsc --noEmit` — 类型检查无报错
2. `bun build ./server/index.ts --target bun` — 编译成功
3. 服务启动 → `/health` 返回 `{"status":"ok","sessions":0}`
