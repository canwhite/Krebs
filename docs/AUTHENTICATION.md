# API 认证机制文档

## 概述

Krebs 网关实现了 API Token 认证机制，用于保护外部访问。本地前端自动认证，外部调用需要提供有效 Token。

## Token 管理

### Token 生成

Token 在服务器启动时自动生成并存储在 `.env` 文件中：

```env
TOKEN=your-generated-uuid-token-here
```

- **格式**：UUID（128位随机字符串）
- **存储位置**：`.env` 文件
- **复用策略**：服务器重启时优先使用已有 Token，仅在无效或不存在时生成新的

### 获取 Token

```bash
# 查看 .env 文件中的 TOKEN
grep TOKEN .env
```

## 认证方式

### 1. 本地前端（自动认证）

访问 `http://localhost:3000/` 时：

1. 前端自动调用 `POST /api/auth/internal`
2. 服务器设置 HttpOnly Cookie
3. WebSocket 连接建立后自动认证
4. 无需手动输入 Token

### 2. 外部 HTTP API 调用

#### 方式 A：Authorization Header（推荐）

```bash
curl http://localhost:3000/api/sessions/list \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

#### 方式 B：Cookie

```bash
# 步骤 1：认证获取 Cookie
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"token": "YOUR_TOKEN_HERE"}' \
  -c cookies.txt

# 步骤 2：使用 Cookie 调用 API
curl http://localhost:3000/api/sessions/list -b cookies.txt
```

### 3. WebSocket 连接

#### 本地前端（自动）

WebSocket 连接在本地前端中自动处理，无需额外配置。

#### 外部 WebSocket 连接

WebSocket 连接建立后需要发送认证消息：

```javascript
const ws = new WebSocket("ws://localhost:3000/ws");

ws.onopen = () => {
  // 发送认证消息
  ws.send(JSON.stringify({ type: "auth" }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "auth_success") {
    // 认证成功，可以发送其他消息
  }
};
```

## API 端点

### 认证接口

#### POST /api/auth

**用途**：外部认证，获取访问权限

**请求体**：

```json
{
  "token": "your-api-token-here"
}
```

**响应**：

```json
{
  "success": true,
  "message": "认证成功"
}
```

**错误响应**：

```json
{
  "success": false,
  "message": "Token 无效"
}
```

#### GET /api/auth/internal

**用途**：本地前端自动认证（无需 Token）

**响应**：

```json
{
  "success": true,
  "message": "自动认证成功"
}
```

**注意**：此接口仅供本地前端使用，会自动设置 HttpOnly Cookie。

### 需要 Token 的 API

所有 `/api/*` 接口都需要认证，除了 `/api/auth/*` 系列。

#### 示例接口

| 端点                 | 方法   | 说明             |
| -------------------- | ------ | ---------------- |
| `/api/sessions/list` | GET    | 获取所有会话列表 |
| `/api/sessions/:id`  | GET    | 获取特定会话消息 |
| `/api/sessions`      | POST   | 创建新会话       |
| `/api/sessions/:id`  | DELETE | 删除会话         |

## 错误处理

### 401 Unauthorized

**原因**：

- 未提供 Token 或 Token 无效
- Cookie 过期或缺失

**响应**：

```json
{
  "error": "未授权，请先认证",
  "hint": "使用 POST /api/auth 并提供 token，或使用 Authorization: Bearer <token> header"
}
```

### 403 Forbidden

**原因**：

- 认证失败次数过多
- IP 被封禁（如果启用）

## 安全特性

### Cookie 设置

```
Set-Cookie: api_token=<token>; HttpOnly; Path=/; SameSite=Lax
```

- **HttpOnly**：防止 JavaScript 窃取 Cookie（XSS 防护）
- **SameSite=Lax**：防止 CSRF 攻击
- **Path=/**：全站有效

### Token 验证

- 所有 API 请求验证 Token（除认证接口）
- WebSocket 连接后验证
- 支持 Cookie 和 Authorization Header 两种方式

## 安全建议

### 生产环境部署

1. **使用 HTTPS**
   - 将 `NODE_ENV=production` 添加到环境变量
   - Cookie 将自动添加 `Secure` 标志

2. **Token 轮换**
   - 定期更换 Token
   - 修改 `.env` 文件中的 `TOKEN` 值
   - 重启服务器

3. **防火墙配置**
   - 限制 API 访问来源 IP
   - 只允许受信任的网络访问

### 当前限制

- Token 永不过期
- 没有速率限制
- 没有会话管理
- 没有审计日志

这些功能将在后续版本中添加。

## 故障排除

### 问题：连接失败

**检查清单**：

1. Token 是否正确（查看 `.env` 文件）
2. 是否使用了正确的认证方式
3. 浏览器控制台是否有错误信息

### 问题：Cookie 无效

**检查清单**：

1. 清除浏览器 Cookie 后重新访问
2. 检查服务器是否正在运行
3. 确认 Token 没有过期（如果启用了过期机制）

## 示例代码

### Python 示例

```python
import requests

TOKEN = "YOUR_TOKEN_HERE"
BASE_URL = "http://localhost:3000"

# 使用 Authorization Header
headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# 获取会话列表
response = requests.get(f"{BASE_URL}/api/sessions/list", headers=headers)
print(response.json())

# 发送消息
response = requests.post(
    f"{BASE_URL}/api/messages",
    headers=headers,
    json={"message": "你好"}
)
print(response.json())
```

### JavaScript/Node.js 示例

```javascript
const TOKEN = "YOUR_TOKEN_HERE";
const BASE_URL = "http://localhost:3000";

// 使用 Authorization Header
fetch(`${BASE_URL}/api/sessions/list`, {
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
})
  .then((res) => res.json())
  .then((data) => console.log(data));
```

### WebSocket 示例

```javascript
const TOKEN = "YOUR_TOKEN_HERE";

const ws = new WebSocket("ws://localhost:3000/ws");

ws.onopen = () => {
  // 发送认证消息
  ws.send(
    JSON.stringify({
      type: "auth",
      token: TOKEN, // 可选：本地前端不需要
    }),
  );
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "auth_success") {
    console.log("认证成功");
    // 现在可以发送其他消息
    ws.send(
      JSON.stringify({
        type: "prompt",
        message: "你好",
      }),
    );
  }
};
```

## 更新日志

- **2026-03-24**：初始版本，支持 UUID Token 认证
- 支持 Cookie 和 Authorization Header
- 本地前端自动认证
- WebSocket 连接后认证
