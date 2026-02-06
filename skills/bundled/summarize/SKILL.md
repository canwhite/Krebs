---
name: Summarize
description: "从 URL、播客和本地文件中总结或提取文本/转录内容。支持文章、PDF、YouTube 视频等。"
metadata: '{"krebs":{"emoji":"🧾","category":"Productivity","tags":["summary","content","youtube","pdf"],"homepage":"https://summarize.sh"}}'
install:
  - kind: "brew"
    formula: "steipete/tap/summarize"
    bins: ["summarize"]
---

# Summarize Skill

强大的内容摘要工具，可以从 URL、本地文件和 YouTube 链接中快速总结或提取内容。

## 快速开始

```bash
# 总结网页
summarize "https://example.com/article" --model google/gemini-2.0-flash-exp

# 总结 PDF 文件
summarize "/path/to/document.pdf" --model google/gemini-2.0-flash-exp

# 总结 YouTube 视频（最佳尝试转录）
summarize "https://youtu.be/dQw4w9WgXcQ" --youtube auto
```

## 主要功能

### 1. 网页摘要
自动提取并总结网页内容，支持处理各种格式的文章和页面。

```bash
summarize "https://example.com" --length medium
```

### 2. YouTube 总结与转录
无需 `yt-dlp`，最佳尝试提取 YouTube 视频的转录内容或总结。

```bash
# 总结视频
summarize "https://youtu.be/dQw4w9WgXcQ" --youtube auto

# 仅提取转录（不总结）
summarize "https://youtu.be/dQw4w9WgXcQ" --youtube auto --extract-only
```

**注意**：如果转录内容太大，先返回简洁摘要，然后询问用户要扩展哪个部分或时间段。

### 3. 本地文件处理
支持 PDF、文本文件等多种格式。

```bash
summarize "/path/to/file.pdf" --max-output-tokens 1000
```

## API 密钥配置

使用前需要设置相应的 API 密钥：

```bash
# OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google Gemini (推荐)
export GEMINI_API_KEY="..."

# xAI
export XAI_API_KEY="..."
```

**默认模型**：如果未设置，使用 `google/gemini-2.0-flash-exp`

## 常用参数

- `--length short|medium|long|xl|xxl|<chars>` - 控制摘要长度
- `--max-output-tokens <count>` - 最大输出 token 数
- `--extract-only` - 仅提取内容，不总结（仅限 URL）
- `--model <model>` - 指定模型
- `--firecrawl auto|off|always` - Firecrawl 提取回退（用于被屏蔽的网站）
- `--youtube auto` - YouTube 回退（需要 `APIFY_API_TOKEN`）

## 配置文件

可选配置文件：`~/.summarize/config.json`

```json
{
  "model": "openai/gpt-4o",
  "length": "medium"
}
```

## 可选服务

- `FIRECRAWL_API_KEY` - 用于被屏蔽网站的提取
- `APIFY_API_TOKEN` - 用于 YouTube 的回退提取

## 使用场景

- 快速了解文章或网页的主要内容
- 提取 YouTube 视频的要点或转录
- 总结 PDF 文档的内容
- 批量处理多个链接
