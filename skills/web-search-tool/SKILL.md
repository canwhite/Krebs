---
name: web-search-tool
description: 提供网页搜索功能示例，演示如何使用 curl 进行 HTTP 请求。用于学习如何构建包含 scripts 和 references 的标准 skill 结构。
license: MIT
compatibility: 需要 curl 命令行工具
metadata:
  version: "1.0.0"
  author: "Krebs"
---

# Web Search Tool

这个技能演示了标准的 skill 结构，包含 scripts 和 references 目录。

## Setup

无需安装依赖，确保系统已安装 curl：

```bash
curl --version
```

## Usage

### 基本搜索

```bash
# 使用 curl 搜索
./scripts/search.sh "搜索查询词"
```

### 获取页面内容

```bash
# 获取网页内容
./scripts/fetch-page.sh "https://example.com"
```

## Examples

```bash
# 搜索示例
./scripts/search.sh "TypeScript tutorial"

# 获取页面
./scripts/fetch-page.sh "https://www.example.com"
```

## References

- [API 详细说明](references/api-reference.md)
- [高级用法](references/advanced-usage.md)
