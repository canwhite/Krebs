#!/bin/bash
# 简单的 curl 搜索示例
# 使用 DuckDuckGo 的即时答案 API（无需 API Key）

if [ -z "$1" ]; then
  echo "用法: $0 <搜索查询词>"
  exit 1
fi

QUERY="$1"
ENCODED_QUERY=$(echo "$QUERY" | sed 's/ /%20/g')

echo "🔍 搜索: $QUERY"
echo "================================"

curl -s "https://api.duckduckgo.com/?q=${ENCODED_QUERY}&format=json" | \
  grep -o '"AbstractText":"[^"]*"' | \
  sed 's/"AbstractText":"//g' | sed 's/"$//g' | \
  sed 's/\\u0026/\&/g' | sed 's/\\n/\n/g'

echo ""
echo "================================"
