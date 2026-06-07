# JSON 响应模式参考

本文档列出常见的 JSON 响应结构模式。

## 1. 列表/数组响应

```json
[
  { "id": 1, "name": "项目A" },
  { "id": 2, "name": "项目B" }
]
```

## 2. 分页响应

```json
{
  "data": [...],
  "page": 1,
  "pageSize": 10,
  "total": 100,
  "hasMore": true
}
```

## 3. 详情响应

```json
{
  "id": 1,
  "name": "项目名称",
  "description": "项目描述",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

## 4. 操作结果

```json
{
  "success": true,
  "message": "操作成功",
  "data": { ... }
}
```

或

```json
{
  "code": 200,
  "msg": "success",
  "result": { ... }
}
```

## 5. 错误响应

```json
{
  "error": {
    "code": 400,
    "message": "参数错误"
  }
}
```

## 6. 键值对响应

```json
{
  "key1": "value1",
  "key2": "value2"
}
```

## 7. 树形结构

```json
{
  "id": 1,
  "name": "根节点",
  "children": [
    {
      "id": 2,
      "name": "子节点",
      "children": []
    }
  ]
}
```

## 注意事项

1. **键名统一**：同一接口的键名保持一致
2. **类型一致**：相同键名的值类型应一致
3. **避免null**：尽量使用有意义的默认值而非 null
4. **时间格式**：推荐使用 ISO 8601 格式
5. **UTF-8编码**：确保输出为 UTF-8 编码

## 反面模式

❌ 混用引号
```json
{
  'name': 'value'
}
```

❌ 尾部逗号
```json
{
  "a": 1,
  "b": 2,
}
```

❌ 注释
```json
{
  "a": 1 // 这是注释
}
```

❌ 多余空格/控制字符
```json
{  "a":  1}
```
