# 计划：Window Focus 时自动连接 WebSocket

## 需求
当用户切换回浏览器标签页（window 获得焦点）时，如果 WebSocket 未连接，自动尝试重连，改善用户体验。

## 现状分析
- `chat.tsx` 的 `connect()` 函数负责建立 WebSocket 连接
- `useEffect` 在组件挂载时调用一次 `checkAuth()` → `connect()`
- `onclose` 事件仅在认证失败（1008/4001）时重试，无法处理网络波动导致的断开

## Pre-mortem 风险分析

### Risk 1: 闭包陷阱 - 状态值在 useEffect 闭包中可能过期
`isConnected` 和 `isConnecting` 在 `useEffect` 闭包中捕获的不是最新值。

**解决方案**：使用 ref 来追踪最新的连接状态。

### Risk 2: 与 onclose 重试逻辑冲突
`onclose` 已有重试逻辑（1008/4001 时最多 3 次），focus 触发的新连接可能与之冲突。

**解决方案**：在 `connect` 内部使用 `isConnectingRef` 防止重复发起连接。

### Risk 3: focus 事件触发时 WebSocket 正在 closing 过程中
快速切换标签页时，WebSocket 可能处于 `CLOSING` 状态。

**解决方案**：在 `handleFocus` 中检查 `ws.readyState === WebSocket.CLOSED`。

### Risk 4: 组件卸载后 focus 事件处理器仍在运行
组件卸载后事件处理器可能仍在运行，访问已清理的 refs。

**解决方案**：使用 `isMountedRef` 标记组件挂载状态。

---

## 实现方案

```tsx
const isConnectingRef = useRef(false);
const isMountedRef = useRef(true);

useEffect(() => {
  isMountedRef.current = true;
  return () => { isMountedRef.current = false; };
}, []);

useEffect(() => {
  isConnectingRef.current = isConnecting;
}, [isConnecting]);

useEffect(() => {
  const handleFocus = () => {
    if (!isMountedRef.current) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      console.log("[DEBUG] Window gained focus, attempting reconnect...");
      connect();
    }
  };

  window.addEventListener("focus", handleFocus);
  return () => window.removeEventListener("focus", handleFocus);
}, [connect]);
```

## 注意事项
1. **isConnectingRef**：用于在 handleFocus 闭包中获取最新的连接状态
2. **isMountedRef**：防止组件卸载后事件处理器仍尝试访问已清理的 refs
3. **ws.readyState 检查**：确保只在连接真正关闭时重连，避免与 CLOSING 状态的连接冲突
4. **依赖项**：仅依赖 `connect`（useCallback 稳定引用），避免 `isConnected` 和 `isConnecting` 作为依赖导致的问题

## 文件变更
- `frontend/chat.tsx`：新增一个 `useEffect`

## 验证
- 断开 WebSocket → 切换标签页 → 切回，验证是否自动重连
- `bun run build` + `bunx tsc --noEmit` 确认无错误
