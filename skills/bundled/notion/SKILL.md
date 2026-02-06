---
name: Notion
description: "通过 Notion API 创建和管理页面、数据库和区块。支持搜索、读取、创建和更新内容。"
metadata: '{"krebs":{"emoji":"📝","category":"Productivity","tags":["notion","database","notes","api"],"homepage":"https://developers.notion.com"}}'
---

# Notion Skill

使用 Notion API 创建、读取、更新页面和数据库（在 API 中称为数据源）。

## 设置

### 1. 创建集成

1. 访问 https://notion.so/my-integrations
2. 创建新集成
3. 复制 API 密钥（以 `ntn_` 或 `secret_` 开头）

### 2. 存储密钥

```bash
# 创建配置目录
mkdir -p ~/.config/notion

# 保存密钥
echo "ntn_your_key_here" > ~/.config/notion/api_key

# 设置环境变量（可选）
export NOTION_API_KEY=$(cat ~/.config/notion/api_key)
```

### 3. 共享页面/数据库

- 打开要访问的页面或数据库
- 点击 `...` → `Connect` → 选择你的集成

## API 基础

所有请求都需要以下头信息：

```bash
NOTION_KEY=$(cat ~/.config/notion/api_key)

curl -X GET "https://api.notion.com/v1/..." \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json"
```

**注意**：`Notion-Version` 头是必需的。本技能使用 `2022-06-28` 版本。

## 常见操作

### 搜索页面和数据库

```bash
curl -X POST "https://api.notion.com/v1/search" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "搜索关键词"
  }'
```

### 获取页面

```bash
PAGE_ID="32位页面ID"

curl "https://api.notion.com/v1/pages/$PAGE_ID" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28"
```

### 获取页面内容（包含子块）

```bash
curl "https://api.notion.com/v1/blocks/$PAGE_ID/children" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28"
```

### 创建页面

```bash
PARENT_ID="父页面ID或数据库ID"

curl -X POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d "{
    \"parent\": {
      \"type\": \"page_id\",
      \"page_id\": \"$PARENT_ID\"
    },
    \"properties\": {
      \"title\": {
        \"title\": [
          {
            \"text\": {
              \"content\": \"新页面标题\"
            }
          }
        ]
      }
    }
  }"
```

### 更新页面

```bash
PAGE_ID="页面ID"

curl -X PATCH "https://api.notion.com/v1/pages/$PAGE_ID" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d "{
    \"properties\": {
      \"title\": {
        \"title\": [
          {
            \"text\": {
              \"content\": \"更新后的标题\"
            }
          }
        ]
      }
    }
  }"
```

### 追加块内容

```bash
BLOCK_ID="父块ID"

curl -X PATCH "https://api.notion.com/v1/blocks/$BLOCK_ID/children" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d "{
    \"children\": [
      {
        \"object\": \"block\",
        \"type\": \"heading_1\",
        \"heading_1\": {
          \"rich_text\": [{
            \"type\": \"text\",
            \"text\": { \"content\": \"标题 1\" }
          }]
        }
      },
      {
        \"object\": \"block\",
        \"type\": \"paragraph\",
        \"paragraph\": {
          \"rich_text\": [{
            \"type\": \"text\",
            \"text\": { \"content\": \"段落内容\" }
          }]
        }
      }
    ]
  }"
```

## 数据库操作

### 查询数据库

```bash
DATABASE_ID="数据库ID"

curl -X POST "https://api.notion.com/v1/databases/$DATABASE_ID/query" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d "{}"
```

### 创建数据库条目

```bash
DATABASE_ID="数据库ID"

curl -X POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d "{
    \"parent\": {
      \"database_id\": \"$DATABASE_ID\"
    },
    \"properties\": {
      \"Name\": {
        \"title\": [
          {
            \"text\": {
              \"content\": \"条目标题\"
            }
          }
        ]
      }
    }
  }"
```

## 常用块类型

### 段落
```json
{
  "type": "paragraph",
  "paragraph": {
    "rich_text": [{
      "type": "text",
      "text": { "content": "段落内容" }
    }]
  }
}
```

### 标题
```json
// H1-H3
{
  "type": "heading_1",
  "heading_1": {
    "rich_text": [{
      "type": "text",
      "text": { "content": "标题" }
    }]
  }
}
```

### 列表
```json
{
  "type": "bulleted_list_item",
  "bulleted_list_item": {
    "rich_text": [{
      "type": "text",
      "text": { "content": "列表项" }
    }]
  }
}
```

### 代码块
```json
{
  "type": "code",
  "code": {
    "rich_text": [{
      "type": "text",
      "text": { "content": "console.log('Hello')" }
    }],
    "language": "javascript"
  }
}
```

### 待办事项
```json
{
  "type": "to_do",
  "to_do": {
    "rich_text": [{
      "type": "text",
      "text": { "content": "任务内容" }
    }],
    "checked": false
  }
}
```

## 使用场景

- 快速创建笔记页面
- 搜索现有内容
- 追加内容到已有页面
- 管理数据库条目
- 批量创建任务

## 注意事项

1. **权限**：确保已将页面或数据库共享给你的集成
2. **速率限制**：Notion API 有速率限制，避免频繁请求
3. **版本**：使用指定的 API 版本（`2022-06-28`）
4. **ID 格式**：所有 ID 都是 32 字符字符串，不含连字符

## 参考资源

- [Notion API 文档](https://developers.notion.com/)
- [API 版本历史](https://developers.notion.com/reference/changelog)
- [块类型参考](https://developers.notion.com/reference/block-type)
