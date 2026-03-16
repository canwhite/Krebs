import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ref, createRef } from "lit/directives/ref.js";
import { KrebsMarkdown } from "../components/krebs-markdown.js";
import { KrebsWebSocketClient } from "../utils/websocket.js";

/**
 * 生成唯一ID（兼容性更好的版本）
 */
function generateUniqueId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "completed" | "failed";
}

/**
 * Chat Component
 * Handles message display and input
 */
@customElement("krebs-chat")
export class KrebsChat extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      min-height: 0;
      position: relative;
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-lg);
      padding-bottom: 160px;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      scroll-behavior: smooth;
      min-height: 0;
    }

    .message {
      display: flex;
      gap: var(--spacing-md);
      max-width: 800px;
      margin: 0 auto;
      width: 100%;
    }

    .message.user {
      flex-direction: row-reverse;
    }

    .message-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: var(--font-size-sm);
      flex-shrink: 0;
    }

    .message.user .message-avatar {
      background-color: var(--color-primary);
      color: white;
    }

    .message.assistant .message-avatar {
      background-color: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-border);
    }

    .message-body {
      flex: 1;
      display: flex;
      gap: 8px;
      min-width: 0;
    }

    .message-content {
      flex: 1;
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      overflow-x: auto;
      min-width: 0;
    }

    .message.user .message-content {
      background-color: var(--color-primary);
      color: white;
      border: none;
    }

    .message-content img {
      max-width: 100%;
      border-radius: var(--radius-md);
    }

    .tool-sidebar {
      width: 60px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 4px 0;
    }

    .tool-calls {
      margin-top: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .input-container {
      position: fixed;
      bottom: 0;
      left: 260px;
      right: 0;
      flex-shrink: 0;
      border-top: 1px solid var(--color-border);
      padding: var(--spacing-lg);
      background-color: var(--color-surface);
      box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);
      z-index: 100;
    }

    .connection-status {
      position: fixed;
      top: 8px;
      right: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      z-index: 200;
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
    }

    .connection-status.connected {
      color: #22c55e;
    }

    .connection-status.disconnected {
      color: #ef4444;
    }

    .connection-status.connecting {
      color: #f59e0b;
    }

    .connection-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: currentColor;
    }

    .input-wrapper {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      gap: var(--spacing-md);
      align-items: flex-end;
    }

    textarea {
      flex: 1;
      padding: var(--spacing-md);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background-color: var(--color-bg);
      color: var(--color-text);
      font-family: inherit;
      font-size: var(--font-size-md);
      resize: none;
      height: 44px;
      outline: none;
      transition: border-color 0.2s;
      overflow-y: auto;
      line-height: 1.5;
    }

    textarea:focus {
      border-color: var(--color-primary);
    }

    button.send-button {
      padding: var(--spacing-md) var(--spacing-lg);
      background-color: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
      height: 44px;
      flex-shrink: 0;
    }

    button.send-button:hover {
      background-color: var(--color-primary-hover);
    }

    button.send-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button.new-session-button {
      padding: var(--spacing-md) var(--spacing-lg);
      background-color: var(--color-surface);
      color: var(--color-text);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      height: 44px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-xs);
      white-space: nowrap;
    }

    .button-content {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .button-icon {
      font-size: var(--font-size-lg);
      font-weight: 600;
    }

    .button-label {
      font-size: var(--font-size-sm);
      font-weight: 500;
    }

    button.new-session-button:hover {
      background-color: var(--color-surface-hover);
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    button.new-session-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .typing-indicator {
      display: flex;
      gap: var(--spacing-xs);
      padding: var(--spacing-md);
    }

    .typing-indicator span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--color-text-secondary);
      animation: typing 1.4s ease-in-out infinite;
    }

    .typing-indicator span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .typing-indicator span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes typing {
      0%,
      100% {
        opacity: 0.3;
        transform: scale(0.8);
      }
      50% {
        opacity: 1;
        transform: scale(1);
      }
    }

    @media (max-width: 768px) {
      .input-container {
        left: 80px;
      }

      .message-content {
        padding: var(--spacing-sm);
      }

      .tool-sidebar {
        width: 48px;
        gap: 4px;
      }

      button.new-session-button {
        width: 36px;
        height: 36px;
        padding: var(--spacing-sm);
      }

      .button-label {
        display: none; /* 移动端只显示图标 */
      }

      .button-icon {
        font-size: var(--font-size-md);
      }
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-xl);
      text-align: center;
      animation: fade-in 0.5s ease;
    }

    @keyframes fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .empty-icon {
      font-size: 64px;
      margin-bottom: var(--spacing-lg);
      opacity: 0.8;
    }

    .empty-title {
      font-size: var(--font-size-xl);
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: var(--spacing-sm);
    }

    .empty-subtitle {
      font-size: var(--font-size-md);
      color: var(--color-text-secondary);
      margin-bottom: var(--spacing-xl);
      max-width: 400px;
      line-height: 1.6;
    }

    .empty-suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      justify-content: center;
      max-width: 500px;
    }

    .suggestion-chip {
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .suggestion-chip:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
      background: var(--color-primary-bg, rgba(0, 102, 204, 0.05));
      transform: translateY(-2px);
    }
  `;

  @state()
  private messages: Message[] = [];

  @state()
  private input = "";

  @state()
  private isSending = false;

  @state()
  private isTyping = false;

  @state()
  private currentSessionId: string | null = null;  // ✅ 改为 null，让后端自动生成

  @state()
  private isCreatingSession = false;

  @state()
  private wsConnected = false;

  @state()
  private connectionError: string | null = null;

  private wsClient: KrebsWebSocketClient | null = null;
  private currentToolCalls: Map<string, ToolCall> = new Map();
  private currentAssistantMessage: Message | null = null;

  private messagesRef = createRef<HTMLDivElement>();

  connectedCallback() {
    super.connectedCallback();
    this.connectWebSocket();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.wsClient) {
      this.wsClient.disconnect();
      this.wsConnected = false;
    }
  }

  private connectWebSocket() {
    const wsUrl = this.getWebSocketUrl();
    this.wsClient = new KrebsWebSocketClient(wsUrl);

    this.wsClient.connect({
      onConnected: (clientId) => {
        console.log('[Chat] WebSocket connected:', clientId);
        this.wsConnected = true;
      },

      onChunk: (chunk: string) => {
        this.handleStreamChunk(chunk);
      },

      onToolStart: (toolCallId, toolName, args) => {
        this.handleToolStart(toolCallId, toolName, args);
      },

      onToolStatus: (toolCallId, status) => {
        this.handleToolStatus(toolCallId, status);
      },

      onToolResult: (toolCallId, result) => {
        this.handleToolResult(toolCallId, result);
      },

      onComplete: () => {
        this.handleStreamComplete();
      },

      onError: (error) => {
        console.error('[Chat] WebSocket error:', error);
        this.isSending = false;
        this.isTyping = false;
        this.wsConnected = false;
        this.connectionError = error;
      }
    });
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = 3001;  // WebSocket 端口
    return `${protocol}//${host}:${port}/ws`;
  }

  private handleStreamChunk(chunk: string) {
    // 收到第一个 chunk 时关闭 typing indicator
    if (this.isTyping) {
      this.isTyping = false;
    }

    // 确保有当前正在生成的助手消息
    if (!this.currentAssistantMessage) {
      this.currentAssistantMessage = {
        id: generateUniqueId(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        toolCalls: []
      };
      this.messages = [...this.messages, this.currentAssistantMessage];
    }

    // 追加文本块
    this.currentAssistantMessage.content += chunk;
    this.requestUpdate();
    this.scrollToBottom();
  }

  private handleToolStart(toolCallId: string, toolName: string, args: Record<string, unknown>) {
    // 收到工具调用时关闭 typing indicator
    if (this.isTyping) {
      this.isTyping = false;
    }

    const toolCall: ToolCall = {
      id: toolCallId,
      name: toolName,
      args,
      status: "running"
    };

    this.currentToolCalls.set(toolCallId, toolCall);

    // 确保有当前消息
    if (!this.currentAssistantMessage) {
      this.currentAssistantMessage = {
        id: generateUniqueId(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        toolCalls: []
      };
      this.messages = [...this.messages, this.currentAssistantMessage];
    }

    // 更新工具调用列表
    this.currentAssistantMessage.toolCalls = [...(this.currentAssistantMessage.toolCalls || []), toolCall];
    this.requestUpdate();
    this.scrollToBottom();
  }

  private handleToolStatus(toolCallId: string, status: 'pending' | 'running' | 'completed' | 'failed') {
    const toolCall = this.currentToolCalls.get(toolCallId);
    if (toolCall) {
      toolCall.status = status;
      this.requestUpdate();
    }
  }

  private handleToolResult(toolCallId: string, result: unknown) {
    const toolCall = this.currentToolCalls.get(toolCallId);
    if (toolCall) {
      toolCall.result = result;
      toolCall.status = "completed";
      this.requestUpdate();
    }
  }

  private handleStreamComplete() {
    console.log('[Chat] Stream complete');
    this.isSending = false;
    this.isTyping = false;
    this.currentAssistantMessage = null;
    this.currentToolCalls.clear();
    this.requestUpdate();
  }

  render() {
    return html`
      <div class="connection-status ${this.wsConnected ? 'connected' : 'disconnected'}">
        <span class="connection-dot"></span>
        ${this.wsConnected ? '已连接' : '未连接'}
      </div>

      <div class="messages-container" ${ref(this.messagesRef)}>
        ${this.messages.length === 0 && !this.isTyping
          ? this.renderEmptyState()
          : html`
              ${this.messages.map(
                (msg) => html`
                  <div class="message ${msg.role}">
                    <div class="message-avatar">
                      ${msg.role === "user" ? "U" : "AI"}
                    </div>
                    ${msg.role === "user" ? html`
                      <div class="message-content">
                        ${msg.content}
                      </div>
                    ` : html`
                      <div class="message-body">
                        <div class="message-content">
                          <krebs-markdown
                            .content=${msg.content}
                            .isUser=${false}
                          ></krebs-markdown>
                        </div>
                        ${msg.toolCalls && msg.toolCalls.length > 0 
                          ? html`<div class="tool-sidebar">${this.renderToolSidebar(msg.toolCalls)}</div>` 
                          : ''}
                      </div>
                    `}
                  </div>
                `,
              )}
              ${this.isTyping
                ? html`
                    <div class="message assistant">
                      <div class="message-avatar">AI</div>
                      <div class="message-content">
                        <div class="typing-indicator">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                      </div>
                    </div>
                  `
                : ""}
            `}
      </div>

      <div class="input-container">
        <div class="input-wrapper">
          <button
            class="new-session-button"
            @click=${this.createNewSession}
            ?disabled=${this.isCreatingSession || this.isSending}
            title="新建会话"
            aria-label="新建会话"
          >
            <span class="button-content">
              <span class="button-icon"
                >${this.isCreatingSession ? "..." : "+"}</span
              >
              <span class="button-label">新建会话</span>
            </span>
          </button>
          <textarea
            placeholder="输入消息... (Shift+Enter 换行)"
            .value=${this.input}
            @input=${this.handleInput}
            @keydown=${this.handleKeyDown}
            ?disabled=${this.isSending}
          ></textarea>
          <button
            class="send-button"
            @click=${this.sendMessage}
            ?disabled=${this.isSending || !this.input.trim() || !this.wsConnected}
            title=${this.wsConnected ? "发送消息" : "等待连接..."}
          >
            ${this.isSending ? "发送中..." : "发送"}
          </button>
        </div>
      </div>
    `;
  }

  private renderEmptyState() {
    const suggestions = [
      "帮我写一个 TypeScript 函数",
      "解释什么是 RAG 技术",
      "推荐一些提高代码质量的方法",
      "帮我分析这段代码的问题",
    ];

    return html`
      <div class="empty-state">
        <div class="empty-icon">🤖</div>
        <h2 class="empty-title">你好，我是 Krebs AI 助手</h2>
        <p class="empty-subtitle">
          我可以帮你编写代码、解答问题、搜索信息。请在下方输入你的问题开始对话。
        </p>
        <div class="empty-suggestions">
          ${suggestions.map(
            (suggestion) => html`
              <div 
                class="suggestion-chip" 
                @click=${() => this.handleSuggestionClick(suggestion)}
              >
                ${suggestion}
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  private handleSuggestionClick(suggestion: string) {
    this.input = suggestion;
    this.sendMessage();
  }

  private renderToolSidebar(toolCalls: ToolCall[]) {
    return toolCalls.map(
      (tool, index) => html`
        <krebs-tool-chip
          .name=${tool.name}
          .args=${tool.args}
          .result=${tool.result}
          .status=${tool.status}
          .index=${index}
        ></krebs-tool-chip>
      `,
    );
  }

  private handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    this.input = target.value;
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  private async createNewSession() {
    if (this.isCreatingSession || this.isSending) return;

    this.isCreatingSession = true;

    try {
      const response = await fetch("/api/session/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: "default",
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.status}`);
      }

      const data = await response.json();
      const { sessionId } = data;

      // 更新当前会话ID
      this.currentSessionId = sessionId;

      // 清空消息列表
      this.messages = [];

      // 清空输入框
      this.input = "";

      // 滚动到底部
      this.scrollToBottom();

      console.log("New session created:", sessionId);
    } catch (error) {
      console.error("Failed to create session:", error);
      // 这里可以添加错误提示UI
    } finally {
      this.isCreatingSession = false;
    }
  }

  private async sendMessage() {
    if (!this.input.trim() || this.isSending) return;

    // 检查 WebSocket 连接状态
    if (!this.wsConnected && this.wsClient) {
      const connected = await this.wsClient.waitForConnection(3000);
      if (!connected) {
        console.error('[Chat] WebSocket not connected');
        return;
      }
    }

    const userMessage: Message = {
      id: generateUniqueId(),
      role: "user",
      content: this.input,
      timestamp: Date.now(),
    };

    this.messages = [...this.messages, userMessage];
    const messageToSend = this.input;
    this.input = "";
    this.isSending = true;
    this.isTyping = true;
    this.scrollToBottom();

    this.sendViaWebSocket(messageToSend);
  }

  private sendViaWebSocket(message: string) {
    if (!this.wsClient || !this.wsConnected) {
      console.error('[Chat] WebSocket not connected');
      this.isSending = false;
      this.isTyping = false;
      return;
    }

    const sessionId = this.currentSessionId || `session_${Date.now()}`;

    try {
      this.wsClient.sendChatMessage("default", sessionId, message);

      if (!this.currentSessionId) {
        this.currentSessionId = sessionId;
      }
    } catch (error) {
      console.error('[Chat] Failed to send message:', error);
      this.isSending = false;
      this.isTyping = false;
    }
  }

  private scrollToBottom() {
    // Use requestAnimationFrame for smoother scrolling
    requestAnimationFrame(() => {
      if (this.messagesRef.value) {
        this.messagesRef.value.scrollTop = this.messagesRef.value.scrollHeight;
      }
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "krebs-chat": KrebsChat;
  }
}
