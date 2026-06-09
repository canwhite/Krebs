# 安全评估与改进建议

## 当前安全状况

### ✅ 已有的安全措施

1. **HTTP API 认证**
   - 支持 Cookie 和 Authorization Header 两种方式
   - 外部调用需要提供 token

2. **WebSocket 认证**
   - 连接后需要发送 `auth` 消息验证
   - 未认证客户端无法发送其他消息

3. **Token 格式**
   - UUID 格式，128 位随机数
   - 存储在 `.env` 文件中

### ⚠️ 存在的安全问题

1. **Token 永不过期**
   - 一旦生成，永久有效
   - 如果泄露，攻击者可以无限期访问

2. **没有速率限制**
   - `/api/auth` 接口可以被无限尝试
   - 暴力破解 token 理论上可行（虽然 UUID 空间很大）

3. **Token 暴露在响应中**
   - `/api/auth/internal` 返回 `{ token: "xxx" }`
   - 虽然是内部接口，但响应可以被浏览器开发者工具查看

4. **没有会话管理**
   - 无法查看当前活跃连接
   - 无法主动撤销特定连接

5. **没有审计日志**
   - 无法追踪谁在什么时候调用了 API
   - 无法检测异常行为

6. **Token 在前端明文存储**
   - `apiToken` 状态变量中存储明文 token
   - 可以被浏览器插件或 XSS 攻击窃取

## 安全改进方案（按优先级）

### 优先级 1：立即修复

**1. 移除前端明文存储 token**
```typescript
// 前端不要存储 token，而是临时使用
const data = await res.json();
if (data.success && data.token) {
  connect(data.token); // 直接使用，不存储到状态
}
```

**2. 移除 `/api/auth/internal` 中的 token 返回**
```typescript
// 只返回 success，不返回 token
Response.json({ success: true }, { headers: createAuthCookieHeaders() })
```

### 优先级 2：重要改进

**1. 添加 Token 过期机制**
- Token 有效期 24 小时
- 自动轮换 token
- `/api/auth/internal` 验证 Cookie 有效性

**2. 添加速率限制**
- 每分钟最多 5 次认证尝试
- 失败后增加延迟

**3. 添加审计日志**
- 记录所有认证尝试
- 记录 API 调用（时间、IP、操作）

### 优先级 3：长期改进

**1. 添加 IP 白名单**
- 只允许特定 IP 访问

**2. 添加会话管理**
- 查看活跃连接
- 主动撤销连接

**3. 使用更安全的 Token**
- JWT with expiration
- 短期 token + refresh token

**4. 添加 HTTPS**
- 生产环境强制使用 HTTPS

## 当前架构的安全性评估

**对于内网/开发环境**：✅ 基本够用
- Token 验证存在
- WebSocket 有认证
- 外部调用需要认证

**对于公网/生产环境**：⚠️ 需要加强
- 缺少过期机制
- 缺少速率限制
- 缺少审计日志
- Token 可能被窃取

## 建议

1. **如果只是个人使用/内网**：当前安全水平可以接受
2. **如果要公网部署**：至少实现优先级 1 和 2 的改进
