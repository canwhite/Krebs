import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

interface Tool {
  name: string;
  description: string;
  category?: string;
  parameters?: Record<string, unknown>;
}

/**
 * Tools Panel Component
 * Displays detailed information about all available tools
 */
@customElement('krebs-tools-panel')
export class KrebsToolsPanel extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
    }

    .panel-container {
      padding: var(--spacing-lg);
      max-width: 1200px;
      margin: 0 auto;
    }

    .panel-header {
      margin-bottom: var(--spacing-xl);
    }

    .panel-title {
      font-size: var(--font-size-2xl);
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: var(--spacing-sm);
    }

    .panel-description {
      font-size: var(--font-size-md);
      color: var(--color-text-secondary);
    }

    .category-section {
      margin-bottom: var(--spacing-xl);
    }

    .category-header {
      font-size: var(--font-size-lg);
      font-weight: 600;
      color: var(--color-text);
      margin-bottom: var(--spacing-md);
      padding-bottom: var(--spacing-sm);
      border-bottom: 2px solid var(--color-border);
      text-transform: capitalize;
    }

    .tools-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: var(--spacing-md);
    }

    .tool-card {
      background-color: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--spacing-lg);
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .tool-card:hover {
      border-color: var(--color-primary);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }

    .tool-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .tool-icon {
      font-size: var(--font-size-2xl);
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--color-bg);
      border-radius: var(--radius-md);
    }

    .tool-name {
      font-size: var(--font-size-lg);
      font-weight: 600;
      color: var(--color-text);
      flex: 1;
    }

    .tool-description {
      font-size: var(--font-size-md);
      color: var(--color-text-secondary);
      line-height: 1.6;
      margin-bottom: var(--spacing-md);
    }

    .tool-meta {
      display: flex;
      gap: var(--spacing-md);
      flex-wrap: wrap;
    }

    .tool-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      background-color: var(--color-bg);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
    }

    .empty-state {
      text-align: center;
      padding: var(--spacing-2xl);
      color: var(--color-text-secondary);
    }

    .empty-state-icon {
      font-size: 64px;
      margin-bottom: var(--spacing-lg);
      opacity: 0.5;
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 400px;
      color: var(--color-text-secondary);
      font-size: var(--font-size-lg);
    }

    .error {
      background-color: var(--color-error-bg);
      border: 1px solid var(--color-error);
      color: var(--color-error);
      padding: var(--spacing-lg);
      border-radius: var(--radius-lg);
      margin: var(--spacing-lg);
    }
  `;

  @state()
  private tools: Tool[] = [];

  @state()
  private loading = true;

  @state()
  private error: string | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.loadTools();
  }

  private async loadTools() {
    try {
      this.loading = true;
      const response = await fetch('/api/tools');
      if (!response.ok) throw new Error('Failed to load tools');

      const data = await response.json();
      this.tools = data.tools || [];
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Unknown error';
      console.error('Failed to load tools:', err);
    } finally {
      this.loading = false;
    }
  }

  render() {
    if (this.loading) {
      return html`<div class="loading">加载中...</div>`;
    }

    if (this.error) {
      return html`<div class="error">加载失败: ${this.error}</div>`;
    }

    if (this.tools.length === 0) {
      return html`
        <div class="empty-state">
          <div class="empty-state-icon">🔧</div>
          <p>暂无工具</p>
        </div>
      `;
    }

    // Group tools by category
    const groupedTools = this.tools.reduce((acc, tool) => {
      const category = tool.category || 'other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(tool);
      return acc;
    }, {} as Record<string, Tool[]>);

    return html`
      <div class="panel-container">
        <div class="panel-header">
          <h1 class="panel-title">工具箱</h1>
          <p class="panel-description">
            查看所有可用的AI工具及其功能说明
          </p>
        </div>

        ${Object.entries(groupedTools).map(
          ([category, tools]) => html`
            <div class="category-section">
              <h2 class="category-header">${category}</h2>
              <div class="tools-grid">
                ${tools.map(
                  (tool) => html`
                    <div class="tool-card">
                      <div class="tool-header">
                        <div class="tool-icon">🔧</div>
                        <div class="tool-name">${tool.name}</div>
                      </div>
                      <div class="tool-description">
                        ${tool.description}
                      </div>
                      ${tool.parameters
                        ? html`
                            <div class="tool-meta">
                              <span class="tool-badge">
                                ${Object.keys(tool.parameters).length} 个参数
                              </span>
                            </div>
                          `
                        : ''}
                    </div>
                  `
                )}
              </div>
            </div>
          `
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'krebs-tools-panel': KrebsToolsPanel;
  }
}
