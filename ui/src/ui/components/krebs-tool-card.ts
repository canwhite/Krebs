import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { StorageManager } from '../utils/storage.js';

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

    .api-key-section {
      margin-top: var(--spacing-sm);
      padding: var(--spacing-sm);
      background-color: var(--color-warning-bg);
      border: 1px solid var(--color-warning);
      border-radius: var(--radius-sm);
    }

    .api-key-warning {
      font-size: var(--font-size-xs);
      color: var(--color-warning);
      margin-bottom: var(--spacing-sm);
    }

    .api-key-input-wrapper {
      display: flex;
      gap: var(--spacing-xs);
      align-items: center;
    }

    .api-key-input {
      flex: 1;
      padding: var(--spacing-xs) var(--spacing-sm);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      font-family: 'Monaco', 'Menlo', monospace;
    }

    .api-key-button {
      padding: var(--spacing-xs) var(--spacing-sm);
      background-color: var(--color-primary);
      color: white;
      border: none;
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }

    .api-key-button:hover {
      background-color: var(--color-primary-hover);
    }

    .api-key-error {
      color: var(--color-error);
      font-size: var(--font-size-xs);
      margin-top: var(--spacing-xs);
    }

    .api-key-success {
      color: var(--color-success);
      font-size: var(--font-size-xs);
      margin-top: var(--spacing-xs);
    }
  `;

  @property({ type: Boolean })
  private expanded = false;

  @state()
  private showApiKeyInput = false;

  @state()
  private apiKeyInput = '';

  @state()
  private apiKeyError = '';
  @state()
  private apiKeySuccess = false;

  render() {
    const isConfigured = this.isApiKeyConfigured();

    return html`
      <div class="tool-card">
        <div class="tool-header">
          <span class="tool-name">🛠️ ${this.name}</span>
          <div style="display: flex; gap: var(--spacing-xs); align-items: center;">
            ${this.requiresApiKey() && isConfigured
              ? html`
                  <span
                    style="font-size: var(--font-size-xs); color: var(--color-success); cursor: help;"
                    title="API Key is configured"
                  >
                    🔑
                  </span>
                `
              : ''}
            <span class="status-badge ${this.status}">${this.getStatusText()}</span>
          </div>
        </div>

        ${Object.keys(this.args).length > 0
          ? html`
              <div class="tool-args">${JSON.stringify(this.args, null, 2)}</div>
            `
          : ''}

        ${this.renderApiKeySection()}

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

  private requiresApiKey(): boolean {
    // web_search 工具需要 API key
    return this.name === 'web_search';
  }

  private isApiKeyConfigured(): boolean {
    return StorageManager.isToolApiKeyConfigured(this.name);
  }

  private handleApiKeySave() {
    if (!this.apiKeyInput.trim()) {
      this.apiKeyError = 'API Key cannot be empty';
      return;
    }

    // Validate API key format
    if (this.name === 'web_search' && this.apiKeyInput.length < 10) {
      this.apiKeyError = 'API Key seems too short';
      return;
    }

    // Save to localStorage
    StorageManager.saveToolApiKey(this.name, this.apiKeyInput.trim());

    this.apiKeySuccess = true;
    this.apiKeyError = '';
    this.showApiKeyInput = false;

    // Clear success message after 2 seconds
    setTimeout(() => {
      this.apiKeySuccess = false;
    }, 2000);

    // Request update to reflect the change
    this.requestUpdate();
  }

  private renderApiKeySection() {
    if (!this.requiresApiKey()) {
      return html``;
    }

    const isConfigured = this.isApiKeyConfigured();

    if (isConfigured && !this.showApiKeyInput) {
      return html``;
    }

    return html`
      <div class="api-key-section">
        ${!isConfigured
          ? html`
              <div class="api-key-warning">
                ⚠️ This tool requires an API key to function. Please enter your API key below.
              </div>
            `
          : html`
              <div class="api-key-warning">
                Update your API key:
              </div>
            `}
        ${this.showApiKeyInput || !isConfigured
          ? html`
              <div class="api-key-input-wrapper">
                <input
                  type="password"
                  class="api-key-input"
                  placeholder="Enter your API key..."
                  .value=${this.apiKeyInput}
                  @input=${(e: Event) => {
                    const target = e.target as HTMLInputElement;
                    this.apiKeyInput = target.value;
                    this.apiKeyError = '';
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      this.handleApiKeySave();
                    }
                  }}
                />
                <button class="api-key-button" @click=${() => this.handleApiKeySave()}>
                  Save
                </button>
                ${isConfigured
                  ? html`
                      <button
                        class="api-key-button"
                        style="background-color: var(--color-text-secondary);"
                        @click=${() => {
                          this.showApiKeyInput = false;
                          this.apiKeyInput = '';
                        }}
                      >
                        Cancel
                      </button>
                    `
                  : ''}
              </div>
              ${this.apiKeyError
                ? html`
                    <div class="api-key-error">⚠️ ${this.apiKeyError}</div>
                  `
                : ''}
              ${this.apiKeySuccess
                ? html`
                    <div class="api-key-success">✓ API Key saved successfully!</div>
                  `
                : ''}
            `
          : ''}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'krebs-tool-card': KrebsToolCard;
  }
}
