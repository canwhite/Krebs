import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

interface Tool {
  name: string;
  description: string;
  category?: string;
}

/**
 * Tools List Component
 * Displays available tools in the sidebar
 */
@customElement('krebs-tools-list')
export class KrebsToolsList extends LitElement {
  static styles = css`
    :host {
      display: block;
    }

    .tools-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .tool-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .tool-item:hover {
      background-color: var(--color-surface-hover);
    }

    .tool-icon {
      font-size: var(--font-size-lg);
    }

    .tool-info {
      flex: 1;
      min-width: 0;
    }

    .tool-name {
      font-weight: 600;
      font-size: var(--font-size-sm);
      margin-bottom: 2px;
    }

    .tool-description {
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty-state {
      padding: var(--spacing-md);
      text-align: center;
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }

    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-lg);
      color: var(--color-text-secondary);
    }

    .category-header {
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: var(--spacing-sm) var(--spacing-md);
      margin-top: var(--spacing-sm);
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
      return html`<div class="empty-state">加载失败: ${this.error}</div>`;
    }

    if (this.tools.length === 0) {
      return html`<div class="empty-state">暂无工具</div>`;
    }

    // Group tools by category
    const groupedTools = this.tools.reduce((acc, tool) => {
      const category = tool.category || 'other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(tool);
      return acc;
    }, {} as Record<string, Tool[]>);

    return html`
      <div class="tools-list">
        ${Object.entries(groupedTools).map(
          ([category, tools]) => html`
            <div class="category-header">${category}</div>
            ${tools.map(
              (tool) => html`
                <div class="tool-item" title="${tool.description}">
                  <span class="tool-icon">🔧</span>
                  <div class="tool-info">
                    <div class="tool-name">${tool.name}</div>
                    <div class="tool-description">${tool.description}</div>
                  </div>
                </div>
              `
            )}
          `
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'krebs-tools-list': KrebsToolsList;
  }
}
