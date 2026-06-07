# Advanced Usage

## 组合命令

### 搜索并格式化输出

```bash
./scripts/search.sh "your query" | grep -A 5 "结果"
```

### 批量搜索

```bash
for term in "term1" "term2" "term3"; do
  ./scripts/search.sh "$term"
done
```

## 扩展脚本

你可以修改 `scripts/search.sh` 来支持更多功能：

- 添加结果缓存
- 支持多个搜索引擎
- 格式化 JSON 输出
- 添加历史记录

## 集成到 Agent

在 index.ts 中，Agent 可以这样调用：

```typescript
const bashResult = await executeCommand(
  "bash",
  ["./skills/web-search-tool/scripts/search.sh", query]
);
```
