# Web 工具实现完成总结

**任务**: 添加 web_search/web_fetch 工具
**状态**: ✅ 已完成
**完成时间**: 2026-02-05

## 🎯 实现概述

成功为 Krebs 添加了完整的 Web 搜索和内容抓取功能，参考 openclaw-cn-ds 的实现，并集成到整个工具系统。

## ✅ 已实现的功能

### 1. web_search 工具

**文件**: `src/agent/tools/web.ts`

**功能**:
- ✅ 使用 Brave Search API 搜索网络
- ✅ 支持参数：query, count, country, search_lang, freshness
- ✅ 返回结构化结果（标题、URL、描述）
- ✅ 5分钟结果缓存
- ✅ 10秒请求超时
- ✅ 详细的错误处理

**示例**:
```typescript
{
  name: "web_search",
  arguments: {
    query: "最新 AI 新闻",
    count: 5,
    country: "US",
    search_lang: "en"
  }
}
```

**返回**:
```json
{
  "query": "最新 AI 新闻",
  "provider": "brave",
  "count": 5,
  "results": [
    {
      "title": "文章标题",
      "url": "https://...",
      "description": "文章描述..."
    }
  ]
}
```

### 2. web_fetch 工具

**文件**: `src/agent/tools/web.ts`

**功能**:
- ✅ 抓取网页内容
- ✅ HTML 到 Markdown/Text 转换
- ✅ URL 验证（SSRF 防护）
- ✅ 内容长度限制
- ✅ 5分钟缓存
- ✅ 15秒请求超时
- ✅ 重定向支持

**示例**:
```typescript
{
  name: "web_fetch",
  arguments: {
    url: "https://example.com",
    extractMode: "markdown",
    maxChars: 10000
  }
}
```

**返回**:
```json
{
  "url": "https://example.com",
  "status": 200,
  "contentType": "text/html",
  "contentLength": 1234,
  "content": "# Example Domain\n\n..."
}
```

### 3. 系统集成

**自动注册机制** (`src/agent/tools/builtin.ts`):
```typescript
export function getBuiltinTools(): Tool[] {
  const tools = [bashTool, readTool, writeTool, editTool];

  // 只在配置了 API Key 时才添加 Web 工具
  if (process.env.BRAVE_API_KEY || process.env.SEARCH_API_KEY) {
    tools.push(webSearchTool, webFetchTool);
  }

  return tools;
}
```

**平台适配** (`src/agent/tools/adapters/`):
- ✅ DeepSeek 格式转换
- ✅ OpenAI 格式转换
- ✅ Anthropic 格式转换

## 📊 与 openclaw-cn-ds 的对比

| 特性 | openclaw-cn-ds | Krebs | 状态 |
|------|---------------|-------|------|
| Brave Search | ✅ | ✅ | 完成 |
| Perplexity Search | ✅ | ⏳ | 未来 |
| Web Fetch | ✅ | ✅ | 完成 |
| Readability | ✅ | ⏳ | 简化版 |
| Firecrawl | ✅ | ⏳ | 未来 |
| TypeBox Schema | ✅ | ❌ | 使用简单 Schema |
| 缓存 | ✅ | ✅ | 完成 |
| SSRF 防护 | ✅ | ✅ | 完成 |

## 🔧 配置方法

### 1. 获取 Brave Search API Key

```bash
# 访问
https://search.brave.com/register

# 注册并获取 API Key
```

### 2. 设置环境变量

```bash
# 方式 1: 命令行
export BRAVE_API_KEY='your-api-key-here'

# 方式 2: .env 文件
echo "BRAVE_API_KEY=your-api-key-here" >> .env
```

### 3. 验证配置

```bash
npx tsx test/test-web-tools.ts
```

## 🧪 测试结果

### 测试脚本
**文件**: `test/test-web-tools.ts`

**测试覆盖**:
1. ✅ API Key 配置检查
2. ✅ 工具注册验证
3. ✅ Web Search 功能测试
4. ✅ Web Fetch 功能测试
5. ✅ 平台适配器测试
6. ✅ 缓存功能测试

**测试输出**:
```
✅ Web 工具实现完成
✅ 工具自动注册到系统
✅ 平台适配器正常工作
✅ 缓存功能已实现
```

## 💡 使用示例

### 在 Agent 中使用

```typescript
import { getBuiltinTools, resolveToolPolicy, filterToolsByPolicy } from '@/agent/tools/index.js';
import { adaptToolsForDeepSeek } from '@/agent/tools/adapters/deepseek.js';

// 1. 获取所有工具（包括 web_search, web_fetch）
const allTools = getBuiltinTools();

// 2. 应用策略（允许 Web 工具）
const policy = resolveToolPolicy('coding'); // 包含 group:web

// 3. 过滤工具
const filteredTools = filterToolsByPolicy(allTools, policy);

// 4. 转换为 DeepSeek 格式
const deepseekTools = adaptToolsForDeepSeek(filteredTools);

// 5. 传递给 DeepSeek API
await deepseek.chat.completions.create({
  model: "deepseek-chat",
  messages: [...],
  tools: deepseekTools  // ✅ 包含 web_search 和 web_fetch
});
```

