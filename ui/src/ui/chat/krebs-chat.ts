import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ref, createRef } from 'lit/directives/ref.js';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

/**
 * Chat Component
 * Handles message display and input
 */
@customElement('krebs-chat')
export class KrebsChat extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-lg);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
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

    .message-content {
      flex: 1;
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      overflow-x: auto;
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

    .message-content pre {
      background-color: var(--color-bg);
      padding: var(--spacing-md);
      border-radius: var(--radius-md);
      overflow-x: auto;
      margin: var(--spacing-sm) 0;
    }

    .message-content code {
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: var(--font-size-sm);
    }

    .tool-calls {
      margin-top: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .input-container {
      border-top: 1px solid var(--color-border);
      padding: var(--spacing-lg);
      background-color: var(--color-surface);
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
      min-height: 44px;
      max-height: 200px;
      outline: none;
      transition: border-color 0.2s;
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
    }

    button.send-button:hover {
      background-color: var(--color-primary-hover);
    }

    button.send-button:disabled {
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
      0%, 100% {
        opacity: 0.3;
        transform: scale(0.8);
      }
      50% {
        opacity: 1;
        transform: scale(1);
      }
    }
  `;

  @state()
  private messages: Message[] = [];

  @state()
  private input = '';

  @state()
  private isSending = false;

  @state()
  private isTyping = false;

  private messagesRef = createRef<HTMLDivElement>();

  render() {
    return html`
      <div class="messages-container" ${ref(this.messagesRef)}>
        ${this.messages.map(
          (msg) => html`
            <div class="message ${msg.role}">
              <div class="message-avatar">
                ${msg.role === 'user' ? 'U' : 'AI'}
              </div>
              <div class="message-content">
                ${this.renderMessageContent(msg)}
                ${msg.toolCalls ? this.renderToolCalls(msg.toolCalls) : ''}
              </div>
            </div>
          `
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
          : ''}
      </div>

      <div class="input-container">
        <div class="input-wrapper">
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
            ?disabled=${this.isSending || !this.input.trim()}
          >
            ${this.isSending ? '发送中...' : '发送'}
          </button>
        </div>
      </div>
    `;
  }

  private renderMessageContent(message: Message) {
    // Simple markdown rendering for now
    const content = message.content
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');

    return html`<div .innerHTML=${content}></div>`;
  }

  private renderToolCalls(toolCalls: ToolCall[]) {
    return html`
      <div class="tool-calls">
        ${toolCalls.map(
          (tool) => html`
            <krebs-tool-card
              .name=${tool.name}
              .args=${tool.args}
              .result=${tool.result}
              .status=${tool.status}
            ></krebs-tool-card>
          `
        )}
      </div>
    `;
  }

  private handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    this.input = target.value;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 200) + 'px';
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  private async sendMessage() {
    if (!this.input.trim() || this.isSending) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: this.input,
      timestamp: Date.now(),
    };

    this.messages = [...this.messages, userMessage];
    this.input = '';
    this.isSending = true;
    this.isTyping = true;
    this.scrollToBottom();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId: 'default',
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content || '',
        timestamp: Date.now(),
        toolCalls: data.toolCalls,
      };

      this.messages = [...this.messages, assistantMessage];
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '抱歉，发送消息时出错。请稍后重试。',
        timestamp: Date.now(),
      };
      this.messages = [...this.messages, errorMessage];
    } finally {
      this.isSending = false;
      this.isTyping = false;
      this.scrollToBottom();
    }
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.messagesRef.value) {
        this.messagesRef.value.scrollTop = this.messagesRef.value.scrollHeight;
      }
    }, 100);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'krebs-chat': KrebsChat;
  }
}
