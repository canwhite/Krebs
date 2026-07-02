# 计划：输入框防误触 Enter 发送

## 问题
用户输入时容易误按 Enter，导致空白或未完成的消息被发送。

## 方案

### 核心原则
参考 Claude Web / ChatGPT：保留发送按钮 + `Enter` 可用但安全

### 具体改动

#### 1. 修复 handleKeyDown (chat.tsx:646-651)
```tsx
const handleKeyDown = (e: any) => {
  if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    if (!input || !isConnected || isResponding) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    sendMessage();
  }
};
```

**Pre-mortem 结论：**
- `input === ""`（非 trim）— 纯空格内容正常发送，避免静默失败
- `isConnected` — 未连接时不发送
- `isResponding` — 响应中按 Enter 不发送（Claude Web 行为一致）
- `!e.metaKey && !e.ctrlKey` — 预留 Cmd/Ctrl+Enter 扩展，暂不实现

#### 2. 可选增强（暂不做，留作后续迭代）
- Enter 发送后短暂显示 "已发送" 反馈（替代 toast）
- 移动端 `inputmode="text"` 配合 `enterkeyhint="send"`

## 改动范围
- `frontend/chat.tsx`: 修改 `handleKeyDown` 函数（~5 行）

## 验证
1. `bun run build` 通过
2. 手动测试：
   - 空输入按 Enter → 不发送
   - 响应中按 Enter → 不发送
   - 正常输入按 Enter → 发送成功
   - `Shift+Enter` → 换行正常
