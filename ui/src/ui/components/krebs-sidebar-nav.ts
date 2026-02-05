import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

export type TabType = 'chat' | 'tools' | 'skills';

/**
 * Sidebar Navigation Component
 * Provides tab navigation for Chat, Tools, and Skills
 */
@customElement('krebs-sidebar-nav')
export class KrebsSidebarNav extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .nav-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--spacing-md);
      gap: var(--spacing-xs);
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md) var(--spacing-lg);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all 0.2s ease;
      font-weight: 500;
      font-size: var(--font-size-md);
      color: var(--color-text-secondary);
      background-color: transparent;
      border: 2px solid transparent;
    }

    .nav-item:hover {
      background-color: var(--color-surface-hover);
      color: var(--color-text);
    }

    .nav-item.active {
      background-color: var(--color-primary);
      color: white;
      border-color: var(--color-primary);
      box-shadow: var(--shadow-md);
    }

    .nav-item.active:hover {
      background-color: var(--color-primary-hover);
    }

    .nav-icon {
      font-size: var(--font-size-xl);
      line-height: 1;
      width: 24px;
      text-align: center;
    }

    .nav-label {
      flex: 1;
    }

    .nav-badge {
      font-size: var(--font-size-xs);
      padding: 2px 8px;
      border-radius: var(--radius-sm);
      background-color: rgba(255, 255, 255, 0.2);
      font-weight: 600;
    }

    .nav-item:not(.active) .nav-badge {
      background-color: var(--color-border);
      color: var(--color-text-secondary);
    }

    .logo-section {
      padding: var(--spacing-lg) var(--spacing-md);
      border-bottom: 1px solid var(--color-border);
      margin-bottom: var(--spacing-md);
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .logo-icon {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, var(--color-primary), var(--color-info));
      border-radius: var(--radius-md);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: var(--font-size-lg);
    }

    .logo-text {
      font-size: var(--font-size-lg);
      font-weight: 600;
      color: var(--color-primary);
    }
  `;

  @state()
  private activeTab: TabType = 'chat';

  @state()
  private toolsCount = 0;

  @state()
  private skillsCount = 0;

  connectedCallback(): void {
    super.connectedCallback();
    this.loadCounts();
  }

  private async loadCounts() {
    try {
      const [toolsRes, skillsRes] = await Promise.all([
        fetch('/api/tools'),
        fetch('/api/skills')
      ]);

      if (toolsRes.ok) {
        const toolsData = await toolsRes.json();
        this.toolsCount = toolsData.tools?.length || 0;
      }

      if (skillsRes.ok) {
        const skillsData = await skillsRes.json();
        this.skillsCount = skillsData.skills?.length || 0;
      }
    } catch (error) {
      console.error('Failed to load counts:', error);
    }
  }

  private handleTabClick(tab: TabType) {
    this.activeTab = tab;

    // Dispatch custom event to notify parent
    this.dispatchEvent(
      new CustomEvent<TabType>('tab-change', {
        detail: tab,
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    return html`
      <div class="nav-container">
        <div class="logo-section">
          <div class="logo-icon">K</div>
          <div class="logo-text">Krebs AI</div>
        </div>

        <div
          class="nav-item ${this.activeTab === 'chat' ? 'active' : ''}"
          @click=${() => this.handleTabClick('chat')}
        >
          <span class="nav-icon">💬</span>
          <span class="nav-label">Chat</span>
        </div>

        <div
          class="nav-item ${this.activeTab === 'tools' ? 'active' : ''}"
          @click=${() => this.handleTabClick('tools')}
        >
          <span class="nav-icon">🔧</span>
          <span class="nav-label">Tools</span>
          ${this.toolsCount > 0
            ? html`<span class="nav-badge">${this.toolsCount}</span>`
            : ''}
        </div>

        <div
          class="nav-item ${this.activeTab === 'skills' ? 'active' : ''}"
          @click=${() => this.handleTabClick('skills')}
        >
          <span class="nav-icon">⚡</span>
          <span class="nav-label">Skills</span>
          ${this.skillsCount > 0
            ? html`<span class="nav-badge">${this.skillsCount}</span>`
            : ''}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'krebs-sidebar-nav': KrebsSidebarNav;
  }
}
