# Bash 工具超时问题诊断

**问题时间**: 2026-02-05
**错误类型**: Bash 工具执行超时

## 🔍 问题详情

### 错误信息
```
2026-02-05T14:12:27.525Z ERROR [BuiltinTools] Bash command failed:
curl -s -H "User-Agent: Mozilla/5.0" "https://news.ycombinator.com/" | head -100
{
  error: 'Command failed: ...',
  duration: 30010  # 30秒超时
}
```

### 命令
```bash
curl -s -H "User-Agent: Mozilla/5.0" "https://news.ycombinator.com/" | head -100
```

## 🧪 诊断过程

### 测试 1: 基本网络连接 ✅
```bash
curl -s -I "https://www.baidu.com"
# 结果: HTTP/1.1 200 OK (成功)
```

### 测试 2: 问题命令重现 ❌
```bash
time curl -s -H "User-Agent: Mozilla/5.0" "https://news.ycombinator.com/" | head -20
# 结果: 运行超过 10 秒，被手动终止
```

### 测试 3: 单独测试 news.ycombinator.com
```bash
curl -I "https://news.ycombinator.com/"
# 结果: 响应缓慢
```

## 📊 问题根因

### 主要原因
1. **目标网站响应慢** - news.ycombinator.com 在当前网络环境下响应缓慢
2. **固定超时时间** - bashTool 设置了 30 秒固定超时
3. **缺少超时配置** - 无法根据不同场景调整超时时间

### 次要原因
1. **管道命令** - 使用 `|` 管道符可能导致额外的延迟
2. **缺少错误上下文** - 错误信息中没有明确区分是超时还是其他错误

## ✅ 解决方案

### 方案 1: 增强超时配置（推荐）

**修改**: `src/agent/tools/builtin.ts`

```typescript
export interface BashToolOptions {
  timeout?: number;      // 超时时间（毫秒）
  maxBuffer?: number;    // 最大缓冲区
  shell?: string;        // Shell 路径
}

export const bashTool: Tool = {
  name: "bash",
  description: "Execute a bash shell command...",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute"
      },
      cwd: {
        type: "string",
        description: "Working directory (optional)"
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000)"
      }
    },
    required: ["command"]
  },

  async execute(params) {
    const command = params.command as string;
    const cwd = params.cwd as string | undefined;
    const timeout = params.timeout as number | undefined;

    const actualTimeout = timeout || 30000;

    // ... 执行命令，使用 actualTimeout
  }
};
```

**使用示例**:
```typescript
// 网络请求使用更长超时
{
  name: "bash",
  arguments: {
    command: 'curl -s "https://example.com"',
    timeout: 60000  // 60秒
  }
}

// 本地命令使用默认超时
{
  name: "bash",
  arguments: {
    command: 'ls -la'
    // 使用默认 30秒
  }
}
```

### 方案 2: 创建专用 Web 工具（更优雅）

**新文件**: `src/agent/tools/web.ts`

```typescript
export const webFetchTool: Tool = {
  name: "web_fetch",
  description: "Fetch a web page with automatic timeout handling",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL to fetch"
      },
      method: {
        type: "string",
        description: "HTTP method (default: GET)",
        enum: ["GET", "POST", "HEAD"]
      },
      timeout: {
        type: "number",
        description: "Timeout in seconds (default: 30)"
      },
      maxBytes: {
        type: "number",
        description: "Maximum response bytes (default: 100KB)"
      }
    },
    required: ["url"]
  },

  async execute(params) {
    const url = params.url as string;
    const timeout = (params.timeout as number) * 1000 || 30000;

    // 使用 Node.js fetch 或 axios
    // 自动处理超时、重试、错误
  }
};
```

### 方案 3: 改进错误信息

**修改**: `src/agent/tools/builtin.ts`

```typescript
childProcess.on("timeout", () => {
  logger.error(`Bash command timeout: ${command}`);

  resolve({
    success: false,
    error: `Command timed out after ${timeout}ms. ` +
           `Try increasing timeout or checking network connectivity.`,
    output: stdout || stderr,
  });
});
```

### 方案 4: 支持异步执行（高级）

**新工具**: `src/agent/tools/background.ts`

```typescript
export const backgroundCommandTool: Tool = {
  name: "background_exec",
  description: "Execute a command in the background",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      maxDuration: { type: "number" }
    },
    required: ["command"]
  },

  async execute(params) {
    // 启动后台进程
    // 返回进程 ID
    // 提供查询结果的工具
  }
};
```

## 🚀 立即可用的临时解决方案

### 方案 A: 增加全局超时

修改 `src/agent/tools/builtin.ts`:
```typescript
const timeout = 60000; // 从 30000 改为 60000
```

### 方案 B: 使用更快的命令

```bash
# ❌ 慢: curl entire page
curl -s "https://news.ycombinator.com/" | head -100

# ✅ 快: 只请求头部
curl -I "https://news.ycombinator.com/"

# ✅ 更快: 使用更轻量的网站
curl -s "https://www.example.com" | head -20
```

### 方案 C: 设置 curl 超时

```bash
# 添加 --max-time 参数
curl -s --max-time 10 "https://news.ycombinator.com/" | head -100
```

## 📝 建议的优先级

### 短期（立即实施）
1. ✅ **增加全局超时** - 从 30 秒改为 60 秒
2. ✅ **改进错误信息** - 明确说明是超时错误
3. ✅ **添加文档说明** - 告知用户网络请求的限制

### 中期（下一版本）
4. ✅ **支持 timeout 参数** - 允许动态配置超时
5. ✅ **创建 Web 工具** - 专用工具处理网络请求
6. ✅ **添加重试机制** - 自动重试失败的请求

### 长期（功能增强）
7. ⏳ **后台任务支持** - 异步执行长时任务
8. ⏳ **进度反馈** - 实时显示命令执行进度
9. ⏳ **智能超时** - 根据命令类型自动调整超时

## 🎯 当前最佳实践

### 对于网络请求
```typescript
// 使用 curl 的内置超时
const command = 'curl -s --max-time 15 --connect-timeout 5 "https://example.com"';
```

### 对于本地命令
```typescript
// 使用默认超时即可
const command = 'ls -la';
```

### 对于复杂命令
```typescript
// 分步执行，避免单个命令过长
// 1. 下载文件
const cmd1 = 'curl -s --max-time 30 "https://example.com/file.txt" -o /tmp/file.txt';
// 2. 处理文件
const cmd2 = 'head -100 /tmp/file.txt';
```

## 📚 相关资源

- **Node.js exec 文档**: https://nodejs.org/api/child_process.html
- **curl 超时选项**: https://curl.se/docs/manpage.html
- **最佳实践**: docs/TOOLS_SYSTEM.md

---

**诊断完成时间**: 2026-02-05 22:15
**诊断结果**: 目标网站响应慢，需要增强超时配置
**建议方案**: 支持动态超时 + 创建专用 Web 工具
