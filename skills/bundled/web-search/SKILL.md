---
name: WebSearch
description: "网络搜索技能。使用各种工具搜索网络、获取网页内容和分析信息。"
metadata: '{"krebs":{"emoji":"🔍","category":"Research","tags":["search","web","research"],"homepage":"https://curl.se/"}}'
---

# Web Search Skill

网络搜索和信息获取技能。

## 获取网页内容

使用 curl 获取网页内容：
```bash
curl -s https://example.com
```

获取网页并格式化输出：
```bash
curl -s https://example.com | prettyping
```

保存网页到文件：
```bash
curl -o page.html https://example.com
```

## API 请求

GET 请求：
```bash
curl -X GET https://api.example.com/data
```

POST 请求（JSON）：
```bash
curl -X POST https://api.example.com/data \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}'
```

带认证头的请求：
```bash
curl -H "Authorization: Bearer TOKEN" \
  https://api.example.com/protected
```

## 搜索技巧

使用 DuckDuckGo 搜索（快速）：
```bash
curl -s "https://duckduckgo.com/html/?q=search+term"
```

获取搜索结果页面（需要进一步解析）。

## 数据提取

使用 grep 从 HTML 中提取链接：
```bash
curl -s https://example.com | grep -o 'href="[^"]*"' | head -20
```

使用 jq 解析 JSON API 响应：
```bash
curl -s https://api.example.com/data | jq '.results[] | .title'
```

## 下载文件

下载单个文件：
```bash
curl -O https://example.com/file.zip
```

下载并指定文件名：
```bash
curl -o custom-name.zip https://example.com/file.zip
```

跟随重定向：
```bash
curl -L https://example.com/redirect
```

## 调试技巧

查看请求头：
```bash
curl -I https://example.com
```

详细输出（调试用）：
```bash
curl -v https://example.com
```

测量响应时间：
```bash
curl -w "@-" -o /dev/null -s https://example.com <<EOF
    time_namelookup:  %{time_namelookup}\n
       time_connect:  %{time_connect}\n
    time_appconnect:  %{time_appconnect}\n
   time_pretransfer:  %{time_pretransfer}\n
      time_redirect:  %{time_redirect}\n
 time_starttransfer:  %{time_starttransfer}\n
                    ----------\n
         time_total:  %{time_total}\n
EOF
```
