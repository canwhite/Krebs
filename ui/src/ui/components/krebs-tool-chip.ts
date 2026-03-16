import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export type ToolStatus = 'pending' | 'running' | 'completed' | 'failed';

@customElement('krebs-tool-chip')
export class KrebsToolChip extends LitElement {
  @property({ type: String })
  name = '';

  @property({ type: Object })
  args: Record<string, unknown> = {};

  @property({ attribute: false })
  result?: unknown;

  @property({ type: String })
  status: ToolStatus = 'pending';

  @property({ type: Number })
  index = 0;

  @state()
  private expanded = false;

  static styles = css`
    :host {
      display: block;
    }

    .chip {
      width: 52px;
      height: 52px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
    }

    .chip:hover {
      transform: scale(1.05);
      border-color: var(--color-primary);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .chip.running {
      border-color: var(--color-info);
      background: linear-gradient(135deg, var(--color-surface) 0%, rgba(59, 130, 246, 0.1) 100%);
    }

    .chip.completed {
      border-color: var(--color-success);
    }

    .chip.failed {
      border-color: var(--color-error);
    }

    .chip-icon {
      font-size: 18px;
      margin-bottom: 2px;
    }

    .chip-index {
      font-size: 9px;
      font-weight: 600;
      color: var(--color-text-secondary);
      position: absolute;
      top: 3px;
      right: 5px;
    }

    .chip-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      position: absolute;
      bottom: 4px;
      left: 50%;
      transform: translateX(-50%);
    }

    .chip-status-dot.pending {
      background: var(--color-text-secondary);
    }

    .chip-status-dot.running {
      background: var(--color-info);
      animation: pulse-dot 1s ease-in-out infinite;
    }

    .chip-status-dot.completed {
      background: var(--color-success);
    }

    .chip-status-dot.failed {
      background: var(--color-error);
    }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
      50% { opacity: 0.5; transform: translateX(-50%) scale(1.3); }
    }

    @media (max-width: 768px) {
      .chip {
        width: 40px;
        height: 40px;
        border-radius: 6px;
      }
      .chip-icon {
        font-size: 14px;
      }
      .chip-index {
        font-size: 8px;
      }
    }

    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fade-in 0.15s ease;
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .detail-panel {
      background: var(--color-surface);
      border-radius: 12px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: slide-up 0.2s ease;
    }

    @keyframes slide-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .detail-header {
      padding: 16px;
      border-bottom: 1px solid var(--color-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .detail-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 14px;
    }

    .detail-status {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .detail-status.pending { background: var(--color-surface-hover); color: var(--color-text-secondary); }
    .detail-status.running { background: var(--color-info); color: white; }
    .detail-status.completed { background: var(--color-success); color: white; }
    .detail-status.failed { background: var(--color-error); color: white; }

    .close-btn {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: var(--color-text-secondary);
      padding: 4px;
      line-height: 1;
    }

    .close-btn:hover {
      color: var(--color-text);
    }

    .detail-body {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
    }

    .detail-section {
      margin-bottom: 16px;
    }

    .detail-section:last-child {
      margin-bottom: 0;
    }

    .detail-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--color-text-secondary);
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .detail-content {
      background: var(--color-bg);
      border-radius: 6px;
      padding: 10px;
      font-size: 12px;
      font-family: 'Monaco', 'Menlo', monospace;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 150px;
      overflow-y: auto;
    }

    .detail-result {
      background: var(--color-bg);
      border-radius: 6px;
      padding: 10px;
      font-size: 12px;
      max-height: 300px;
      overflow-y: auto;
    }

    .detail-result pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
  `;

  private getToolIcon(): string {
    const icons: Record<string, string> = {
      'web_search': '🔍',
      'web_fetch': '🌐',
      'code_search': '💻',
      'bash': '⚡',
      'read': '📄',
      'write': '✏️',
      'edit': '📝',
      'default': '🔧'
    };
    return icons[this.name] || icons['default'];
  }

  private getStatusText(): string {
    const map: Record<ToolStatus, string> = {
      pending: '等待中',
      running: '运行中',
      completed: '已完成',
      failed: '失败'
    };
    return map[this.status];
  }

  render() {
    return html`
      <div class="chip ${this.status}" @click=${() => this.expanded = true}>
        <span class="chip-index">#${this.index + 1}</span>
        <span class="chip-icon">${this.getToolIcon()}</span>
        <span class="chip-status-dot ${this.status}"></span>
      </div>

      ${this.expanded ? html`
        <div class="overlay" @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.expanded = false;
        }}>
          <div class="detail-panel">
            <div class="detail-header">
              <div class="detail-title">
                <span>${this.getToolIcon()}</span>
                <span>${this.name}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="detail-status ${this.status}">${this.getStatusText()}</span>
                <button class="close-btn" @click=${() => this.expanded = false}>×</button>
              </div>
            </div>
            <div class="detail-body">
              ${Object.keys(this.args).length > 0 ? html`
                <div class="detail-section">
                  <div class="detail-label">参数</div>
                  <div class="detail-content">${JSON.stringify(this.args, null, 2)}</div>
                </div>
              ` : ''}

              ${this.result !== undefined ? html`
                <div class="detail-section">
                  <div class="detail-label">结果</div>
                  <div class="detail-result">
                    ${this.renderResult()}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }

  private renderResult() {
    if (typeof this.result === 'string') {
      const codeMatch = this.result.match(/```(\w+)?\n([\s\S]+?)```/);
      if (codeMatch) {
        return html`<pre><code>${codeMatch[2]}</code></pre>`;
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
    'krebs-tool-chip': KrebsToolChip;
  }
}
