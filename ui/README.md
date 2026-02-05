# Krebs AI Agent - Web UI

基于 Lit Web Components 的现代化 Web 界面，用于与 Krebs AI Agent 交互。

## 功能特性

- 📝 **实时聊天**: 与 AI Agent 进行实时对话
- 🛠️ **工具显示**: 可视化展示工具调用和执行结果
- ⚡ **技能管理**: 查看和管理可用技能
- 🎨 **现代 UI**: 基于 Lit Web Components，支持暗色/亮色主题
- 📱 **响应式设计**: 支持桌面和移动设备

## 技术栈

- **框架**: Lit 3.3.2 (Web Components)
- **构建工具**: Vite 7.3.1
- **样式**: 原生 CSS + CSS Variables
- **Markdown**: marked 17.0.1
- **安全**: DOMPurify 3.3.1

## 快速开始

### 开发模式

```bash
# 安装依赖
cd ui
npm install

# 启动开发服务器（默认端口 5173）
npm run dev

# 在浏览器中打开
open http://localhost:5173
```

### 生产构建

```bash
# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 目录结构

```
ui/
├── src/
│   ├── main.ts              # 入口文件
│   ├── styles.css           # 全局样式
│   └── ui/
│       ├── app.ts                    # 主应用组件
│       ├── chat/
│       │   └── krebs-chat.ts         # 聊天界面组件
│       ├── components/
│       │   ├── krebs-tool-card.ts    # 工具卡片组件
│       │   ├── krebs-tools-list.ts   # 工具列表组件
│       │   └── krebs-skills-list.ts  # 技能列表组件
│       ├── views/                    # 视图组件（待添加）
│       └── controllers/              # 控制器（待添加）
├── index.html               # HTML 入口
├── package.json             # 依赖配置
├── vite.config.ts           # Vite 配置
└── tsconfig.json            # TypeScript 配置
```

## API 集成

UI 通过以下 API 与后端通信：

### HTTP API

- `GET /api/health` - 健康检查
- `POST /api/chat` - 发送聊天消息
- `GET /api/tools` - 获取可用工具列表
- `GET /api/skills` - 获取可用技能列表
- `PATCH /api/skills/:skillId` - 启用/禁用技能

### 请求/响应格式

#### 发送消息

```typescript
// 请求
POST /api/chat
{
  "message": "用户消息",
  "sessionId": "session-id",
  "agentId": "default"
}

// 响应
{
  "content": "AI 回复",
  "toolCalls": [
    {
      "id": "call-123",
      "name": "tool_name",
      "args": { "arg1": "value1" },
      "result": { ... },
      "status": "completed"
    }
  ],
  "usage": {
    "inputTokens": 100,
    "outputTokens": 50
  }
}
```

#### 工具列表

```typescript
GET /api/tools

// 响应
{
  "tools": [
    {
      "name": "tool_name",
      "description": "工具描述",
      "category": "general"
    }
  ]
}
```

#### 技能列表

```typescript
GET /api/skills

// 响应
{
  "skills": [
    {
      "id": "skill-id",
      "name": "技能名称",
      "description": "技能描述",
      "enabled": true,
      "category": "general"
    }
  ]
}
```

## 主题定制

UI 使用 CSS Variables 支持主题定制。可以在 `src/styles.css` 中修改：

```css
:root {
  --color-primary: #0066cc;
  --color-bg: #ffffff;
  --color-surface: #f5f5f5;
  /* ... 更多变量 */
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1a1a1a;
    --color-surface: #262626;
    /* ... 更多变量 */
  }
}
```

## 组件开发

### 创建新组件

```typescript
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('krebs-my-component')
export class KrebsMyComponent extends LitElement {
  static styles = css`
    :host {
      display: block;
    }
  `;

  render() {
    return html`
      <div>My Component</div>
    `;
  }
}
```

### 使用组件

```html
<krebs-my-component></krebs-my-component>
```

## 调试技巧

### 启用详细日志

在浏览器控制台中：

```javascript
// 查看所有 Web Components
customElements.define('krebs-app', KrebsApp);

// 查看组件状态
const app = document.querySelector('krebs-app');
console.log(app.shadowRoot);
```

### Vue DevTools

安装 Lit DevTools 浏览器扩展以调试 Web Components。

## 部署

### 构建生产版本

```bash
npm run build
```

构建输出在 `dist/` 目录，包含：
- `assets/` - JS 和 CSS 文件
- `index.html` - 入口 HTML

### 与后端集成

确保后端 Gateway 配置为服务静态文件：

```typescript
// 在 gateway/server/http-server.ts 中
this.app.use(express.static(path.join(__dirname, "../../../ui/dist")));
```

## 开发计划

- [ ] WebSocket 实时通信
- [ ] 会话历史管理
- [ ] 文件上传支持
- [ ] 代码语法高亮
- [ ] 消息搜索功能
- [ ] 用户偏好设置
- [ ] 多语言支持

## 参考

本项目基于 [openclaw-cn-ds](https://github.com/openclaw-cn-ds) 的 UI 设计。

## 许可证

MIT
