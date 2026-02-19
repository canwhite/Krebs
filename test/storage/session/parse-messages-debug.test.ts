/**
 * 调试 parseMessages 问题
 */

import { describe, it, expect } from "vitest";

// 复制 SessionStore 的 parseMessages 逻辑
function parseMessages(content: string): any[] {
  const messages: any[] = [];
  // 修复正则：支持 ## role\n内容 和 ## role\n\n内容 两种格式
  const messageRegex = /## (\w+)\n(\n?)([\s\S]*?)(?=\n## |\n*$)/g;
  let match;

  while ((match = messageRegex.exec(content)) !== null) {
    const role = match[1] as "user" | "assistant" | "system";

    // 只添加有效的 role
    if (role !== "user" && role !== "assistant" && role !== "system") {
      continue;
    }

    const messageContent = match[3]; // 第3个捕获组是内容

    // 检查是否包含 tool_calls
    const toolCallsMatch = messageContent.match(/### tool_calls\n\n([\s\S]*?)\n\n/);

    let toolCalls: any[] | undefined;
    if (toolCallsMatch) {
      try {
        toolCalls = JSON.parse(toolCallsMatch[1].trim());
      } catch (error) {
        console.warn('[SessionStore] Failed to parse tool_calls:', error);
      }
    }

    // 提取实际内容（排除 tool_calls 部分）
    let actualContent = messageContent;
    if (toolCallsMatch) {
      // 移除 tool_calls 部分
      actualContent = messageContent.replace(/### tool_calls\n\n[\s\S]*?\n\n/, "").trim();
    } else {
      actualContent = messageContent.trim();
    }

    messages.push({
      role,
      content: actualContent,
      ...(toolCalls ? { toolCalls } : {}),
      timestamp: Date.now(),
    });
  }

  return messages;
}

describe("parseMessages Debug Tests", () => {
  it("应该正确解析最后一条消息", () => {
    const content = `## user
你好

## assistant
你好！我是一个AI助手，可以帮助你解答问题、完成任务。我可以访问完整的对话历史，所以如果你之前问过什么问题，我可以基于上下文来理解你的意图。

## user
你能看到我之前说了什么吗，告诉我之前做了什么事儿？

## assistant
是的，我可以看到我们完整的对话历史。根据对话记录，你之前做了以下几件事：
`;

    const messages = parseMessages(content);
    console.log("Parsed messages:", messages.length);
    messages.forEach((msg, i) => {
      console.log(`[${i}] role=${msg.role}, content="${msg.content.substring(0, 50)}..."`);
    });

    // 应该有 4 条消息
    expect(messages.length).toBe(4);
  });

  it("应该解析以结尾的文件", () => {
    const content = `## user
你好

## assistant
你好！我是一个AI助手，可以帮助你解答问题、完成任务。我可以访问完整的对话历史，所以如果你之前问过什么问题，我可以基于上下文来理解你的意图。

## user
你能看到我之前说了什么吗，告诉我之前做了什么事儿？

## assistant
是的，我可以看到我们完整的对话历史。`;

    const messages = parseMessages(content);
    console.log("Parsed messages (no trailing newline):", messages.length);
    messages.forEach((msg, i) => {
      console.log(`[${i}] role=${msg.role}, content="${msg.content.substring(0, 50)}..."`);
    });

    // 应该有 4 条消息
    expect(messages.length).toBe(4);
  });

  it("应该正确解析实际 Session 文件内容", () => {
    const content = `---
sessionId: 54ab82b5-0a8b-4261-9a08-3e1dc798200a
createdAt: 1771519445699
updatedAt: 1771519513036
---
## user
你好

## assistant
你好！我是一个AI助手，可以帮助你解答问题、完成任务。我可以访问完整的对话历史，所以如果你之前问过什么问题，我可以基于上下文来理解你的意图。

我可以使用各种工具来帮助你，比如：
- 执行bash命令
- 读写文件
- 搜索网络
- 获取网页内容
- 创建子代理并行处理任务

有什么我可以帮助你的吗？

## user
你能看到我之前说了什么吗，告诉我之前做了什么事儿？

## assistant
是的，我可以看到我们完整的对话历史。根据对话记录，你之前做了以下几件事：

1. **询问了关于"AI 助手"的问题**：你问"AI 助手是什么？"，我解释了AI助手是人工智能程序，能够理解自然语言、执行任务、回答问题等。

2. **询问了关于"Tooling"的问题**：你问"Tooling 是什么？"，我解释了Tooling是指AI助手可以使用的工具和技能，比如文件操作、网络搜索、代码执行等。

3. **询问了关于"Skills"的问题**：你问"Skills 是什么？"，我解释了Skills是AI助手具备的特定专业技能，比如文件系统操作、GitHub交互、Notion管理、网络搜索等。

4. **询问了关于"Tool Calling Guidelines"的问题**：你问"Tool Calling Guidelines 是什么？"，我解释了这是使用工具时的指导原则，包括选择合适的工具、提供准确参数、处理错误等。

5. **询问了关于"Runtime"的问题**：你问"Runtime 是什么？"，我解释了Runtime是指当前运行环境，现在是开发环境（env=development）。

这是到目前为止我们对话的主要内容。有什么其他问题我可以帮你解答吗？

## user
我刚才应该是说了你好吧

## assistant
是的，我看到我们之前的对话历史。你刚才确实说了"你好"，然后我回复了"你好！我是你的AI助手。有什么我可以帮助你的吗？"

现在你提到"我刚才应该是说了你好吧"，这表明你可能是在确认之前的对话内容。是的，你确实说了"你好"，这是我们对话的开始。

有什么其他我可以帮助你的吗？`;

    const messages = parseMessages(content);
    console.log("Parsed messages (real session file):", messages.length);
    messages.forEach((msg, i) => {
      console.log(`[${i}] role=${msg.role}, content="${msg.content.substring(0, 50)}..."`);
    });

    // 应该有 6 条消息
    expect(messages.length).toBe(6);
  });
});
