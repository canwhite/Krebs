# API Reference

## DuckDuckGo Instant Answer API

DuckDuckGo 提供免费的即时答案 API，无需注册。

### 端点

```
GET https://api.duckduckgo.com/
```

### 参数

| 参数 | 类型 | 描述 |
|------|------|------|
| q | string | 搜索查询词 |
| format | string | 返回格式：json, xml |

### 示例

```bash
curl "https://api.duckduckgo.com/?q=typescript&format=json"
```

### 响应字段

- `AbstractText`: 即时答案摘要
- `AbstractURL`: 摘要来源 URL
- `AbstractSource`: 摘要来源
