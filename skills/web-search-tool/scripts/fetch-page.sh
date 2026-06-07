#!/bin/bash
# 使用 curl 获取网页内容

if [ -z "$1" ]; then
  echo "用法: $0 <URL>"
  exit 1
fi

URL="$1"

echo "📄 获取页面: $URL"
echo "================================"

# 获取页面并提取标题和正文（简单示例）
curl -s -L "$URL" | \
  grep -o '<title>[^<]*</title>' | \
  sed 's/<title>//g' | sed 's/<\/title>//g'

echo ""
echo "================================"
echo "💡 提示: 可以使用 'curl -s \"$URL\" | head -50' 查看更多内容"
