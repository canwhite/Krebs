import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Tool Card Component
 * Displays a tool call with its status and result
 */
@customElement('krebs-tool-card')
export class KrebsToolCard extends LitElement {
  @property({ type: String })
  name = '';

  @property({ type: Object })
  args: Record<string, unknown> = {};

  @property({ attribute: false })
  result?: unknown;

  @property({ type: String })
  status: ToolStatus = 'pending';

  static styles = css`
    :host {
      display: block;
    }

    .tool-card {
      background-color: var(--color-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--spacing-md);
      margin-top: var(--spacing-sm);
    }

    .tool-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-sm);
    }

    .tool-name {
      font-weight: 600;
      font-size: var(--font-size-sm);
      color: var(--color-primary);
    }

    .status-badge {
      font-size: var(--font-size-xs);
      padding: 2px 8px;
      border-radius: var(--radius-sm);
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-badge.pending {
      background-color: var(--color-surface);
      color: var(--color-text-secondary);
    }

    .status-badge.running {
      background-color: var(--color-info);
      color: white;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .status-badge.completed {
      background-color: var(--color-success);
      color: white;
    }

    .status-badge.failed {
      background-color: var(--color-error);
      color: white;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.7;
      }
    }

    .tool-args {
      background-color: var(--color-surface);
      padding: var(--spacing-sm);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      font-family: 'Monaco', 'Menlo', monospace;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .tool-result {
      margin-top: var(--spacing-sm);
      padding: var(--spacing-sm);
      background-color: var(--color-surface);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-sm);
      max-height: 200px;
      overflow-y: auto;
    }

    .tool-result pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .tool-result img {
      max-width: 100%;
      border-radius: var(--radius-sm);
    }

    .expand-button {
      background: none;
      border: none;
      color: var(--color-primary);
      cursor: pointer;
      font-size: var(--font-size-xs);
      padding: 0;
      margin-top: var(--spacing-xs);
    }

    .expand-button:hover {
      text-decoration: underline;
    }
  `;

  @property({ type: Boolean })
  private expanded = false;

  render() {
    return html`
      <div class="tool-card">
        <div class="tool-header">
          <span class="tool-name">🛠️ ${this.name}</span>
          <span class="status-badge ${this.status}">${this.getStatusText()}</span>
        </div>

        ${Object.keys(this.args).length > 0
          ? html`
              <div class="tool-args">${JSON.stringify(this.args, null, 2)}</div>
            `
          : ''}

        ${this.result !== undefined
          ? html`
              <div class="tool-result">
                ${this.expanded || this.isSmallResult()
                  ? this.renderResult()
                  : html`
                      <div>
                        ${this.getPreview()}
                        <button class="expand-button" @click=${() => (this.expanded = true)}>
                          展开全部
                        </button>
                      </div>
                    `}
              </div>
            `
          : ''}
      </div>
    `;
  }

  private getStatusText(): string {
    const statusMap: Record<ToolStatus, string> = {
      pending: '等待中',
      running: '运行中',
      completed: '已完成',
      failed: '失败',
    };
    return statusMap[this.status] || this.status;
  }

  private isSmallResult(): boolean {
    if (typeof this.result === 'string') {
      return this.result.length < 500;
    }
    if (typeof this.result === 'object') {
      return JSON.stringify(this.result).length < 500;
    }
    return true;
  }

  private getPreview(): string {
    if (typeof this.result === 'string') {
      return this.result.slice(0, 200) + '...';
    }
    if (typeof this.result === 'object') {
      return JSON.stringify(this.result, null, 2).slice(0, 200) + '...';
    }
    return String(this.result);
  }

  private renderResult() {
    if (typeof this.result === 'string') {
      // Check if it's markdown code block
      const codeBlockMatch = this.result.match(/```(\w+)?\n([\s\S]+?)```/);
      if (codeBlockMatch) {
        return html`<pre><code>${codeBlockMatch[2]}</code></pre>`;
      }
      return html`<pre>${this.result}</pre>`;
    }

    if (typeof this.result === 'object') {
      return html`<pre>${JSON.stringify(this.result, null, 2)}</pre>`;
    }

    return html`<pre>${String(this.result)}</pre>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'krebs-tool-card': KrebsToolCard;
  }
}