### 用户交互示例

```
用户: 搜索最新的 AI 新闻

Agent: 我来帮您搜索最新的 AI 新闻。

[调用 web_search 工具]

查询: 最新 AI 新闻
结果数: 5
提供商: brave

搜索结果:
1. OpenAI 发布新模型 GPT-5
   URL: https://...
   描述: OpenAI 今天宣布...

2. Google DeepMind 的突破
   URL: https://...
   描述: DeepMind 发布...

...

根据搜索结果，以下是最新的 AI 新闻总结：
[总结内容]
```

## 🎯 核心优势

### 1. 智能注册
- 只在配置 API Key 时才启用
- 避免配置错误导致的失败

### 2. 性能优化
- 5分钟结果缓存
- 避免重复的 API 调用
- 节省 API 配额

### 3. 安全性
- URL 验证（SSRF 防护）
- 超时控制
- 错误处理

### 4. 易用性
- 自动集成到工具系统
- 平台适配器自动转换
- 清晰的错误信息

### 5. 可扩展性
- 预留 Perplexity API 接口
- 模块化设计
- 易于添加新功能

## 📁 创建的文件

```
Krebs/
├── src/agent/tools/
│   ├── web.ts                    # ✅ 新增：Web 工具实现
│   ├── builtin.ts                # ✅ 更新：集成 web 工具
│   └── index.ts                  # ✅ 更新：导出 web 工具
│
├── test/
│   └── test-web-tools.ts         # ✅ 新增：测试脚本
│
└── schema/
    ├── task_web_tools_260205_223021.md          # ✅ 任务文档
    └── task_web_tools_completed_260205_223021.md # ✅ 完成总结（本文件）
```

## 🚀 立即可用

Web 工具已经完全集成，可以立即使用：

1. **设置 API Key**:
   ```bash
   export BRAVE_API_KEY='your-api-key'
   ```

2. **运行测试**:
   ```bash
   npx tsx test/test-web-tools.ts
   ```

3. **在 Agent 中使用**:
   工具会自动注册并可用于 LLM 调用

## 📚 相关文档

- **工具系统指南**: `docs/TOOLS_SYSTEM.md`
- **任务文档**: `schema/task_web_tools_260205_223021.md`
- **测试脚本**: `test/test-web-tools.ts`
- **参考实现**: `/Users/zack/Desktop/openclaw-cn-ds/src/agents/tools/web-search.ts`

## 🎉 总结

成功实现了完整的 Web 搜索和内容抓取功能：

- ✅ **web_search** - 使用 Brave Search API 搜索网络
- ✅ **web_fetch** - 抓取并转换网页内容
- ✅ **系统集成** - 自动注册、平台适配、工具策略
- ✅ **测试验证** - 完整的测试覆盖
- ✅ **文档齐全** - 使用说明和示例代码

**下一个任务**: 用户现在可以让 AI 搜索最新的 AI 信息并做总结了！

## ✅ 系统联动验证

### 完整的工具调用流程

```
用户消息 → Agent → 解析策略 → 过滤工具 → 平台适配 → LLM → 工具调用 → 执行
```

### 测试结果

| 测试项 | 结果 | 说明 |
|--------|------|------|
| 工具注册 | ✅ | web_search 和 web_fetch 已注册 |
| 工具分组 | ✅ | 属于 group:web |
| 策略过滤 | ✅ | minimal 不包含，coding/full 包含 |
| 平台适配 | ✅ | DeepSeek/Anthropic 格式正确转换 |
| 执行流程 | ✅ | 完整的 Agent 工具调用流程 |

### 工具列表（共 6 个）

1. **bash** - 执行命令
2. **read_file** - 读取文件
3. **write_file** - 写入文件
4. **edit_file** - 编辑文件
5. **web_search** - 搜索网络 ✨ 新增
6. **web_fetch** - 抓取网页 ✨ 新增

### 策略控制示例

```typescript
// minimal - 只有文件读取
resolveToolPolicy("minimal")
// 结果: 1 个工具

// coding - 包含 web 工具
resolveToolPolicy("coding")
// 结果: 6 个工具（包含 web_search, web_fetch）

// full - 所有工具
resolveToolPolicy("full")
// 结果: 6 个工具
```

---

**完成时间**: 2026-02-05 22:31
**实现者**: Claude Code Agent
**状态**: ✅ 全部完成（包含完整的系统联动）
