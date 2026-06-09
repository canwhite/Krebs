# Before Agent Start Extension - 扩展框架

## Context

需要一个 `before_agent_start` 的 extension 框架，用于在 Agent 开始前执行自定义逻辑。Krebs 是 WebSocket 模式，暂不实现确认功能，先创建好框架供后续扩展。

---

## 实现方案

### 1. 创建 Extension 文件

**目标位置**: `/Users/Admin/Desktop/Krebs/.pi/extensions/before-agent-confirm/index.ts`

### 2. 代码

```typescript
// .pi/extensions/before-agent-confirm/index.ts

export default function (api) {
  api.on("before_agent_start", async (event, ctx) => {
    // 日志记录（可在调试时打开）
    // console.log("[BeforeAgentConfirm] ========== BEFORE AGENT START ==========");
    // console.log("[BeforeAgentConfirm] Prompt:", event.prompt);
    // console.log("[BeforeAgentConfirm] System Prompt:", event.systemPrompt);
    // console.log("[BeforeAgentConfirm] Has UI:", ctx.hasUI);

    // 后续扩展点：
    // 1. 人工确认：需要 Krebs 支持 WebSocket 确认协议
    // 2. 上下文修改：修改 event.prompt 或 event.systemPrompt
    // 3. 日志记录：接入监控系统
    // 4. 白名单/黑名单：检查 prompt 是否允许执行

    // 返回值可选：
    // - { message: {...} }: 添加额外消息
    // - { systemPrompt: "..." }: 替换 system prompt
    // - 无返回值: 继续执行
  });
}
```

### 3. 目录结构

```
.pi/extensions/before-agent-confirm/
└── index.ts
```

---

## 加载机制

根据 `loader.js`，pi 会自动从以下位置加载 extensions：
1. `cwd/.pi/extensions/` ✅ Krebs 项目根目录
2. `agentDir/extensions/` - Agent 安装目录
3. 显式配置的路径

---

## 验证方式

1. 创建文件后重启 Krebs
2. 发送消息，观察日志输出
3. 确认 extension 被正确加载（无报错）

---

## 后续扩展方向

1. **人工确认**: 需要在 Krebs 前端添加 WebSocket 确认协议
2. **上下文修改**: 修改 prompt 或 system prompt
3. **日志接入**: 接入监控系统
4. **安全检查**: 白名单/黑名单检查
