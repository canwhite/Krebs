Skills：

- ✅ Prompt Injection - 通过 System Prompt 注入文档
- ✅ LLM 理解 - 阅读后自主决策
- ✅ 文本回复 - LLM 直接返回文本（理解后自己执行）
- ✅ 适合复杂任务 - 多步骤、需要推理的场景

Tools：

- ✅ Tool Calling API - 通过标准 API 传递工具定义
- ✅ 结构化参数 - 使用 JSON Schema 定义
- ✅ Tool Calls - LLM 返回 tool_calls 结构
- ✅ 程序化执行 - Agent 执行器调用工具
- ✅ 适合明确操作 - 读取文件、搜索、API 调用

Session：

```
用户界面
   │
   ▼ 点击"+"按钮
前端组件
   │
   ▼ POST /api/session/create
后端API
   │
   ▼ 生成 sessionId + 创建空会话
Session存储
   │      (Markdown文件)
   ▼      user_1739421234567_abc123def.md
返回新会话ID
   │
   ▼ 更新 currentSessionId
前端状态
   │
   ▼ 用户发送消息
POST /api/chat
   │
   ▼ 使用新 sessionId
保存消息到对应会话文件
```
