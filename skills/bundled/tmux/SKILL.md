---
name: Tmux
description: "通过发送按键和抓取窗格输出来远程控制 tmux 会话，用于交互式命令行界面。"
metadata: '{"krebs":{"emoji":"🧵","category":"Development","tags":["tmux","terminal","session","devops"]}}'
install:
  - kind: "brew"
    formula: "tmux"
    bins: ["tmux"]
---

# Tmux Skill

使用 tmux 控制交互式 TTY 会话。**仅在需要交互式终端时使用**，对于长时间运行的非交互式任务，优先使用后台执行模式。

## 快速开始

### 创建独立会话（推荐方式）

```bash
# 设置 socket 目录
SOCKET_DIR="${TMPDIR:-/tmp}/krebs-tmux-sockets"
mkdir -p "$SOCKET_DIR"
SOCKET="$SOCKET_DIR/krebs.sock"
SESSION=krebs-session

# 创建新会话
tmux -S "$SOCKET" new-session -d -s "$SESSION" -n shell

# 发送命令
tmux -S "$SOCKET" send-keys -t "$SESSION":0.0 -- 'echo "Hello from tmux"' Enter

# 捕获输出
tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION":0.0 -S -200
```

### 监控命令

创建会话后，始终提供监控命令：

```bash
# 附加到会话（交互式）
tmux -S "$SOCKET" attach -t "$SESSION"

# 捕获最近输出
tmux -S "$SOCKET" capture-pane -p -J -t "$SESSION":0.0 -S -200
```

## Socket 约定

- Socket 目录：使用自定义路径，如 `${TMPDIR}/krebs-tmux-sockets`
- 默认 socket 路径：`"{SOCKET_DIR}/krebs.sock"`
- 使用独立 socket 避免与用户 tmux 会话冲突

## 目定位面和命名

- 目标格式：`session:window.pane`（默认 `:0.0`）
- 保持名称简短，避免空格
- 检查会话：`tmux -S "$SOCKET" list-sessions`
- 检查窗格：`tmux -S "$SOCKET" list-panes -a`

## 查找会话

```bash
# 列出指定 socket 上的会话
tmux -S "$SOCKET" list-sessions

# 显示所有窗格信息
tmux -S "$SOCKET" list-panes -a -F "#{session_name}:#{window_index}.#{pane_index} #{pane_pid}"
```

## 安全发送输入

### 字面发送（推荐）

```bash
tmux -S "$SOCKET" send-keys -t target -l -- 'command with "quotes" and $vars'
```

### 控制键

```bash
# 发送 Ctrl+C
tmux -S "$SOCKET" send-keys -t target C-c

# 发送其他组合
tmux -S "$SOCKET" send-keys -t target M-x  # Meta+x
```

## 监控输出

### 捕获历史

```bash
# 捕获最近 200 行
tmux -S "$SOCKET" capture-pane -p -J -t target -S -200

# 捕获所有历史
tmux -S "$SOCKET" capture-pane -p -J -t target -S -
```

### 等待文本提示

创建辅助脚本等待特定文本出现：

```bash
# 轮询窗格直到出现匹配的文本
while ! tmux -S "$SOCKET" capture-pane -p -t "$SESSION":0.0 -S -3 | grep -q "❯"; do
  sleep 0.5
done

echo "Session ready, prompt returned"
```

### 附加和分离

- 附加到会话：`tmux -S "$SOCKET" attach -t "$SESSION"`
- 分离会话：按 `Ctrl+b d`（前缀键 + d）

## 启动进程

### Python REPL

```bash
tmux -S "$SOCKET" send-keys -t "$SESSION" -- 'PYTHON_BASIC_REPL=1 python3 -q' Enter
```

**注意**：设置 `PYTHON_BASIC_REPL=1` 使用基础 REPL（增强版会破坏 send-keys 流程）

### 其他 REPL

类似方法启动 Node、irb 等：

```bash
# Node.js
tmux -S "$SOCKET" send-keys -t "$SESSION" -- 'node' Enter

# Ruby
tmux -S "$SOCKET" send-keys -t "$SESSION" -- 'irb' Enter
```

## 编排多个会话

tmux 擅长并行运行多个任务：

```bash
SOCKET="${TMPDIR:-/tmp}/parallel.sock"

# 创建多个会话
for i in 1 2 3; do
  tmux -S "$SOCKET" new-session -d -s "task-$i"
done

# 在不同会话中执行命令
tmux -S "$SOCKET" send-keys -t task-1 'cd /tmp/project1 && npm test' Enter
tmux -S "$SOCKET" send-keys -t task-2 'cd /tmp/project2 && npm run build' Enter
tmux -S "$SOCKET" send-keys -t task-3 'cd /tmp/project3 && git pull' Enter

# 轮询检查完成状态
for sess in task-1 task-2 task-3; do
  if tmux -S "$SOCKET" capture-pane -p -t "$sess" -S -3 | grep -q "❯\\|$"; then
    echo "$sess: DONE"
  else
    echo "$sess: Running..."
  fi
done

# 获取已完成会话的完整输出
tmux -S "$SOCKET" capture-pane -p -t task-1 -S -500
```

## 清理

### 杀死单个会话

```bash
tmux -S "$SOCKET" kill-session -t "$SESSION"
```

### 杀死 socket 上的所有会话

```bash
tmux -S "$SOCKET" list-sessions -F '#{session_name}' | \
  xargs -r -n1 tmux -S "$SOCKET" kill-session -t
```

### 完全清理（删除服务器）

```bash
tmux -S "$SOCKET" kill-server
```

## 最佳实践

1. **使用独立 socket**：避免与用户的 tmux 会话冲突
2. **保持会话名称简短**：便于管理
3. **字面发送输入**：避免引号和变量展开问题
4. **监控完成状态**：通过检查 shell 提示符（`❯` 或 `$`）
5. **及时清理**：使用完毕后关闭会话

## 常见问题

### Q: 什么时候使用 tmux 而不是后台执行？
A: 仅在需要交互式 TTY 时使用 tmux，例如：
- 需要用户输入的程序
- 交互式 REPL（Python、Node 等）
- 需要实时查看输出的任务

对于简单的后台任务，使用 `&` 或 `nohup` 即可。

### Q: 如何检测命令执行完成？
A: 捕获窗格输出，检查是否出现 shell 提示符：

```bash
tmux -S "$SOCKET" capture-pane -p -t "$SESSION":0.0 -S -3 | grep -q "❯\\|$"
```

### Q: Windows 上如何使用？
A: 在 WSL 中安装 tmux，然后在 WSL 环境中使用本技能。
